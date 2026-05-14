/**
 * Savegame routes — read/write Grudge Nexus cloud saves via Cloudflare R2.
 *
 * Endpoints (all under /api, relative paths below):
 *   POST /savegame/:sessionId   — upsert save JSON
 *   GET  /savegame/:sessionId   — load save JSON
 *   DELETE /savegame/:sessionId — wipe a save slot
 *
 * Session IDs are UUID v4 strings generated client-side and stored in
 * localStorage. No authentication required — the session ID IS the key.
 *
 * Storage layout (inside the R2 assets bucket):
 *   grudge-nexus/saves/<sessionId>.json
 */

import { Router } from 'express';
import { R2Saves } from '../lib/r2Saves.js';

const MAX_SAVE_BYTES = 256 * 1024; // 256 KB sanity guard

function safeSessionId(raw: string): string | null {
  // Legacy random UUIDs: lowercase hex + dashes, 8-40 chars.
  if (/^[0-9a-f-]{8,40}$/.test(raw)) return raw;
  // Identity-derived "grudge-ids": `puter_<uuid>` or `guest_<uuid>`.
  if (/^(puter|guest)_[0-9a-f-]{8,40}$/.test(raw)) return raw;
  // Character-scoped grudge-ids: `<grudgeId>__<characterUuid>`.
  if (
    /^(puter|guest)_[0-9a-f-]{8,40}__[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
      raw,
    )
  ) {
    return raw;
  }
  return null;
}

// ─── Router ───────────────────────────────────────────────────────────────────

const savegameRouter = Router();

/** POST /api/savegame/:sessionId — upsert cloud save */
savegameRouter.post('/savegame/:sessionId', async (req, res) => {
  const sid = safeSessionId(req.params.sessionId);
  if (!sid) { res.status(400).json({ error: 'invalid session id' }); return; }

  let body: string;
  try {
    body = JSON.stringify(req.body);
  } catch {
    res.status(400).json({ error: 'invalid JSON body' }); return;
  }

  if (Buffer.byteLength(body) > MAX_SAVE_BYTES) {
    res.status(413).json({ error: 'save too large' }); return;
  }

  try {
    const result = await R2Saves.put(sid, body);
    res.status(200).json({ ok: true, savedAt: result.savedAt });
  } catch (err) {
    req.log?.error(err, 'savegame write failed');
    res.status(500).json({ error: 'storage write failed' });
  }
});

/** GET /api/savegame/:sessionId — load cloud save */
savegameRouter.get('/savegame/:sessionId', async (req, res) => {
  const sid = safeSessionId(req.params.sessionId);
  if (!sid) { res.status(400).json({ error: 'invalid session id' }); return; }

  try {
    const data = await R2Saves.get(sid);
    if (data === null) { res.status(404).json({ error: 'no save found' }); return; }
    res.status(200).json(data);
  } catch (err) {
    req.log?.error(err, 'savegame read failed');
    res.status(500).json({ error: 'storage read failed' });
  }
});

/** DELETE /api/savegame/:sessionId — wipe a save slot */
savegameRouter.delete('/savegame/:sessionId', async (req, res) => {
  const sid = safeSessionId(req.params.sessionId);
  if (!sid) { res.status(400).json({ error: 'invalid session id' }); return; }

  try {
    await R2Saves.delete(sid);
    res.status(200).json({ ok: true });
  } catch (err) {
    req.log?.error(err, 'savegame delete failed');
    res.status(500).json({ error: 'storage delete failed' });
  }
});

export default savegameRouter;
