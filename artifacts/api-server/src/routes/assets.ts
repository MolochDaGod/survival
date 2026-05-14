/**
 * Asset bridge routes — unified API for Replit App Storage (GCS) + Cloudflare R2,
 * cataloged in Cloudflare D1.
 *
 * Mounted under /api by the parent router, so all paths below are relative.
 *
 * Status:
 *   GET    /assets/bridge/status              – health + which stores are reachable
 *   POST   /assets/bridge/ensure-catalog      – retry D1 schema bootstrap (idempotent)
 *
 * Listings (read-through to the storage backends, no D1 needed):
 *   GET    /assets/storage/r2?bucket=&prefix= – paginated R2 listing
 *   GET    /assets/storage/gcs?prefix=        – Replit App Storage listing
 *   GET    /assets/storage/r2/buckets         – which R2 buckets the bridge knows
 *
 * Catalog (D1-backed; degrades gracefully when D1 is unreachable):
 *   GET    /assets                            – list/search catalog rows
 *   GET    /assets/:id                        – fetch one row + presigned R2 GET
 *   POST   /assets/upload                     – mint presigned R2 PUT URL
 *   POST   /assets/upload/complete            – finalize catalog row after PUT
 *   PUT    /assets/:id/tags                   – add/remove tags
 *   DELETE /assets/:id?from=both|gcs|r2       – delete from store(s) + catalog
 *
 * Bridge ops:
 *   POST   /assets/bridge/diff                – diff GCS vs R2 under prefix
 *   POST   /assets/bridge/sync                – mirror GCS → R2 (with optional dryRun)
 */

import { Router } from 'express';
import { z } from 'zod';
import { R2 } from '../lib/r2Storage';
import {
  ensureCatalog,
  catalogState,
  catalogUpsert,
  catalogTag,
  catalogList,
  catalogGet,
  catalogDelete,
  diff,
  mirrorGcsToR2,
  listGcs,
  listR2,
} from '../lib/assetBridge';
import { assetIdFromPath } from '../lib/assetCatalogSchema';
import { ObjectStorageService, ObjectNotFoundError } from '../lib/objectStorage';
import { requireAdmin } from '../lib/adminAuth';
import {
  convertToGlb,
  isConvertibleSourceExt,
  withGlbExtension,
  extFromPath,
} from '../lib/assetConverter';

const router: Router = Router();

// ── helpers ──────────────────────────────────────────────────────────────────
function bad(res: import('express').Response, msg: string, status = 400) {
  res.status(status).json({ error: msg });
}

// ── status / catalog control ─────────────────────────────────────────────────

router.get('/assets/bridge/status', async (req, res) => {
  const cat = catalogState();
  // Probe R2 by listing 1 key — cheap.
  let r2 = { ok: false, error: '' };
  try {
    await R2.list(R2.buckets.assets(), undefined, { maxKeys: 1 });
    r2 = { ok: true, error: '' };
  } catch (e) {
    r2 = { ok: false, error: (e as Error).message };
  }
  // GCS probe via a tiny list
  let gcs = { ok: false, error: '' };
  try {
    await listGcs(undefined, 1);
    gcs = { ok: true, error: '' };
  } catch (e) {
    gcs = { ok: false, error: (e as Error).message };
  }

  res.json({
    catalog: cat,
    r2: {
      ...r2,
      buckets: {
        assets:      tryEnv(() => R2.buckets.assets()),
        objectstore: tryEnv(() => R2.buckets.objectstore()),
      },
      publicUrl: process.env.OBJECT_STORAGE_PUBLIC_URL || process.env.OBJECT_STORAGE_PUBLIC_R2_URL || null,
    },
    gcs: {
      ...gcs,
      bucket: process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID ?? null,
    },
  });
});

router.post('/assets/bridge/ensure-catalog', requireAdmin, async (req, res) => {
  const state = await ensureCatalog(req.log);
  res.json(state);
});

