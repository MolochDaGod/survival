/**
 * Asset Studio catalog cache.
 *
 * Goal: serve `/api/assets/studio/catalog` in well under 1 second even on a
 * cold request, despite R2 holding ~31k objects (a full listAll is ~20 s).
 *
 * Strategy (stale-while-revalidate, three layers):
 *   1. In-memory cache   – fastest path, lost on process restart.
 *   2. R2 JSON snapshot  – survives restarts; used to warm memory at boot
 *                          and as a fallback when memory is empty.
 *   3. Live R2 listAll   – the source of truth, only run from a background
 *                          refresh task — never inline on a user request
 *                          (except the very first request when no snapshot
 *                          and no cache exist yet).
 *
 * Freshness:
 *   FRESH_TTL_MS         – above this age, the next request triggers a
 *                          background SWR rebuild while serving cache.
 *   REFRESH_INTERVAL_MS  – a server-side timer also rebuilds on a fixed
 *                          cadence so the index keeps up with new uploads
 *                          even if no one is hitting the endpoint.
 *
 * The snapshot lives in the assets bucket under a hidden prefix that we
 * filter out of the listing so it never appears in the gallery itself.
 */

import type { Logger } from "pino";
import { R2 } from "./r2Storage.js";

export type StudioKind = "model" | "texture" | "vfx" | "audio" | "other";

export interface StudioAsset {
  key: string;
  filename: string;
  ext: string;
  size: number;
  lastModified: string;
  contentType: string;
  publicUrl: string | null;
  kind: StudioKind;
}

export interface StudioGroup {
  kind: StudioKind;
  label: string;
  count: number;
  totalBytes: number;
  assets: StudioAsset[];
}

export interface StudioCatalog {
  generatedAt: string;
  bucket: string;
  publicUrlBase: string | null;
  totalCount: number;
  totalBytes: number;
  truncated: boolean;
  groups: StudioGroup[];
}

const GROUP_ORDER: StudioKind[] = ["model", "texture", "vfx", "audio", "other"];

const GROUP_LABEL: Record<StudioKind, string> = {
  model: "3D Models",
  texture: "Textures & Images",
  vfx: "VFX & Video",
  audio: "Audio",
  other: "Other",
};

/** Hidden key inside the assets bucket that holds the persisted snapshot. */
const SNAPSHOT_KEY = "_studio/catalog.json";

const FRESH_TTL_MS        = 5 * 60 * 1000;   // 5 min: serve cached without refresh
const REFRESH_INTERVAL_MS = 10 * 60 * 1000;  // 10 min: scheduled rebuild cadence
const SAFETY_CAP          = 50_000;

function classify(ext: string): StudioKind {
  switch (ext) {
    case "glb": case "gltf": case "fbx": case "obj": case "dae":
    case "3ds": case "stl": case "ply": case "blend": case "x":
    case "ms3d": case "lwo": case "md5mesh":
      return "model";
    case "png": case "jpg": case "jpeg": case "webp": case "ktx2":
    case "avif": case "bmp": case "tiff": case "tif": case "gif": case "svg":
      return "texture";
    case "webm": case "mp4": case "mov": case "vfx":
    case "json":
      return "vfx";
    case "mp3": case "wav": case "ogg": case "flac": case "m4a": case "aac":
      return "audio";
    default:
      return "other";
  }
}

function guessContentType(ext: string): string {
  switch (ext) {
    case "glb": return "model/gltf-binary";
    case "gltf": return "model/gltf+json";
    case "fbx": case "obj": case "dae": case "3ds": case "stl":
    case "ply": case "blend":
      return "application/octet-stream";
    case "png": return "image/png";
    case "jpg": case "jpeg": return "image/jpeg";
    case "webp": return "image/webp";
    case "avif": return "image/avif";
    case "gif": return "image/gif";
    case "svg": return "image/svg+xml";
    case "bmp": return "image/bmp";
    case "tif": case "tiff": return "image/tiff";
    case "ktx2": return "image/ktx2";
    case "webm": return "video/webm";
    case "mp4": return "video/mp4";
    case "mov": return "video/quicktime";
    case "mp3": return "audio/mpeg";
    case "wav": return "audio/wav";
    case "ogg": return "audio/ogg";
    case "flac": return "audio/flac";
    case "m4a": case "aac": return "audio/aac";
    case "json": return "application/json";
    case "txt": return "text/plain";
    default: return "application/octet-stream";
  }
}

