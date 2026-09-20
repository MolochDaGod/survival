/**
 * Crafting recipes for Grudges survival.
 *
 * SSOT: docs/inventory/recipes.csv
 * Regen:  node scripts/gen-recipes-from-csv.mjs
 *
 * Runtime array is GENERATED_RECIPES — do not hand-append gameplay recipes
 * here. Add rows to the CSV (and SurvivalItems if needed), then regenerate.
 */

import { GENERATED_RECIPES } from './Recipes.generated';

export type CraftingStation =
  | 'none'
  | 'campfire'
  | 'cooking_rack'
  | 'workbench'
  | 'drying_rack'
  | 'anvil'
  | 'hammer_tool';

export interface RecipeInput {
  itemId: string;
  qty: number;
}

export interface RecipeOutput {
  itemId: string;
  qty: number;
}

export interface Recipe {
  id: string;
  name: string;
  /** Item id used as the icon in the recipe row. */
  iconItemId: string;
  station: CraftingStation;
  /** Seconds it takes to craft once inputs are confirmed. */
  craftTime: number;
  inputs: RecipeInput[];
  outputs: RecipeOutput[];
  /** Short flavor / explanation shown beneath the recipe row. */
  description: string;
  /**
   * SWG-style profession gate (recipes.csv `Unlocked By Skill`).
   * `(default)` / omitted = always available.
   */
  unlockedBySkill?: string;
}

/** Full craft + build catalog (CSV-driven). */
export const RECIPES: Recipe[] = GENERATED_RECIPES;

export const STATION_LABELS: Record<CraftingStation, string> = {
  none: 'Hand',
  campfire: 'Campfire',
  cooking_rack: 'Cooking Rack',
  workbench: 'Workbench',
  drying_rack: 'Drying Rack',
  anvil: 'Anvil',
  hammer_tool: 'Hammer (Build)',
};

/** Cheap helper so the UI can group by station without re-traversing. */
export function recipesByStation(station: CraftingStation): Recipe[] {
  return RECIPES.filter((r) => r.station === station);
}

export function recipesByCategoryPrefix(prefix: string): Recipe[] {
  return RECIPES.filter((r) => r.id.startsWith(prefix));
}

export function buildRecipes(): Recipe[] {
  return RECIPES.filter((r) => r.id.startsWith('build_') || r.station === 'hammer_tool');
}

export function craftRecipes(): Recipe[] {
  return RECIPES.filter((r) => !r.id.startsWith('build_'));
}