// Backfill catalog from storage: scan R2 (assets + objectstore) + GCS and
// upsert a row for each key. Idempotent. Optional `prefix` narrows the scan.
router.post('/assets/bridge/backfill', requireAdmin, async (req, res) => {
  if (!catalogState().available) {
    return bad(res, 'D1 catalog unavailable', 503);
  }
  const prefix = typeof req.body?.prefix === 'string' && req.body.prefix.length > 0
    ? String(req.body.prefix)
    : undefined;
  const cap = Math.min(50_000, Number(req.body?.cap) || 25_000);
  try {
    const r2AssetsBucket = R2.buckets.assets();
    const r2ObjBucket    = R2.buckets.objectstore();
    const scanWarnings: string[] = [];
    const safeList = async <T>(label: string, p: Promise<T[]>): Promise<T[]> => {
      try { return await p; }
      catch (e) {
        scanWarnings.push(`${label}: ${(e as Error).message}`);
        return [];
      }
    };
    const [r2A, r2O, gcsList] = await Promise.all([
      safeList('r2-assets',     listR2(prefix, r2AssetsBucket, cap)),
      safeList('r2-objectstore', listR2(prefix, r2ObjBucket,   cap)),
      safeList('gcs',           listGcs(prefix, cap)),
    ]);
    type Acc = {
      gcsKey?:    string; gcsBucket?: string;
      r2Key?:     string; r2Bucket?:  string;
      sizeBytes?: number; contentType?: string;
    };
    const byKey = new Map<string, Acc>();
    for (const e of r2A) {
      const cur = byKey.get(e.key) ?? {};
      cur.r2Key = e.key; cur.r2Bucket = r2AssetsBucket;
      cur.sizeBytes = cur.sizeBytes ?? e.size;
      cur.contentType = cur.contentType ?? e.contentType;
      byKey.set(e.key, cur);
    }
    for (const e of r2O) {
      const cur = byKey.get(e.key) ?? {};
      if (!cur.r2Key) { cur.r2Key = e.key; cur.r2Bucket = r2ObjBucket; }
      cur.sizeBytes = cur.sizeBytes ?? e.size;
      cur.contentType = cur.contentType ?? e.contentType;
      byKey.set(e.key, cur);
    }
    for (const e of gcsList) {
      const cur = byKey.get(e.key) ?? {};
      cur.gcsKey = e.key; cur.gcsBucket = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID ?? undefined;
      cur.sizeBytes = cur.sizeBytes ?? e.size;
      cur.contentType = cur.contentType ?? e.contentType;
      byKey.set(e.key, cur);
    }
    let ok = 0; let failed = 0;
    const failures: Array<{ path: string; error: string }> = [];
    for (const [path, v] of byKey) {
      try {
        const result = await catalogUpsert({
          path,
          gcsBucket: v.gcsBucket ?? null,
          gcsKey:    v.gcsKey ?? null,
          r2Bucket:  v.r2Bucket ?? null,
          r2Key:     v.r2Key ?? null,
          contentType: v.contentType ?? null,
          sizeBytes:   v.sizeBytes ?? null,
          publicUrl:   v.r2Key ? R2.publicUrlFor(v.r2Key) : null,
        });
        if (result.ok) ok++;
        else { failed++; failures.push({ path, error: result.reason ?? 'unknown' }); }
      } catch (err) {
        failed++;
        const msg = (err as Error).message ?? String(err);
        failures.push({ path, error: msg });
        req.log.warn({ path, err: msg }, '[assets] backfill upsert failed');
      }
    }
    res.json({
      scanned: byKey.size,
      upserted: ok,
      failed,
      // Cap the failure list so a fully-broken backfill doesn't return MBs of JSON.
      failures: failures.slice(0, 25),
      scanWarnings,
    });
  } catch (e) {
    req.log.error({ err: e }, '[assets] backfill failed');
    bad(res, (e as Error).message, 500);
  }
});

// ── raw storage listings (don't require D1) ──────────────────────────────────

router.get('/assets/storage/r2/buckets', requireAdmin, (_req, res) => {
  res.json({
    buckets: {
      assets:      tryEnv(() => R2.buckets.assets()),
      objectstore: tryEnv(() => R2.buckets.objectstore()),
    },
  });
});

