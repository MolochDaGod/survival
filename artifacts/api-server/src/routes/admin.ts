/**
 * Admin dashboard endpoint — multi-game admin shell.
 *
 *   GET /api/admin/dashboard      (admin) — counts + D1 health for the front page
 *
 * Returns a single payload with the minimum slice the dashboard needs so the
 * front page can render without N round-trips.
 */
import { Router } from "express";
import { db, accountsTable, charactersTable, prefabsTable } from "@workspace/db";
import { sql, ilike, or, inArray, asc, desc } from "drizzle-orm";
import { Storage } from "@google-cloud/storage";
import { z } from "zod";
import { requireAdmin } from "../lib/adminAuth.js";
import { catalogState } from "../lib/assetBridge.js";
import { D1 } from "../lib/d1Client.js";

export const adminRouter = Router();

// ── GCS client (Replit sidecar auth — same pattern as savegame.ts) ───────────
// Used by /reset-demo-data to clear cloud saves. Constructed lazily so the
// sidecar credentials aren't required to import this module in tests.
const REPLIT_SIDECAR = "http://127.0.0.1:1106";
const SAVE_PREFIX    = "grudge-nexus/saves";
let _gcs: Storage | null = null;
function getSaveBucket() {
  if (!_gcs) {
    _gcs = new Storage({
      credentials: {
        audience:           "replit",
        subject_token_type: "access_token",
        token_url:          `${REPLIT_SIDECAR}/token`,
        type:               "external_account",
        credential_source: {
          url:    `${REPLIT_SIDECAR}/credential`,
          format: { type: "json", subject_token_field_name: "access_token" },
        },
        universe_domain: "googleapis.com",
      } as never,
      projectId: "",
    });
  }
  const id = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
  if (!id) throw new Error("DEFAULT_OBJECT_STORAGE_BUCKET_ID not set");
  return _gcs.bucket(id);
}

/**
 * GET /api/admin/players/search?q=...&limit=...
 *
 * Substring search across grudge id, account display name, and character
 * name. Returns each matching account with all of its characters and which
 * fields contributed to the match. Admin only.
 */