function extOf(key: string): string {
  const dot = key.lastIndexOf(".");
  if (dot < 0) return "";
  if (dot < key.lastIndexOf("/")) return "";
  return key.slice(dot + 1).toLowerCase();
}

function filenameOf(key: string): string {
  const slash = key.lastIndexOf("/");
  return slash < 0 ? key : key.slice(slash + 1);
}

interface CacheState {
  catalog: StudioCatalog;
  /** Wall-clock ms when the catalog was rebuilt from R2. */
  builtAt: number;
}

let cache: CacheState | null = null;
let refreshing: Promise<StudioCatalog> | null = null;
let bootstrapped = false;
let refreshTimer: ReturnType<typeof setInterval> | null = null;
/** Counters for cheap observability — exposed via getCacheStats(). */
const stats = { hits: 0, swrTriggers: 0, coldBuilds: 0, scheduledBuilds: 0 };

function ageMs(): number {
  return cache ? Date.now() - cache.builtAt : Number.POSITIVE_INFINITY;
}

/**
 * Build the catalog from a fresh R2 listAll. This is the slow path
 * (~20 s on a 31k-object bucket); only ever called from background refresh
 * or the initial bootstrap when no snapshot exists.
 */
async function buildFromR2(log: Logger): Promise<StudioCatalog> {
  const bucket = R2.buckets.assets();
  const t0 = Date.now();
  const entries = await R2.listAll(bucket, undefined, SAFETY_CAP);
  const listMs = Date.now() - t0;

  const publicUrlBase =
    process.env.OBJECT_STORAGE_PUBLIC_URL ||
    process.env.OBJECT_STORAGE_PUBLIC_R2_URL ||
    null;

  const buckets = new Map<StudioKind, StudioAsset[]>();
  for (const k of GROUP_ORDER) buckets.set(k, []);

  let totalBytes = 0;
  for (const e of entries) {
    if (!e.key || e.key.endsWith("/")) continue;
    // Hide the snapshot file itself from the gallery.
    if (e.key === SNAPSHOT_KEY) continue;
    const ext = extOf(e.key);
    const kind = classify(ext);
    buckets.get(kind)!.push({
      key: e.key,
      filename: filenameOf(e.key),
      ext,
      size: e.size,
      lastModified: e.lastModified,
      contentType: guessContentType(ext),
      publicUrl: R2.publicUrlFor(e.key),
      kind,
    });
    totalBytes += e.size;
  }

  for (const list of buckets.values()) {
    list.sort((a, b) => (a.lastModified < b.lastModified ? 1 : -1));
  }

  const groups: StudioGroup[] = GROUP_ORDER.map((kind) => {
    const assets = buckets.get(kind)!;
    return {
      kind,
      label: GROUP_LABEL[kind],
      count: assets.length,
      totalBytes: assets.reduce((s, a) => s + a.size, 0),
      assets,
    };
  });

  const totalCount = groups.reduce((s, g) => s + g.count, 0);

  const catalog: StudioCatalog = {
    generatedAt: new Date().toISOString(),
    bucket,
    publicUrlBase,
    totalCount,
    totalBytes,
    truncated: entries.length >= SAFETY_CAP,
    groups,
  };

  log.info(
    { listMs, totalCount, totalBytes, truncated: catalog.truncated },
    "[asset-studio] rebuilt catalog from R2",
  );

  // Persist to R2 so the next process can boot warm. Best-effort; never
  // let a snapshot write break the in-memory result.
  try {
    await R2.put(
      bucket,
      SNAPSHOT_KEY,
      Buffer.from(JSON.stringify(catalog)),
      "application/json",
    );
  } catch (e) {
    log.warn({ err: e }, "[asset-studio] failed to persist snapshot");
  }

  return catalog;
}

async function loadSnapshot(log: Logger): Promise<StudioCatalog | null> {
  let bucket: string;
  try {
    bucket = R2.buckets.assets();
  } catch {
    return null;
  }
  try {
    const got = await R2.getStream(bucket, SNAPSHOT_KEY);
    if (!got) return null;
    const chunks: Buffer[] = [];
    for await (const c of got.stream) {
      chunks.push(c instanceof Buffer ? c : Buffer.from(c));
    }
    const text = Buffer.concat(chunks).toString("utf8");
    const parsed = JSON.parse(text) as StudioCatalog;
    if (!parsed || !Array.isArray(parsed.groups)) return null;
    return parsed;
  } catch (e) {
    log.warn({ err: e }, "[asset-studio] failed to load snapshot");
    return null;
  }
}