const r2ListQuery = z.object({
  bucket: z.enum(['assets', 'objectstore']).optional().default('assets'),
  prefix: z.string().optional(),
  cursor: z.string().optional(),
  limit:  z.coerce.number().int().min(1).max(1000).optional().default(100),
});

router.get('/assets/storage/r2', requireAdmin, async (req, res) => {
  const parsed = r2ListQuery.safeParse(req.query);
  if (!parsed.success) return bad(res, parsed.error.message);
  const { bucket, prefix, cursor, limit } = parsed.data;
  const bname = bucket === 'objectstore' ? R2.buckets.objectstore() : R2.buckets.assets();
  try {
    const page = await R2.list(bname, prefix, { maxKeys: limit, continuationToken: cursor });
    res.json({
      bucket: bname,
      prefix: prefix ?? null,
      entries: page.entries.map(e => ({
        ...e,
        url: R2.publicUrlFor(e.key),
      })),
      nextCursor:  page.nextToken ?? null,
      isTruncated: page.isTruncated,
    });
  } catch (e) {
    req.log.error({ err: e, bucket: bname }, '[assets] r2 list failed');
    bad(res, (e as Error).message, 502);
  }
});

const gcsListQuery = z.object({
  prefix: z.string().optional(),
  limit:  z.coerce.number().int().min(1).max(1000).optional().default(100),
});

router.get('/assets/storage/gcs', requireAdmin, async (req, res) => {
  const parsed = gcsListQuery.safeParse(req.query);
  if (!parsed.success) return bad(res, parsed.error.message);
  try {
    const entries = await listGcs(parsed.data.prefix, parsed.data.limit);
    res.json({
      bucket: process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID ?? null,
      prefix: parsed.data.prefix ?? null,
      entries,
    });
  } catch (e) {
    req.log.error({ err: e }, '[assets] gcs list failed');
    bad(res, (e as Error).message, 502);
  }
});

// ── catalog (D1) ─────────────────────────────────────────────────────────────