const searchSchema = z.object({
  q: z.string().min(1).max(128),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

function escapeLike(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

adminRouter.get("/players/search", requireAdmin, async (req, res) => {
  const parsed = searchSchema.safeParse({
    q: typeof req.query.q === "string" ? req.query.q.trim() : "",
    limit: req.query.limit,
  });
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { q, limit } = parsed.data;
  const needle = `%${escapeLike(q)}%`;

  // Phase 1: find candidate account ids — accounts that match directly OR
  // own a character whose name matches. Capped at limit+1 so we can flag
  // truncation cleanly without paging logic.
  const fetchCap = limit + 1;

  // Pull a slightly-larger candidate set per source so we can detect "more
  // exists" without paging. Both queries have a deterministic ORDER BY so
  // results near the truncation boundary are stable across runs.
  const accountMatches = await db
    .select({
      id: accountsTable.id,
      grudgeId: accountsTable.grudgeId,
      grudgeMatched: sql<boolean>`(${accountsTable.grudgeId} ILIKE ${needle})`,
      displayMatched: sql<boolean>`(${accountsTable.displayName} ILIKE ${needle})`,
    })
    .from(accountsTable)
    .where(or(ilike(accountsTable.grudgeId, needle), ilike(accountsTable.displayName, needle)))
    .orderBy(asc(accountsTable.grudgeId), asc(accountsTable.id))
    .limit(fetchCap);

  const charNameMatches = await db
    .selectDistinct({
      accountId: charactersTable.accountId,
    })
    .from(charactersTable)
    .where(ilike(charactersTable.name, needle))
    .orderBy(asc(charactersTable.accountId))
    .limit(fetchCap);

  // Merge ids, remembering which fields contributed. The merge order is
  // (account-pass first, then char-pass) so when the union exceeds `limit`
  // the slice prefers accounts that matched on identity over ones found
  // only via a character name. That keeps the "showing N of more" boundary
  // deterministic and useful.
  type Flags = { grudgeId: boolean; displayName: boolean; characterName: boolean };
  const matched = new Map<string, Flags>();
  for (const r of accountMatches) {
    matched.set(r.id, {
      grudgeId: !!r.grudgeMatched,
      displayName: !!r.displayMatched,
      characterName: false,
    });
  }
  for (const r of charNameMatches) {
    const acctId = r.accountId ?? '';
    const existing = matched.get(acctId);
    if (existing) {
      existing.characterName = true;
    } else {
      matched.set(acctId, { grudgeId: false, displayName: false, characterName: true });
    }
  }

  const candidateCount = matched.size;
  // We may or may not have seen *every* match — each source was capped at
  // `fetchCap`. So we report `hasMore` instead of an exact total.
  const hitFetchCap =
    accountMatches.length >= fetchCap || charNameMatches.length >= fetchCap;
  const accountIds = Array.from(matched.keys()).slice(0, limit);
  const hasMore = candidateCount > limit || hitFetchCap;

  if (accountIds.length === 0) {
    res.json({ q, returnedCount: 0, hasMore: false, results: [] });
    return;
  }

  // Phase 2: hydrate the bounded set.
  const accounts = await db
    .select()
    .from(accountsTable)
    .where(inArray(accountsTable.id, accountIds));
  const characters = await db
    .select()
    .from(charactersTable)
    .where(inArray(charactersTable.accountId, accountIds))
    .orderBy(desc(charactersTable.lastPlayedAt), desc(charactersTable.createdAt));

  const charsByAccount = new Map<string, typeof characters>();
  for (const c of characters) {
    const key = c.accountId ?? '';
    const list = charsByAccount.get(key);
    if (list) {
      list.push(c);
    } else {
      charsByAccount.set(key, [c]);
    }
  }

  const results = accounts
    .map((a) => {
      const flags = matched.get(a.id)!;
      const matchedFields: string[] = [];
      if (flags.grudgeId) matchedFields.push("grudgeId");
      if (flags.displayName) matchedFields.push("displayName");
      if (flags.characterName) matchedFields.push("characterName");
      return { account: a, characters: charsByAccount.get(a.id) ?? [], matchedFields };
    })
    .sort((a, b) => (a.account.grudgeId ?? '').localeCompare(b.account.grudgeId ?? ''));

  res.json({ q, returnedCount: results.length, hasMore, results });
});

adminRouter.get("/dashboard", requireAdmin, async (_req, res) => {
  const [accountsRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(accountsTable);
  const [charsRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(charactersTable);

  const prefabsByKindRows = await db
    .select({
      kind: prefabsTable.kind,
      n: sql<number>`count(*)::int`,
    })
    .from(prefabsTable)
    .groupBy(prefabsTable.kind);
  const prefabsByKind: Record<string, number> = {};
  let prefabsTotal = 0;
  for (const r of prefabsByKindRows) {
    prefabsByKind[r.kind] = r.n;
    prefabsTotal += r.n;
  }

  // Always probe D1 live so the dashboard reflects current health, not the
  // cached `catalogState()` snapshot from boot.
  const d1Avail = await D1.available();
  const cat     = catalogState();

  let assetsTotal = 0;
  let assetsBySource: Record<string, number> = {};
  let assetsError: string | null = null;
  if (d1Avail.ok) {
    try {
      const rows = await D1.rows<{ source: string; n: number }>(
        "SELECT source, count(*) AS n FROM gn_assets GROUP BY source",
      );
      for (const r of rows) {
        assetsBySource[r.source] = r.n;
        assetsTotal += r.n;
      }
    } catch (err) {
      assetsError = (err as Error).message;
    }
  }

  res.json({
    accounts: { total: accountsRow?.n ?? 0 },
    characters: { total: charsRow?.n ?? 0 },
    prefabs: { total: prefabsTotal, byKind: prefabsByKind },
    assets: { total: assetsTotal, bySource: assetsBySource, error: assetsError },
    d1: {
      available:    d1Avail.ok,
      cachedReason: cat.reason ?? null,
      checkedAt:    Date.now(),
      tokenSource:  d1Avail.tokenSource ?? null,
      lastError:    d1Avail.ok ? null : d1Avail.message,
    },
    serverTime: Date.now(),
  });
});

/**
 * POST /api/admin/reset-demo-data
 *
 * Wipes every player's account, characters, and cloud save. Used as a
 * deployment pre-flight to clear out testing data so the live build starts
 * from a known-empty state. Admin only and requires a typed confirmation
 * phrase in the body to make accidental fat-finger calls impossible.
 *
 * Body: { confirm: "RESET" }
 *
 * Returns counts of what was deleted for the admin UI to show.
 *
 * NOTE: prefabs / asset catalog are intentionally LEFT ALONE — those are
 * content the operator has authored and shouldn't be wiped along with
 * player data. Only player-owned data is reset.
 */
adminRouter.post("/reset-demo-data", requireAdmin, async (req, res) => {
  const confirm = (req.body as { confirm?: unknown } | null)?.confirm;
  if (confirm !== "RESET") {
    res.status(400).json({ error: 'body must include { "confirm": "RESET" }' });
    return;
  }

  // Order matters for failure-safety: wipe GCS FIRST. If the bucket is
  // unreachable we abort before touching the DB, so we never end up with
  // empty DB rows pointing at orphaned cloud-save blobs (or vice-versa,
  // an empty DB but live save blobs that would re-bind to whatever new
  // account someone signs up with).
  let savesDeleted = 0;
  try {
    const bucket = getSaveBucket();
    const [files] = await bucket.getFiles({ prefix: `${SAVE_PREFIX}/`, maxResults: 10_000 });
    savesDeleted = files.length;
    await bucket.deleteFiles({ prefix: `${SAVE_PREFIX}/`, force: true });
  } catch (err) {
    req.log?.error({ err }, "[admin] reset-demo-data: GCS save wipe failed — aborting before DB delete");
    res.status(502).json({
      error:        "cloud save wipe failed; database left untouched",
      detail:       err instanceof Error ? err.message : String(err),
      accountsDeleted:   0,
      charactersDeleted: 0,
      savesDeleted:      0,
    });
    return;
  }

  // DB wipe wrapped in a transaction so accounts + characters either both
  // succeed or both roll back — no half-wiped state. Characters are
  // deleted explicitly first (rather than relying on the FK cascade) so
  // the returned counts are accurate even if a future migration drops
  // the cascade rule.
  let charsDeleted    = 0;
  let accountsDeleted = 0;
  try {
    await db.transaction(async (tx) => {
      const charsDel = await tx
        .delete(charactersTable)
        .returning({ id: charactersTable.id });
      const accountsDel = await tx
        .delete(accountsTable)
        .returning({ id: accountsTable.id });
      charsDeleted    = charsDel.length;
      accountsDeleted = accountsDel.length;
    });
  } catch (err) {
    req.log?.error({ err }, "[admin] reset-demo-data: DB delete tx failed AFTER GCS wipe");
    res.status(500).json({
      error:        "database wipe failed; cloud saves were already cleared",
      detail:       err instanceof Error ? err.message : String(err),
      accountsDeleted:   0,
      charactersDeleted: 0,
      savesDeleted,
    });
    return;
  }

  req.log?.warn(
    { accountsDeleted, charactersDeleted: charsDeleted, savesDeleted },
    "[admin] reset-demo-data executed",
  );

  res.json({
    ok: true,
    accountsDeleted,
    charactersDeleted: charsDeleted,
    savesDeleted,
    savesError: null,
  });
});
