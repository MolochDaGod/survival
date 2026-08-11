/**
 * Re-export survival item catalog from the shared game-systems package.
 * Single source of truth — also served by GET /api/game/items.
 */
export type {
  SurvivalCategory,
  ConsumeEffect,
  SurvivalItemDef,
} from '@workspace/game-systems/crafting';
export {
  SURVIVAL_ITEMS,
  getSurvivalItem,
  listSurvivalItems,
  itemsByCategory,
} from '@workspace/game-systems/crafting';