const listQuery = z.object({
  source: z.enum(['gcs', 'r2', 'both']).optional(),
  tag:    z.string().optional(),
  q:      z.string().optional(),
  limit:  z.coerce.number().int().min(1).max(500).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

/**
 * Synthesize a catalog-shaped row by listing R2 (and, if reachable, GCS)
 * directly. Used when D1 is unavailable so the admin Assets page still
 * shows real data instead of a 503.
 */
async function listFromStorage(opts: {
  source: 'gcs' | 'r2' | 'both';
  q?: string;
  limit: number;
  offset: number;
}): Promise<{ rows: unknown[]; total: number; storageOnly: true }> {
  const wantR2  = opts.source !== 'gcs';
  const wantGcs = opts.source !== 'r2';

  // List both R2 buckets (the public CDN bucket + the internal objectstore)
  // and GCS in parallel; tolerate failures on any side. The 25k cap is a safety
  // net — the assets bucket can hold tens of thousands of CDN files.
  // Resolve bucket env names lazily and per-source so a missing R2 env doesn't
  // crash a GCS-only listing (and vice versa).
  let r2AssetsBucket: string | null = null;
  let r2ObjBucket: string | null = null;
  if (wantR2) {
    try { r2AssetsBucket = R2.buckets.assets(); }
    catch { r2AssetsBucket = null; }
    try { r2ObjBucket = R2.buckets.objectstore(); }
    catch { r2ObjBucket = null; }
  }
  const [r2AssetsEntries, r2ObjEntries, gcsEntries] = await Promise.all([
    wantR2 && r2AssetsBucket
      ? listR2(undefined, r2AssetsBucket, 25_000).catch(() => [])
      : Promise.resolve([]),
    wantR2 && r2ObjBucket
      ? listR2(undefined, r2ObjBucket, 25_000).catch(() => [])
      : Promise.resolve([]),
    wantGcs ? listGcs(undefined, 25_000).catch(() => []) : Promise.resolve([]),
  ]);
  // Tag each R2 entry with its source bucket so we keep correct presigning.
  const r2Entries: Array<{ key: string; size: number; contentType?: string; lastModified?: string; bucket: string }> = [
    ...r2AssetsEntries.map(e => ({ ...e, bucket: r2AssetsBucket as string })),
    ...r2ObjEntries.map(e => ({ ...e, bucket: r2ObjBucket as string })),
  ];
  const byKey = new Map<
    string,
    {
      key: string;
      r2Size: number | null;
      r2Updated: string | null;
      r2Bucket: string | null;
      gcsSize: number | null;
      gcsUpdated: string | null;
      contentType: string | null;
    }
  >();
  for (const e of r2Entries) {
    // The assets bucket wins if a key happens to live in both R2 buckets.
    const cur = byKey.get(e.key);
    if (!cur) {
      byKey.set(e.key, {
        key: e.key,
        r2Size: e.size,
        r2Updated: e.lastModified ?? null,
        r2Bucket: e.bucket,
        gcsSize: null,
        gcsUpdated: null,
        contentType: e.contentType ?? null,
      });
    } else if (e.bucket === r2AssetsBucket) {
      cur.r2Size = e.size;
      cur.r2Updated = e.lastModified ?? null;
      cur.r2Bucket = e.bucket;
      cur.contentType = cur.contentType ?? e.contentType ?? null;
    }
  }
  for (const e of gcsEntries) {
    const cur = byKey.get(e.key);
    if (cur) {
      cur.gcsSize = e.size;
      cur.gcsUpdated = e.lastModified ?? null;
      cur.contentType = cur.contentType ?? e.contentType ?? null;
    } else {
      byKey.set(e.key, {
        key: e.key,
        r2Size: null,
        r2Updated: null,
        r2Bucket: null,
        gcsSize: e.size,
        gcsUpdated: e.lastModified ?? null,
        contentType: e.contentType ?? null,
      });
    }
  }

  const q = opts.q?.trim().toLowerCase();
  let merged = Array.from(byKey.values());
  if (q) merged = merged.filter(m => m.key.toLowerCase().includes(q));
  // Stable, useful default sort: most recently updated first.
  merged.sort((a, b) => {
    const at = (a.r2Updated || a.gcsUpdated || '');
    const bt = (b.r2Updated || b.gcsUpdated || '');
    return bt.localeCompare(at);
  });
  const total = merged.length;
  const page = merged.slice(opts.offset, opts.offset + opts.limit);

  const rows = page.map(m => {
    const source = m.r2Size != null && m.gcsSize != null
      ? 'both'
      : m.r2Size != null
        ? 'r2'
        : 'gcs';
    return {
      id: assetIdFromPath(m.key),
      path: m.key,
      source,
      gcs_bucket: m.gcsSize != null ? process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID ?? null : null,
      gcs_key:    m.gcsSize != null ? m.key : null,
      r2_bucket:  m.r2Size  != null ? m.r2Bucket : null,
      r2_key:     m.r2Size  != null ? m.key : null,
      content_type: m.contentType,
      size_bytes: m.r2Size ?? m.gcsSize ?? null,
      sha256: null,
      width: null,
      height: null,
      duration_ms: null,
      public_url: m.r2Size != null ? R2.publicUrlFor(m.key) : null,
      created_at: null,
      updated_at: m.r2Updated || m.gcsUpdated || null,
      tags: [] as string[],
    };
  });
  return { rows, total, storageOnly: true };
}

router.get('/assets', requireAdmin, async (req, res) => {
  const parsed = listQuery.safeParse(req.query);
  if (!parsed.success) return bad(res, parsed.error.message);
  // When the D1 catalog is up, use it (richer metadata + tags). Otherwise fall
  // back to listing R2 + GCS directly so the admin still has something to show.
  if (catalogState().available) {
    try {
      const out = await catalogList(parsed.data);
      return res.json(out);
    } catch (e) {
      req.log.error({ err: e }, '[assets] catalog list failed');
      return bad(res, (e as Error).message, 500);
    }
  }
  try {
    const out = await listFromStorage({
      source: parsed.data.source ?? 'both',
      q: parsed.data.q,
      limit: parsed.data.limit,
      offset: parsed.data.offset,
    });
    res.json(out);
  } catch (e) {
    req.log.error({ err: e }, '[assets] storage-only list failed');
    bad(res, (e as Error).message, 500);
  }
});

router.get('/assets/:id', requireAdmin, async (req, res) => {
  const id = String(req.params.id);
  if (catalogState().available) {
    try {
      const row = await catalogGet(id);
      if (!row) return bad(res, 'not found', 404);
      let presignedGet: string | null = null;
      if (row.r2_bucket && row.r2_key) {
        presignedGet = await R2.presignGet(row.r2_bucket, row.r2_key, 300);
      }
      return res.json({ ...row, presignedGet });
    } catch (e) {
      req.log.error({ err: e }, '[assets] catalog get failed');
      return bad(res, (e as Error).message, 500);
    }
  }
  // Storage-only fallback: scan up to the cap of storage and find a matching id.
  // The id is a hash of the path, so without a key->id index we have to scan.
  try {
    const out = await listFromStorage({ source: 'both', limit: 25_000, offset: 0 });
    type StorageRow = {
      id: string;
      r2_bucket: string | null;
      r2_key: string | null;
    };
    const row = (out.rows as StorageRow[]).find(r => r.id === id);
    if (!row) return bad(res, 'not found', 404);
    let presignedGet: string | null = null;
    if (row.r2_bucket && row.r2_key) {
      presignedGet = await R2.presignGet(row.r2_bucket, row.r2_key, 300);
    }
    res.json({ ...row, presignedGet, storageOnly: true });
  } catch (e) {
    req.log.error({ err: e }, '[assets] storage-only get failed');
    bad(res, (e as Error).message, 500);
  }
});

const uploadBody = z.object({
  key:         z.string().min(1).max(1024),
  contentType: z.string().min(1).max(200).optional(),
  bucket:      z.enum(['assets', 'objectstore']).optional().default('assets'),
  ttlSeconds:  z.number().int().min(60).max(3600).optional().default(600),
});

router.post('/assets/upload', requireAdmin, async (req, res) => {
  const parsed = uploadBody.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed.error.message);
  const { key, contentType, bucket, ttlSeconds } = parsed.data;
  const bname = bucket === 'objectstore' ? R2.buckets.objectstore() : R2.buckets.assets();
  try {
    const url = await R2.presignPut(bname, key, contentType, ttlSeconds);
    const id  = assetIdFromPath(key);
    // Pre-create the catalog row so /upload/complete is an UPDATE, not insert.
    if (catalogState().available) {
      await catalogUpsert({
        path:        key,
        r2Bucket:    bname,
        r2Key:       key,
        contentType: contentType ?? null,
        publicUrl:   R2.publicUrlFor(key),
      });
    }
    res.json({
      id,
      key,
      bucket: bname,
      url,
      expiresIn: ttlSeconds,
      headers:   contentType ? { 'Content-Type': contentType } : {},
      catalog:   catalogState().available ? 'ready' : 'unavailable',
    });
  } catch (e) {
    req.log.error({ err: e }, '[assets] presign put failed');
    bad(res, (e as Error).message, 500);
  }
});

const completeBody = z.object({
  id:     z.string().min(1),
  sha256: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
  tags:   z.array(z.string().min(1).max(64)).max(64).optional(),
});

router.post('/assets/upload/complete', requireAdmin, async (req, res) => {
  const parsed = completeBody.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed.error.message);
  if (!catalogState().available) {
    return res.status(503).json({ error: 'catalog unavailable', reason: catalogState().reason });
  }
  try {
    const row = await catalogGet(parsed.data.id);
    if (!row || !row.r2_bucket || !row.r2_key) return bad(res, 'no R2 placement for this id', 404);
    const head = await R2.head(row.r2_bucket, row.r2_key);
    if (!head) return bad(res, 'object not found in R2 (was the PUT actually done?)', 404);
    await catalogUpsert({
      path:        row.path,
      r2Bucket:    row.r2_bucket,
      r2Key:       row.r2_key,
      contentType: head.contentType,
      sizeBytes:   head.size,
      sha256:      parsed.data.sha256 ?? row.sha256 ?? null,
      publicUrl:   R2.publicUrlFor(row.r2_key),
    });
    if (parsed.data.tags?.length) await catalogTag(parsed.data.id, parsed.data.tags);
    const updated = await catalogGet(parsed.data.id);
    res.json(updated);
  } catch (e) {
    req.log.error({ err: e }, '[assets] upload complete failed');
    bad(res, (e as Error).message, 500);
  }
});

