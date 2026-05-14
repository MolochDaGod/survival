/**
 * /api/stats — read-only stats & info service for the Grudges system.
 *
 * Endpoints
 *   GET  /api/stats/catalog            full primary-stat + effect-key spec
 *   GET  /api/stats/primary            list of the 8 primary stats
 *   GET  /api/stats/primary/:key       one primary stat by key (case-insensitive)
 *   GET  /api/stats/effects            list of all effect keys with metadata
 *   GET  /api/stats/effects/:key       one effect by key
 *   POST /api/stats/effective-points   { points } -> { effective } (DR helper)
 *   GET  /api/stats/info               server runtime info: uptime, version,
 *                                      node version, current room count.
 */
import { Router, type IRouter } from "express";
import { z } from "zod";
import {
  PRIMARY_STATS,
  EFFECTS,
  buildCatalogSnapshot,
  effectivePoints,
} from "../stats/catalog";
import { RoomManager } from "../realtime/RoomManager";

const router: IRouter = Router();

const SERVER_BOOT = Date.now();
const SERVER_VERSION = process.env["npm_package_version"] ?? "dev";

router.get("/catalog", (_req, res) => {
  res.json(buildCatalogSnapshot());
});

router.get("/primary", (_req, res) => {
  res.json({ primaryStats: PRIMARY_STATS });
});

router.get("/primary/:key", (req, res) => {
  const key = req.params.key.toLowerCase();
  const stat = PRIMARY_STATS.find((a) => a.key === key);
  if (!stat) {
    res.status(404).json({ error: "unknown stat", key });
    return;
  }
  res.json(stat);
});

router.get("/effects", (_req, res) => {
  res.json({ effects: EFFECTS });
});

router.get("/effects/:key", (req, res) => {
  const key = req.params.key;
  const effect = EFFECTS.find((e) => e.key === key);
  if (!effect) {
    res.status(404).json({ error: "unknown effect", key });
    return;
  }
  res.json(effect);
});

const EffectivePointsBody = z.object({ points: z.number().min(0).max(10_000) });
router.post("/effective-points", (req, res) => {
  const parsed = EffectivePointsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "bad request", issues: parsed.error.issues });
    return;
  }
  const eff = effectivePoints(parsed.data.points);
  res.json({
    points: parsed.data.points,
    effective: eff,
    efficiency: parsed.data.points === 0 ? 1 : eff / parsed.data.points,
  });
});

router.get("/info", (_req, res) => {
  const mem = process.memoryUsage();
  res.json({
    server: {
      version: SERVER_VERSION,
      nodeVersion: process.version,
      platform: process.platform,
      uptimeSec: Math.floor((Date.now() - SERVER_BOOT) / 1000),
      pid: process.pid,
    },
    memory: {
      rssMb: Math.round(mem.rss / 1024 / 1024),
      heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
      heapTotalMb: Math.round(mem.heapTotal / 1024 / 1024),
    },
    realtime: (() => {
      const s = RoomManager.stats();
      return { roomCount: s.roomCount, peerCount: s.peerCount };
    })(),
    catalog: {
      primaryStatCount: PRIMARY_STATS.length,
      effectCount: EFFECTS.length,
    },
  });
});

export default router;