/**
 * Kick off a refresh. Coalesces concurrent callers onto one in-flight build.
 * Errors are logged but never rethrown to background callers.
 */
function startRefresh(log: Logger, reason: "cold" | "swr" | "scheduled" = "swr"): Promise<StudioCatalog> {
  if (refreshing) return refreshing;
  if (reason === "cold") stats.coldBuilds += 1;
  else if (reason === "swr") stats.swrTriggers += 1;
  else stats.scheduledBuilds += 1;
  refreshing = (async () => {
    try {
      const catalog = await buildFromR2(log);
      cache = { catalog, builtAt: Date.now() };
      return catalog;
    } finally {
      refreshing = null;
    }
  })();
  refreshing.catch((e) => {
    log.error({ err: e, reason }, "[asset-studio] background refresh failed");
  });
  return refreshing;
}

/**
 * Boot the cache. Tries to warm in-memory state from the persisted R2
 * snapshot first (sub-second) and falls back to a full rebuild if there is
 * no snapshot. Runs in the background — never blocks the boot path.
 */
export async function bootstrapStudioCatalog(log: Logger): Promise<void> {
  if (bootstrapped) return;
  bootstrapped = true;
  try {
    const snap = await loadSnapshot(log);
    if (snap) {
      // Treat the snapshot's generatedAt as the build time so SWR triggers
      // appropriately if it's already aged out from a long process gap.
      const builtAt = Date.parse(snap.generatedAt);
      cache = {
        catalog: snap,
        builtAt: Number.isFinite(builtAt) ? builtAt : Date.now(),
      };
      log.info(
        { totalCount: snap.totalCount, ageMs: ageMs() },
        "[asset-studio] warmed cache from snapshot",
      );
      // If the snapshot is stale, refresh in the background.
      if (ageMs() > FRESH_TTL_MS) startRefresh(log, "swr");
    } else {
      log.info("[asset-studio] no snapshot found; building cold");
      await startRefresh(log, "cold");
    }
  } catch (e) {
    log.error({ err: e }, "[asset-studio] bootstrap failed");
  } finally {
    // Scheduled rebuild keeps the index fresh even when no one is hitting
    // the endpoint. unref() so it never holds the event loop open.
    if (!refreshTimer) {
      refreshTimer = setInterval(() => {
        startRefresh(log, "scheduled");
      }, REFRESH_INTERVAL_MS);
      if (typeof refreshTimer.unref === "function") refreshTimer.unref();
    }
  }
}

/**
 * Get the current catalog. Always non-blocking once the cache has any
 * value. Returns:
 *   - cached payload if present (triggering an SWR refresh if stale);
 *   - null if the cache is still empty (caller should fall back to a
 *     synchronous build).
 */
export function getCachedCatalog(log: Logger): StudioCatalog | null {
  if (!cache) return null;
  stats.hits += 1;
  const age = ageMs();
  if (age > FRESH_TTL_MS) {
    // Past freshness window: kick off SWR, still serve cache.
    startRefresh(log, "swr");
  }
  return cache.catalog;
}

/** Lightweight counters for cache hit / cold-build observability. */
export function getCacheStats(): {
  hits: number;
  swrTriggers: number;
  coldBuilds: number;
  scheduledBuilds: number;
  ageMs: number | null;
  hasCache: boolean;
} {
  return {
    ...stats,
    ageMs: cache ? ageMs() : null,
    hasCache: !!cache,
  };
}

/**
 * Force a synchronous build. Only used as a last resort when the cache is
 * empty (e.g., bootstrap hasn't finished yet on the very first request
 * after a cold start with no snapshot).
 */
export async function forceBuild(log: Logger): Promise<StudioCatalog> {
  return startRefresh(log, "cold");
}

/** For tests / admin endpoints — clears in-memory state. */
export function _resetForTests(): void {
  cache = null;
  refreshing = null;
  bootstrapped = false;
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
  stats.hits = 0;
  stats.swrTriggers = 0;
  stats.coldBuilds = 0;
  stats.scheduledBuilds = 0;
}