const tagsBody = z.object({
  add:    z.array(z.string().min(1).max(64)).max(64).optional(),
  remove: z.array(z.string().min(1).max(64)).max(64).optional(),
});

router.put('/assets/:id/tags', requireAdmin, async (req, res) => {
  const parsed = tagsBody.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed.error.message);
  if (!catalogState().available) {
    return res.status(503).json({ error: 'catalog unavailable', reason: catalogState().reason });
  }
  try {
    const id = String(req.params.id);
    await catalogTag(id, parsed.data.add ?? [], parsed.data.remove ?? []);
    const row = await catalogGet(id);
    res.json(row);
  } catch (e) {
    req.log.error({ err: e }, '[assets] tag update failed');
    bad(res, (e as Error).message, 500);
  }
});

const deleteQuery = z.object({
  from: z.enum(['both', 'gcs', 'r2']).optional().default('both'),
});

router.delete('/assets/:id', requireAdmin, async (req, res) => {
  const parsed = deleteQuery.safeParse(req.query);
  if (!parsed.success) return bad(res, parsed.error.message);
  if (!catalogState().available) {
    return res.status(503).json({ error: 'catalog unavailable', reason: catalogState().reason });
  }
  try {
    const id = String(req.params.id);
    const row = await catalogGet(id);
    if (!row) return bad(res, 'not found', 404);
    const from = parsed.data.from;
    if ((from === 'r2' || from === 'both') && row.r2_bucket && row.r2_key) {
      await R2.delete(row.r2_bucket, row.r2_key);
    }
    if (from === 'both') await catalogDelete(row.id);
    res.json({ ok: true, deletedFrom: from });
  } catch (e) {
    req.log.error({ err: e }, '[assets] delete failed');
    bad(res, (e as Error).message, 500);
  }
});

