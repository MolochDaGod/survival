/**
 * Survival crafting catalog — shared by API, website, and arpg-game client.
 *
 * Single source of truth for recipes + survival items. Served over
 * GET /api/game/* and imported by the in-game crafting UI.
 */

export type {
  CraftingStation,
  RecipeInput,
  RecipeOutput,
  Recipe,
} from './recipes.js';
export { RECIPES, recipesByStation } from './recipes.js';

export type {
  SurvivalCategory,
  ConsumeEffect,
  SurvivalItemDef,
} from './survivalItems.js';
export { SURVIVAL_ITEMS, itemsByCategory } from './survivalItems.js';

import { RECIPES } from './recipes.js';
import { SURVIVAL_ITEMS } from './survivalItems.js';
import type { CraftingStation, Recipe } from './recipes.js';
import type { SurvivalItemDef } from './survivalItems.js';

/** Station labels for UI (handcraft + workstations). */
export const RECIPE_STATIONS: {
  id: CraftingStation;
  name: string;
  icon: string;
  description: string;
}[] = [
  { id: 'none', name: 'Handcraft', icon: '✋', description: 'Craft anywhere — no station required.' },
  { id: 'campfire', name: 'Campfire', icon: '🔥', description: 'Cook food and boil water.' },
  { id: 'cooking_rack', name: 'Cooking Rack', icon: '🍖', description: 'Slow roast and smoke meats.' },
  { id: 'workbench', name: 'Workbench', icon: '🪚', description: 'Tools, furniture, and structures.' },
  { id: 'drying_rack', name: 'Drying Rack', icon: '🪵', description: 'Cure meat and fish for storage.' },
  { id: 'profession_bench', name: 'Profession Bench', icon: '⚒️', description: 'Camp claim professional crafts.' },
];

export function getRecipe(id: string): Recipe | undefined {
  return RECIPES.find((r) => r.id === id);
}

export function getRecipesByStation(station: CraftingStation | 'all'): Recipe[] {
  if (station === 'all') return RECIPES.slice();
  return RECIPES.filter((r) => r.station === station);
}

export function getSurvivalItem(id: string): SurvivalItemDef | undefined {
  return SURVIVAL_ITEMS[id];
}

export function listSurvivalItems(category?: string): SurvivalItemDef[] {
  const all = Object.values(SURVIVAL_ITEMS);
  if (!category || category === 'all') return all;
  return all.filter((i) => i.category === category);
}

/** Full catalog payload for /api/game/catalog */
export function buildGameCatalog() {
  const stationCounts: Record<string, number> = {};
  for (const r of RECIPES) {
    stationCounts[r.station] = (stationCounts[r.station] ?? 0) + 1;
  }
  const categories = new Set(Object.values(SURVIVAL_ITEMS).map((i) => i.category));
  return {
    version: 1,
    updatedAt: '2026-08-10T00:00:00.000Z',
    recipeCount: RECIPES.length,
    itemCount: Object.keys(SURVIVAL_ITEMS).length,
    stations: RECIPE_STATIONS.map((s) => ({
      ...s,
      recipeCount: stationCounts[s.id] ?? 0,
    })),
    categories: Array.from(categories).sort(),
    recipes: RECIPES,
    items: SURVIVAL_ITEMS,
  };
}
