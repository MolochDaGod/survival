/**
 * Asset Studio routes — read-only catalog of every object in the primary
 * R2 assets bucket, classified by file extension into a small fixed set of
 * groups (3D models, textures, VFX, audio, other).
 *
 * Mounted under /api by the parent router. The catalog is served from a
 * cached, background-refreshed index (see ../lib/assetStudioCatalog.ts) so
 * a request never has to wait on a full R2 listAll. Snapshots persist to
 * R2 across process restarts, so even cold starts are sub-second once the
 * snapshot exists.
 *
 * No D1, no admin auth — the studio is a single-user internal review tool
 * meant to be used while planning the next D1 schema work, and any data it
 * exposes is already public via the CDN.
 */

import { Router } from "express";
import { z } from "zod";
import { R2 } from "../lib/r2Storage.js";
import { D1 } from "../lib/d1Client.js";
import { catalogState } from "../lib/assetBridge.js";
import {
  forceBuild,
  getCachedCatalog,
} from "../lib/assetStudioCatalog.js";

const router: Router = Router();

// ── Studio asset tags (D1-backed) ────────────────────────────────────────────
//
// Single-user designer tool, so no account/auth scoping — the catalog itself
// is already read-only public-ish. Tags are keyed by raw R2 object key, which
// is what the studio frontend already uses as its asset identifier.

interface StudioTagRow {
  asset_key:      string;
  gear_slot:      string | null;
  character_form: string | null;
  grudge_uuid:    string | null;
  notes:          string | null;
  updated_at:     number;
}

interface StudioTag {
  gearSlot?:      string;
  characterForm?: string;
  grudgeUuid?:    string;
  notes?:         string;
  updatedAt:      string;
}

function rowToTag(r: StudioTagRow): StudioTag {
  const t: StudioTag = { updatedAt: new Date(r.updated_at).toISOString() };
  if (r.gear_slot)      t.gearSlot      = r.gear_slot;
  if (r.character_form) t.characterForm = r.character_form;
  if (r.grudge_uuid)    t.grudgeUuid    = r.grudge_uuid;
  if (r.notes)          t.notes         = r.notes;
  return t;
}

const tagBody = z.object({
  gearSlot:      z.string().max(64).optional().nullable(),
  characterForm: z.string().max(64).optional().nullable(),
  grudgeUuid:    z.string().max(128).optional().nullable(),
  notes:         z.string().max(2048).optional().nullable(),
});

function ensureCatalogReady(res: import("express").Response): boolean {
  const s = catalogState();
  if (!s.available) {
    res.status(503).json({ error: "tag catalog unavailable", reason: s.reason });
    return false;
  }
  return true;
}

router.get("/assets/studio/tags", async (req, res) => {
  if (!ensureCatalogReady(res)) return;
  try {
    const rows = await D1.rows<StudioTagRow>(
      `SELECT asset_key, gear_slot, character_form, grudge_uuid, notes, updated_at
         FROM gn_studio_asset_tags`,
    );
    const tags: Record<string, StudioTag> = {};
    for (const r of rows) tags[r.asset_key] = rowToTag(r);
    res.setHeader("Cache-Control", "no-store");
    res.json({ tags, count: rows.length });
  } catch (e) {
    req.log.error({ err: e }, "[asset-studio] list tags failed");
    res.status(500).json({ error: (e as Error).message });
  }
});

// `:key` is URL-encoded by the client (encodeURIComponent) so slashes inside
// R2 object keys round-trip cleanly — Express 5 / path-to-regexp v8 no longer
// supports the legacy `:key(*)` wildcard pattern.
router.put("/assets/studio/tags/:key", async (req, res) => {
  if (!ensureCatalogReady(res)) return;
  const key = String(req.params.key ?? "").trim();
  if (!key) {
    res.status(400).json({ error: "missing asset key" });
    return;
  }
  const parsed = tagBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  // Treat empty/whitespace fields as null so isTagEmpty-style cleanup works.
  const norm = (v: string | null | undefined): string | null => {
    if (v == null) return null;
    const t = v.trim();
    return t.length === 0 ? null : t;
  };
  const gearSlot      = norm(parsed.data.gearSlot);
  const characterForm = norm(parsed.data.characterForm);
  const grudgeUuid    = norm(parsed.data.grudgeUuid);
  const notes         = norm(parsed.data.notes);
  const allEmpty = !gearSlot && !characterForm && !grudgeUuid && !notes;
  try {
    if (allEmpty) {
      await D1.exec(`DELETE FROM gn_studio_asset_tags WHERE asset_key = ?`, [key]);
      res.status(204).end();
      return;
    }
    const now = Date.now();
    await D1.exec(
      `INSERT INTO gn_studio_asset_tags
         (asset_key, gear_slot, character_form, grudge_uuid, notes, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(asset_key) DO UPDATE SET
         gear_slot      = excluded.gear_slot,
         character_form = excluded.character_form,
         grudge_uuid    = excluded.grudge_uuid,
         notes          = excluded.notes,
         updated_at     = excluded.updated_at`,
      [key, gearSlot, characterForm, grudgeUuid, notes, now],
    );
    res.json({
      key,
      tag: rowToTag({
        asset_key: key,
        gear_slot: gearSlot,
        character_form: characterForm,
        grudge_uuid: grudgeUuid,
        notes,
        updated_at: now,
      }),
    });
  } catch (e) {
    req.log.error({ err: e, key }, "[asset-studio] upsert tag failed");
    res.status(500).json({ error: (e as Error).message });
  }
});

router.delete("/assets/studio/tags/:key", async (req, res) => {
  if (!ensureCatalogReady(res)) return;
  const key = String(req.params.key ?? "").trim();
  if (!key) {
    res.status(400).json({ error: "missing asset key" });
    return;
  }
  try {
    await D1.exec(`DELETE FROM gn_studio_asset_tags WHERE asset_key = ?`, [key]);
    res.status(204).end();
  } catch (e) {
    req.log.error({ err: e, key }, "[asset-studio] delete tag failed");
    res.status(500).json({ error: (e as Error).message });
  }
});

router.delete("/assets/studio/tags", async (req, res) => {
  if (!ensureCatalogReady(res)) return;
  try {
    await D1.exec(`DELETE FROM gn_studio_asset_tags`);
    res.status(204).end();
  } catch (e) {
    req.log.error({ err: e }, "[asset-studio] clear tags failed");
    res.status(500).json({ error: (e as Error).message });
  }
});

router.get("/assets/studio/catalog", async (req, res) => {
  // Validate config up front so misconfig surfaces as a clean 502.
  try {
    R2.buckets.assets();
  } catch (e) {
    req.log.error({ err: e }, "[asset-studio] R2_BUCKET_ASSETS not configured");
    res.status(502).json({ error: (e as Error).message });
    return;
  }

  let payload = getCachedCatalog(req.log);

  // Cache is empty — first request after a cold start with no snapshot.
  // Fall back to a synchronous build (slow but rare, and the build is
  // coalesced with any concurrent refresh).
  if (!payload) {
    try {
      payload = await forceBuild(req.log);
    } catch (e) {
      req.log.error({ err: e }, "[asset-studio] R2 listAll failed");
      res.status(502).json({ error: (e as Error).message });
      return;
    }
  }

  // Catalog is served from a cache that refreshes in the background, so
  // a slightly longer edge cache is safe — but keep it short enough that
  // recently-uploaded assets still show up promptly. The in-memory layer
  // is the real protection against listAll storms.
  res.setHeader("Cache-Control", "public, max-age=30, s-maxage=30");
  res.json(payload);
});

export default router;