// ── conversion ───────────────────────────────────────────────────────────────

const convertBody = z.object({
  /**
   * Where to put the converted .glb. Defaults to the source path with the
   * extension swapped to `.glb`. Caller can override (e.g. to move it under
   * `models/{kind}/{id}/model.glb`).
   */
  targetKey: z.string().min(1).optional(),
  /** If a row already exists at the target key, overwrite it. Default: true. */
  overwrite: z.boolean().optional().default(true),
});

/**
 * Convert a source 3D asset (FBX, OBJ, DAE, …) into game-ready binary glTF
 * (.glb) and store the result back in the same R2 bucket. The source row is
 * left intact; the new row is upserted into the catalog.
 */
router.post('/assets/:id/convert', requireAdmin, async (req, res) => {
  const parsed = convertBody.safeParse(req.body ?? {});
  if (!parsed.success) return bad(res, parsed.error.message);
  if (!catalogState().available) {
    return res.status(503).json({ error: 'catalog unavailable', reason: catalogState().reason });
  }
  const id = String(req.params.id);
  try {
    const row = await catalogGet(id);
    if (!row) return bad(res, 'not found', 404);
    if (!row.r2_bucket || !row.r2_key) {
      return bad(res, 'asset has no R2 location to read from', 409);
    }
    const sourceExt = extFromPath(row.path);
    if (!isConvertibleSourceExt(sourceExt)) {
      return bad(res, `unsupported source format: .${sourceExt || 'unknown'}`, 415);
    }
    const targetKey = parsed.data.targetKey ?? withGlbExtension(row.r2_key);
    if (targetKey === row.r2_key) {
      return bad(res, 'targetKey would overwrite the source asset; pick a different key', 409);
    }
    // Catalog `path` and R2 `key` must stay in sync — when the user overrides
    // `targetKey`, derive `targetPath` from it instead of from the source path.
    const targetPath = parsed.data.targetKey
      ? parsed.data.targetKey
      : withGlbExtension(row.path);

    // Hard cap on the source size we'll buffer in memory. Tens of MB is typical
    // for a complex FBX scene; 256 MB is the largest we want to risk on a
    // single admin-triggered convert. HEAD first so we fail fast without
    // streaming a multi-GB blob across the wire.
    const MAX_SOURCE_BYTES = 256 * 1024 * 1024;
    const head = await R2.head(row.r2_bucket, row.r2_key);
    if (!head) return bad(res, 'source object missing from R2', 404);
    if (head.size > MAX_SOURCE_BYTES) {
      return bad(
        res,
        `source asset is ${head.size} bytes; max convertible size is ${MAX_SOURCE_BYTES}`,
        413,
      );
    }

    if (!parsed.data.overwrite) {
      const existing = await R2.head(row.r2_bucket, targetKey);
      if (existing) return bad(res, `target key already exists: ${targetKey}`, 409);
    }

    // Stream source out of R2 into a Buffer. assimp needs a real file on disk
    // and we already verified the size is bounded, so a single Buffer.concat
    // is fine here.
    const obj = await R2.getStream(row.r2_bucket, row.r2_key);
    if (!obj) return bad(res, 'source object missing from R2', 404);
    const chunks: Buffer[] = [];
    let received = 0;
    for await (const chunk of obj.stream) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as ArrayBufferLike);
      received += buf.length;
      if (received > MAX_SOURCE_BYTES) {
        // R2 lied about size, or HEAD/GET raced — abort before allocating more.
        return bad(res, 'source asset exceeded max convertible size mid-stream', 413);
      }
      chunks.push(buf);
    }
    const sourceBuffer = Buffer.concat(chunks);

    const result = await convertToGlb({
      sourceBuffer,
      sourceExt,
      log: { info: (m) => req.log.info(m), warn: (m) => req.log.warn(m) },
    });

    await R2.put(row.r2_bucket, targetKey, result.glb, 'model/gltf-binary', {
      'converted-from':    row.path,
      'converter':         'assimp-glb2',
      'converted-at':      String(Date.now()),
    });
    const upsert = await catalogUpsert({
      path:        targetPath,
      r2Bucket:    row.r2_bucket,
      r2Key:       targetKey,
      gcsBucket:   null,
      gcsKey:      null,
      contentType: 'model/gltf-binary',
      sizeBytes:   result.glb.length,
      publicUrl:   R2.publicUrlFor(targetKey),
    });
    if (!upsert.ok) {
      // R2 write succeeded but D1 didn't — surface that explicitly so the
      // operator knows the file is there but not searchable yet.
      return res.status(207).json({
        ok:           false,
        warning:      'converted file uploaded to R2 but catalog upsert failed',
        catalogError: upsert.reason,
        targetKey,
        targetPath,
        sizeBytes:    result.glb.length,
        durationMs:   result.durationMs,
        warnings:     result.stderr.trim() || null,
      });
    }
    res.json({
      ok:         true,
      sourceId:   id,
      targetId:   assetIdFromPath(targetPath),
      targetKey,
      targetPath,
      sizeBytes:  result.glb.length,
      durationMs: result.durationMs,
      warnings:   result.stderr.trim() || null,
    });
  } catch (e) {
    req.log.error({ err: e }, '[assets] convert failed');
    bad(res, (e as Error).message, 500);
  }
});

