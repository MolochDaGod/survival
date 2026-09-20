/**
 * Crafting recipes for Grudges survival (shared by API + website).
 *
 * SSOT: artifacts/arpg-game/docs/inventory/recipes.csv
 * Regen: node scripts/gen-recipes-from-csv.mjs
 *
 * Runtime array is GENERATED_RECIPES — do not hand-append gameplay recipes here.
 */

import { GENERATED_RECIPES } from './recipes.generated.js';

export type CraftingStation =
  | 'none'
  | 'campfire'
  | 'cooking_rack'
  | 'workbench'
  | 'drying_rack'
  | 'anvil'
  | 'hammer_tool'
  /** @deprecated camp claim alias — prefer workbench / anvil */
  | 'profession_bench';

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
  /** Profession gate from recipes.csv (`(default)` = always available). */
  unlockedBySkill?: string;
}

/** Full craft + build catalog (CSV-driven). */
export const RECIPES: Recipe[] = GENERATED_RECIPES;

/** Cheap helper so the UI can group by station without re-traversing. */
export function recipesByStation(station: CraftingStation): Recipe[] {
  return RECIPES.filter((r) => r.station === station);
}
