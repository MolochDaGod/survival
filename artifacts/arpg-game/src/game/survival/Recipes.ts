/**
 * Re-export survival crafting recipes from the shared game-systems package.
 * Single source of truth — also served by GET /api/game/recipes.
 */
export type {
  CraftingStation,
  RecipeInput,
  RecipeOutput,
  Recipe,
} from '@workspace/game-systems/crafting';
export {
  RECIPES,
  RECIPE_STATIONS,
  getRecipe,
  getRecipesByStation,
  recipesByStation,
} from '@workspace/game-systems/crafting';
