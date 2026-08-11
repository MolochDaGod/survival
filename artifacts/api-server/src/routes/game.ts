/**
 * /api/game — read-only game data catalogs for the Survival client + website.
 *
 * Static catalogs (no DB) so production stays online even when D1/prefabs fail:
 *   GET /api/game                 index + health of catalogs
 *   GET /api/game/catalog         full recipes + items bundle
 *   GET /api/game/recipes         recipe list (?station=)
 *   GET /api/game/recipes/:id     one recipe
 *   GET /api/game/items           survival items (?category=)
 *   GET /api/game/items/:id       one item
 *   GET /api/game/stations        stations with recipe counts
 *   GET /api/game/deployables     deployable defs from game-systems
 *   GET /api/game/tiers           gear tier table
 */

import { Router, type IRouter } from 'express';
import {
  RECIPES,
  SURVIVAL_ITEMS,
  RECIPE_STATIONS,
  getRecipe,
  getRecipesByStation,
  getSurvivalItem,
  listSurvivalItems,
  buildGameCatalog,
  type CraftingStation,
} from '@workspace/game-systems/crafting';
import { DEPLOYABLES, TIERS, CRAFTING_STATIONS, HARVESTING_PROFESSIONS } from '@workspace/game-systems';

const router: IRouter = Router();

const CACHE = 'public, max-age=120, stale-while-revalidate=600';

function setCache(res: { set: (k: string, v: string) => void }) {
  res.set('Cache-Control', CACHE);
}

router.get('/', (_req, res) => {
  setCache(res);
  res.json({
    service: 'grudges-survival-game-data',
    version: 1,
    endpoints: [
      'GET /api/game/catalog',
      'GET /api/game/recipes',
      'GET /api/game/recipes/:id',
      'GET /api/game/items',
      'GET /api/game/items/:id',
      'GET /api/game/stations',
      'GET /api/game/deployables',
      'GET /api/game/tiers',
    ],
    counts: {
      recipes: RECIPES.length,
      items: Object.keys(SURVIVAL_ITEMS).length,
      stations: RECIPE_STATIONS.length,
      deployables: DEPLOYABLES.length,
      tiers: TIERS.length,
    },
  });
});

router.get('/catalog', (_req, res) => {
  setCache(res);
  res.json(buildGameCatalog());
});

router.get('/stations', (_req, res) => {
  setCache(res);
  const counts: Record<string, number> = {};
  for (const r of RECIPES) {
    counts[r.station] = (counts[r.station] ?? 0) + 1;
  }
  res.json({
    stations: RECIPE_STATIONS.map((s) => ({
      ...s,
      recipeCount: counts[s.id] ?? 0,
    })),
  });
});

router.get('/recipes', (req, res) => {
  setCache(res);
  const station = String(req.query.station ?? 'all') as CraftingStation | 'all';
  const valid =
    station === 'all' ||
    RECIPE_STATIONS.some((s) => s.id === station);
  if (!valid) {
    res.status(400).json({
      error: 'unknown station',
      station,
      allowed: ['all', ...RECIPE_STATIONS.map((s) => s.id)],
    });
    return;
  }
  const recipes = getRecipesByStation(station);
  res.json({
    station,
    count: recipes.length,
    recipes,
  });
});

router.get('/recipes/:id', (req, res) => {
  setCache(res);
  const recipe = getRecipe(String(req.params.id));
  if (!recipe) {
    res.status(404).json({ error: 'recipe not found', id: req.params.id });
    return;
  }
  // Enrich with resolved item names for website / tools
  const resolve = (itemId: string) => {
    const item = SURVIVAL_ITEMS[itemId];
    return item
      ? { itemId, name: item.name, icon: item.icon, category: item.category }
      : { itemId, name: itemId, icon: '📦', category: 'misc' };
  };
  res.json({
    ...recipe,
    inputsResolved: recipe.inputs.map((i) => ({ ...i, ...resolve(i.itemId) })),
    outputsResolved: recipe.outputs.map((o) => ({ ...o, ...resolve(o.itemId) })),
    iconItem: resolve(recipe.iconItemId),
  });
});

router.get('/items', (req, res) => {
  setCache(res);
  const category = req.query.category ? String(req.query.category) : undefined;
  const items = listSurvivalItems(category);
  res.json({
    category: category ?? 'all',
    count: items.length,
    items,
  });
});

router.get('/items/:id', (req, res) => {
  setCache(res);
  const item = getSurvivalItem(String(req.params.id));
  if (!item) {
    res.status(404).json({ error: 'item not found', id: req.params.id });
    return;
  }
  // Reverse lookup: recipes that use or produce this item
  const usedIn = RECIPES.filter((r) =>
    r.inputs.some((i) => i.itemId === item.id),
  ).map((r) => ({ id: r.id, name: r.name, station: r.station }));
  const producedBy = RECIPES.filter((r) =>
    r.outputs.some((o) => o.itemId === item.id),
  ).map((r) => ({ id: r.id, name: r.name, station: r.station }));
  res.json({ ...item, usedIn, producedBy });
});

router.get('/deployables', (_req, res) => {
  setCache(res);
  res.json({ count: DEPLOYABLES.length, deployables: DEPLOYABLES });
});

router.get('/tiers', (_req, res) => {
  setCache(res);
  res.json({
    tiers: TIERS,
    craftingStations: CRAFTING_STATIONS,
    harvestingProfessions: HARVESTING_PROFESSIONS,
  });
});

export default router;
