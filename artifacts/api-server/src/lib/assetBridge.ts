/**
 * AssetBridge — orchestrator that unifies Replit App Storage (GCS via the
 * Replit sidecar) and Cloudflare R2 + D1.
 *
 * Responsibilities:
 *   • List assets from either store.
 *   • Diff: figure out what's only-in-GCS, only-in-R2, or mismatched.
 *   • Mirror: stream GCS objects into R2 (and update the catalog).
 *   • Catalog: keep D1 in sync (assets + asset_tags + bridge_events).
 *
 * The bridge is *catalog-aware*: when D1 is unreachable (missing scope on
 * the API token), R2/GCS operations still work, but cataloging silently
 * no-ops. The asset routes report `{ catalog: 'unavailable' }` so callers
 * know to fix their token.
 */

import type { Logger } from 'pino';
import { Storage, type Bucket } from '@google-cloud/storage';
import { R2 } from './r2Storage';
import { D1 } from './d1Client';
import { SCHEMA_STATEMENTS, assetIdFromPath } from './assetCatalogSchema';
import { logger as rootLogger } from './logger';

// ─── GCS (Replit sidecar) — same auth pattern as routes/savegame.ts ────────────

const REPLIT_SIDECAR = 'http://127.0.0.1:1106';
const gcs: Storage = new Storage({
  credentials: {
    audience:           'replit',
    subject_token_type: 'access_token',
    token_url:          `${REPLIT_SIDECAR}/token`,
    type:               'external_account',
    credential_source: {
      url:    `${REPLIT_SIDECAR}/credential`,
      format: { type: 'json', subject_token_field_name: 'access_token' },
    },
    universe_domain: 'googleapis.com',
  } as any, // eslint-disable-line @typescript-eslint/no-explicit-any
  projectId: '',
});

function gcsBucket(): Bucket {
  const id = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
  if (!id) throw new Error('[assetBridge] DEFAULT_OBJECT_STORAGE_BUCKET_ID unset');
  return gcs.bucket(id);
}

// ─── Catalog state ────────────────────────────────────────────────────────────

interface CatalogState {
  available:    boolean;
  reason?:      string;
  errorCode?:   number;
  checkedAt:    number;
}

let _catalog: CatalogState = { available: false, reason: 'not yet probed', checkedAt: 0 };

/**
 * Probe D1 and (if reachable) ensure the schema exists. Idempotent.
 * Called once at boot from index.ts and may be re-called via the
 * bridge route to retry after a token update.
 */
export async function ensureCatalog(log: Logger = rootLogger): Promise<CatalogState> {
  const probe = await D1.available();
  if (!probe.ok) {
    _catalog = {
      available:  false,
      reason:     probe.message,
      errorCode:  probe.code,
      checkedAt:  Date.now(),
    };
    log.warn(
      { status: probe.status, code: probe.code, reason: probe.message },
      '[assetBridge] D1 catalog unavailable — bridge will run in storage-only mode',
    );
    return _catalog;
  }
  try {
    for (const sql of SCHEMA_STATEMENTS) {
      await D1.query(sql);
    }
    _catalog = { available: true, checkedAt: Date.now() };
    log.info('[assetBridge] D1 catalog ready (schema ensured)');
  } catch (e) {
    _catalog = {
      available: false,
      reason:    `schema bootstrap failed: ${(e as Error).message}`,
      checkedAt: Date.now(),
    };
    log.error({ err: e }, '[assetBridge] failed to ensure catalog schema');
  }
  return _catalog;
}