// ── bridge ops ───────────────────────────────────────────────────────────────

const diffBody = z.object({
  prefix:   z.string().optional(),
  r2Bucket: z.enum(['assets', 'objectstore']).optional().default('objectstore'),
});

router.post('/assets/bridge/diff', requireAdmin, async (req, res) => {
  const parsed = diffBody.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed.error.message);
  const bname = parsed.data.r2Bucket === 'assets' ? R2.buckets.assets() : R2.buckets.objectstore();
  try {
    const out = await diff(parsed.data.prefix, bname);
    res.json({ r2Bucket: bname, prefix: parsed.data.prefix ?? null, ...out });
  } catch (e) {
    req.log.error({ err: e }, '[assets] diff failed');
    bad(res, (e as Error).message, 502);
  }
});

const syncBody = z.object({
  prefix:        z.string().optional(),
  r2Bucket:      z.enum(['assets', 'objectstore']).optional().default('objectstore'),
  maxObjects:    z.number().int().min(1).max(2000).optional().default(200),
  skipIfPresent: z.boolean().optional().default(true),
  dryRun:        z.boolean().optional().default(false),
});

router.post('/assets/bridge/sync', requireAdmin, async (req, res) => {
  const parsed = syncBody.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed.error.message);
  const bname = parsed.data.r2Bucket === 'assets' ? R2.buckets.assets() : R2.buckets.objectstore();

  if (parsed.data.dryRun) {
    try {
      const d = await diff(parsed.data.prefix, bname);
      res.json({ dryRun: true, r2Bucket: bname, prefix: parsed.data.prefix ?? null, ...d });
    } catch (e) {
      req.log.error({ err: e }, '[assets] dry-run diff failed');
      bad(res, (e as Error).message, 502);
    }
    return;
  }
  try {
    const result = await mirrorGcsToR2({
      prefix:        parsed.data.prefix,
      r2Bucket:      bname,
      maxObjects:    parsed.data.maxObjects,
      skipIfPresent: parsed.data.skipIfPresent,
    });
    res.json({ r2Bucket: bname, ...result });
  } catch (e) {
    req.log.error({ err: e }, '[assets] sync failed');
    bad(res, (e as Error).message, 502);
  }
});

