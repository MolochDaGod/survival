/**
 * World catalog routes — D1-backed sectors, islands, and asset furnishing.
 *
 *   GET  /api/world              — full 9-sector bundle
 *   GET  /api/world/sectors      — sector list (no nested assets)
 *   GET  /api/world/sectors/:id  — sector + assets + islands
 *   GET  /api/world/islands      — ?sectorId= filter
 *   GET  /api/world/islands/:id  — island + assets
 *   POST /api/world/reseed       — admin: force D1 reseed
 */

import { Router } from 'express';
import { requireAdmin } from '../lib/adminAuth.js';
import {
  ensureWorldCatalog,
  getWorldBundle,
  listSectors,
  getSectorBundle,
  listIslands,
  getIsland,
  getIslandAssets,
  worldCatalogState,
} from '../lib/worldCatalog';

export const worldRouter = Router();

worldRouter.get('/status', async (_req, res) => {
  const state = worldCatalogState();
  res.json({
    service: 'grudge-nexus-api',
    catalog: state.available ? 'ready' : 'unavailable',
    seeded: state.seeded,
    version: state.version,
    reason: state.reason ?? null,
  });
});

worldRouter.get('/', async (_req, res) => {
  const state = await ensureWorldCatalog();
  if (!state.available) {
    res.status(503).json({ error: 'world catalog unavailable', reason: state.reason });
    return;
  }
  const bundle = await getWorldBundle();
  res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=600');
  res.json(bundle);
});

worldRouter.get('/sectors', async (_req, res) => {
  const state = await ensureWorldCatalog();
  if (!state.available) {
    res.status(503).json({ error: 'world catalog unavailable', reason: state.reason });
    return;
  }
  const sectors = await listSectors();
  res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=600');
  res.json(sectors);
});

worldRouter.get('/sectors/:id', async (req, res) => {
  const state = await ensureWorldCatalog();
  if (!state.available) {
    res.status(503).json({ error: 'world catalog unavailable', reason: state.reason });
    return;
  }
  const bundle = await getSectorBundle(String(req.params.id));
  if (!bundle) {
    res.status(404).json({ error: 'sector not found' });
    return;
  }
  res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=600');
  res.json(bundle);
});

worldRouter.get('/islands', async (req, res) => {
  const state = await ensureWorldCatalog();
  if (!state.available) {
    res.status(503).json({ error: 'world catalog unavailable', reason: state.reason });
    return;
  }
  const sectorId = typeof req.query.sectorId === 'string' ? req.query.sectorId : undefined;
  const islands = await listIslands(sectorId);
  res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=600');
  res.json(islands);
});

worldRouter.get('/islands/:id', async (req, res) => {
  const state = await ensureWorldCatalog();
  if (!state.available) {
    res.status(503).json({ error: 'world catalog unavailable', reason: state.reason });
    return;
  }
  const island = await getIsland(String(req.params.id));
  if (!island) {
    res.status(404).json({ error: 'island not found' });
    return;
  }
  const assets = await getIslandAssets(island.id);
  res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=600');
  res.json({ island, assets });
});

worldRouter.post('/reseed', requireAdmin, async (_req, res) => {
  const { logger } = await import('../lib/logger');
  const state = await ensureWorldCatalog(logger, true);
  res.json({ ok: state.available && state.seeded, version: state.version });
});