export function catalogState(): CatalogState {
  return _catalog;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BridgeListEntry {
  key:           string;
  size:          number;
  contentType?:  string;
  lastModified?: string;
}

export interface BridgeAssetRow {
  id:            string;
  path:          string;
  source:        'gcs' | 'r2' | 'both';
  gcs_bucket:    string | null;
  gcs_key:       string | null;
  r2_bucket:     string | null;
  r2_key:        string | null;
  content_type:  string | null;
  size_bytes:    number | null;
  sha256:        string | null;
  width:         number | null;
  height:        number | null;
  duration_ms:   number | null;
  public_url:    string | null;
  metadata_json: string | null;
  created_at:    number;
  updated_at:    number;
}

export interface DiffResult {
  onlyInGcs:    BridgeListEntry[];
  onlyInR2:     BridgeListEntry[];
  bothMatching: number;
  conflicting:  Array<{ key: string; gcsSize: number; r2Size: number }>;
}

export interface MirrorOptions {
  prefix?:        string;
  /** Hard cap on number of objects mirrored in one call. Default 200. */
  maxObjects?:    number;
  /** Skip if R2 already has the same key with the same size. Default true. */
  skipIfPresent?: boolean;
  /** R2 bucket to mirror into. Defaults to R2.buckets.objectstore() */
  r2Bucket?:      string;
}

export interface MirrorResult {
  mirrored: number;
  skipped:  number;
  failed:   Array<{ key: string; error: string }>;
}

// ─── Storage listings ─────────────────────────────────────────────────────────

/** List GCS keys (Replit App Storage) under prefix. */
export async function listGcs(prefix?: string, maxResults = 1000): Promise<BridgeListEntry[]> {
  const [files] = await gcsBucket().getFiles({ prefix, maxResults });
  return files.map(f => ({
    key:          f.name,
    size:         Number(f.metadata.size ?? 0),
    contentType:  f.metadata.contentType ?? undefined,
    lastModified: typeof f.metadata.updated === 'string' ? f.metadata.updated : undefined,
  }));
}

/** List R2 keys under prefix in the given bucket (defaults to objectstore bucket).
 * Pages through results internally; `maxResults` acts as a safety cap. */
export async function listR2(prefix?: string, bucket?: string, maxResults = 1000): Promise<BridgeListEntry[]> {
  const b = bucket ?? R2.buckets.objectstore();
  const entries = await R2.listAll(b, prefix, maxResults);
  return entries.map(e => ({
    key:          e.key,
    size:         e.size,
    lastModified: e.lastModified,
  }));
}

// ─── Diff ─────────────────────────────────────────────────────────────────────

export async function diff(prefix?: string, r2Bucket?: string): Promise<DiffResult> {
  const [gcsList, r2List] = await Promise.all([
    listGcs(prefix, 5000),
    listR2(prefix, r2Bucket, 5000),
  ]);
  const gcsMap = new Map(gcsList.map(e => [e.key, e]));
  const r2Map  = new Map(r2List.map(e => [e.key, e]));

  const onlyInGcs: BridgeListEntry[] = [];
  const onlyInR2:  BridgeListEntry[] = [];
  const conflicting: Array<{ key: string; gcsSize: number; r2Size: number }> = [];
  let bothMatching = 0;

  for (const [k, g] of gcsMap) {
    const r = r2Map.get(k);
    if (!r) onlyInGcs.push(g);
    else if (g.size !== r.size) conflicting.push({ key: k, gcsSize: g.size, r2Size: r.size });
    else bothMatching++;
  }
  for (const [k, r] of r2Map) {
    if (!gcsMap.has(k)) onlyInR2.push(r);
  }
  return { onlyInGcs, onlyInR2, bothMatching, conflicting };
}

// ─── Mirror GCS → R2 ──────────────────────────────────────────────────────────

export async function mirrorGcsToR2(opts: MirrorOptions = {}): Promise<MirrorResult> {
  const r2Bucket      = opts.r2Bucket   ?? R2.buckets.objectstore();
  const max           = opts.maxObjects ?? 200;
  const skipIfPresent = opts.skipIfPresent ?? true;

  const [files] = await gcsBucket().getFiles({ prefix: opts.prefix, maxResults: max });

  const result: MirrorResult = { mirrored: 0, skipped: 0, failed: [] };

  for (const file of files) {
    const key = file.name;
    try {
      if (skipIfPresent) {
        const existing = await R2.head(r2Bucket, key);
        const gcsSize  = Number(file.metadata.size ?? 0);
        if (existing && existing.size === gcsSize) {
          result.skipped++;
          continue;
        }
      }
      // Stream GCS → R2 multipart so memory stays bounded regardless of file size.
      const gcsStream = file.createReadStream();
      await R2.putStream(r2Bucket, key, gcsStream, file.metadata.contentType ?? undefined);
      await catalogUpsert({
        path:        key,
        gcsBucket:   gcsBucket().name,
        gcsKey:      key,
        r2Bucket,
        r2Key:       key,
        contentType: file.metadata.contentType ?? null,
        sizeBytes:   Number(file.metadata.size ?? 0),
      });
      result.mirrored++;
    } catch (e) {
      result.failed.push({ key, error: (e as Error).message });
    }
  }
  await recordEvent('mirror.gcs_to_r2', null, { ...opts, ...result }, result.failed.length === 0);
  return result;
}

// ─── Catalog (D1) write helpers ───────────────────────────────────────────────

export async function catalogUpsert(args: {
  path:         string;
  gcsBucket?:   string | null;
  gcsKey?:      string | null;
  r2Bucket?:    string | null;
  r2Key?:       string | null;
  contentType?: string | null;
  sizeBytes?:   number | null;
  sha256?:      string | null;
  publicUrl?:   string | null;
  metadata?:    Record<string, unknown> | null;
}): Promise<{ id: string; ok: boolean; reason?: string }> {
  if (!_catalog.available) return { id: assetIdFromPath(args.path), ok: false, reason: _catalog.reason };
  const id  = assetIdFromPath(args.path);
  const now = Date.now();
  const source: 'gcs' | 'r2' | 'both' =
    args.gcsKey && args.r2Key ? 'both' :
    args.r2Key                ? 'r2'   :
    args.gcsKey               ? 'gcs'  :
    /* fallback */              'r2';

  await D1.exec(
    `INSERT INTO gn_assets (id, path, source, gcs_bucket, gcs_key, r2_bucket, r2_key,
                         content_type, size_bytes, sha256, public_url, metadata_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       source        = excluded.source,
       gcs_bucket    = COALESCE(excluded.gcs_bucket,   gn_assets.gcs_bucket),
       gcs_key       = COALESCE(excluded.gcs_key,      gn_assets.gcs_key),
       r2_bucket     = COALESCE(excluded.r2_bucket,    gn_assets.r2_bucket),
       r2_key        = COALESCE(excluded.r2_key,       gn_assets.r2_key),
       content_type  = COALESCE(excluded.content_type, gn_assets.content_type),
       size_bytes    = COALESCE(excluded.size_bytes,   gn_assets.size_bytes),
       sha256        = COALESCE(excluded.sha256,       gn_assets.sha256),
       public_url    = COALESCE(excluded.public_url,   gn_assets.public_url),
       metadata_json = COALESCE(excluded.metadata_json, gn_assets.metadata_json),
       updated_at    = excluded.updated_at`,
    [
      id, args.path, source,
      args.gcsBucket ?? null, args.gcsKey ?? null,
      args.r2Bucket  ?? null, args.r2Key  ?? null,
      args.contentType ?? null, args.sizeBytes ?? null,
      args.sha256 ?? null, args.publicUrl ?? null,
      args.metadata ? JSON.stringify(args.metadata) : null,
      now, now,
    ],
  );
  return { id, ok: true };
}

export async function catalogTag(id: string, addTags: string[] = [], removeTags: string[] = []): Promise<void> {
  if (!_catalog.available) throw new Error(`catalog unavailable: ${_catalog.reason}`);
  for (const t of addTags) {
    await D1.exec(`INSERT OR IGNORE INTO gn_asset_tags (asset_id, tag) VALUES (?, ?)`, [id, t]);
  }
  for (const t of removeTags) {
    await D1.exec(`DELETE FROM gn_asset_tags WHERE asset_id = ? AND tag = ?`, [id, t]);
  }
  await D1.exec(`UPDATE gn_assets SET updated_at = ? WHERE id = ?`, [Date.now(), id]);
}

export async function catalogList(filter: { source?: string; tag?: string; q?: string; limit?: number; offset?: number } = {}): Promise<{
  rows: Array<BridgeAssetRow & { tags: string[] }>;
  total: number;
}> {
  if (!_catalog.available) return { rows: [], total: 0 };
  const where: string[] = [];
  const params: unknown[] = [];
  if (filter.source) { where.push(`a.source = ?`); params.push(filter.source); }
  if (filter.q) { where.push(`a.path LIKE ?`); params.push(`%${filter.q}%`); }
  if (filter.tag) {
    where.push(`a.id IN (SELECT asset_id FROM gn_asset_tags WHERE tag = ?)`);
    params.push(filter.tag);
  }
  const wsql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const limit  = Math.min(Math.max(1, filter.limit  ?? 50),  500);
  const offset = Math.max(0, filter.offset ?? 0);

  const rowsRaw = await D1.rows<BridgeAssetRow>(
    `SELECT * FROM gn_assets a ${wsql} ORDER BY a.updated_at DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );
  const totalRow = await D1.one<{ n: number }>(`SELECT COUNT(*) AS n FROM gn_assets a ${wsql}`, params);

  // Hydrate tags in a single batch query (avoids N+1).
  const tagsByAsset = new Map<string, string[]>();
  if (rowsRaw.length > 0) {
    const placeholders = rowsRaw.map(() => '?').join(',');
    const tagRows = await D1.rows<{ asset_id: string; tag: string }>(
      `SELECT asset_id, tag FROM gn_asset_tags WHERE asset_id IN (${placeholders}) ORDER BY tag`,
      rowsRaw.map(r => r.id),
    );
    for (const tr of tagRows) {
      const arr = tagsByAsset.get(tr.asset_id) ?? [];
      arr.push(tr.tag);
      tagsByAsset.set(tr.asset_id, arr);
    }
  }
  const rowsWithTags = rowsRaw.map(r => ({ ...r, tags: tagsByAsset.get(r.id) ?? [] }));
  return { rows: rowsWithTags, total: totalRow?.n ?? 0 };
}

export async function catalogGet(id: string): Promise<(BridgeAssetRow & { tags: string[] }) | null> {
  if (!_catalog.available) return null;
  const row = await D1.one<BridgeAssetRow>(`SELECT * FROM gn_assets WHERE id = ?`, [id]);
  if (!row) return null;
  const tags = await D1.rows<{ tag: string }>(
    `SELECT tag FROM gn_asset_tags WHERE asset_id = ? ORDER BY tag`, [id],
  );
  return { ...row, tags: tags.map(t => t.tag) };
}

export async function catalogDelete(id: string): Promise<void> {
  if (!_catalog.available) throw new Error(`catalog unavailable: ${_catalog.reason}`);
  await D1.exec(`DELETE FROM gn_asset_tags WHERE asset_id = ?`, [id]);
  await D1.exec(`DELETE FROM gn_assets WHERE id = ?`, [id]);
}

async function recordEvent(op: string, assetId: string | null, payload: unknown, ok: boolean, error?: string): Promise<void> {
  if (!_catalog.available) return;
  try {
    await D1.exec(
      `INSERT INTO gn_bridge_events (op, asset_id, payload, ok, error, occurred_at) VALUES (?, ?, ?, ?, ?, ?)`,
      [op, assetId, JSON.stringify(payload), ok ? 1 : 0, error ?? null, Date.now()],
    );
  } catch {
    // never let event-logging break the operation
  }
}

// ─── Direct R2 access helpers (re-export for routes) ──────────────────────────

export const r2 = R2;