function tryEnv<T>(fn: () => T): T | null {
  try { return fn(); } catch { return null; }
}

// ── public-objects serving (immutable game assets) ───────────────────────────
//
// Lazy-fetches a public asset from the GCS bucket via PUBLIC_OBJECT_SEARCH_PATHS.
// Used by the game client to stream VFX/bullet GLBs on demand without bundling.
// Path is wildcard-captured everything after `/assets/public/`.

const _publicStore = new ObjectStorageService();

router.get(/^\/assets\/public\/(.+)$/, async (req, res) => {
  const filePath = (req.params as unknown as Record<string, string>)[0] ?? '';
  // Reject empty paths, parent-traversal segments, leading slash, NUL bytes,
  // and backslash variants (defensive — express normalises but be explicit).
  if (
    !filePath ||
    filePath.startsWith('/') ||
    filePath.includes('\0') ||
    filePath.includes('\\') ||
    filePath.split('/').some((seg) => seg === '..' || seg === '')
  ) {
    return bad(res, 'invalid path', 400);
  }

  let file;
  try {
    file = await _publicStore.searchPublicObject(filePath);
  } catch (e) {
    req.log.error({ err: e, filePath }, '[assets] public-objects lookup failed');
    return bad(res, 'lookup failed', 502);
  }
  if (!file) return bad(res, 'not found', 404);

  let ct = 'application/octet-stream';
  let size: string | null = null;
  try {
    const [metadata] = await file.getMetadata();
    ct = (metadata.contentType as string) || ct;
    if (metadata.size) size = String(metadata.size);
  } catch (e) {
    req.log.warn({ err: e, filePath }, '[assets] metadata fetch failed; serving without it');
  }

  res.setHeader('Content-Type', ct);
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  if (size) res.setHeader('Content-Length', size);

  // Plain pipe with explicit error handlers. We deliberately AVOID
  // stream/promises pipeline() here — the @google-cloud/storage SDK builds
  // its read stream lazily (Duplexify) so destroying it before the inner
  // request fires triggers ERR_STREAM_UNABLE_TO_PIPE on client-abort.
  // pipe() with `{ end: true }` already propagates close upward correctly.
  const source = file.createReadStream();

  source.on('error', (err) => {
    if (!res.headersSent) {
      if (err instanceof ObjectNotFoundError) return bad(res, 'not found', 404);
      return bad(res, 'serve failed', 502);
    }
    req.log.error({ err, filePath }, '[assets] public-objects stream errored mid-flight');
    if (!res.writableEnded) res.destroy();
  });

  res.on('error', (err) => {
    req.log.warn({ err, filePath }, '[assets] response stream errored');
  });

  source.pipe(res);
});

export default router;
