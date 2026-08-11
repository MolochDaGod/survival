/**
 * Items — survival item catalog.
 * Thin export path for `@workspace/game-systems/items`.
 *
 * Full surface also lives at `@workspace/game-systems/crafting`.
 */
export {
  SURVIVAL_ITEMS,
  itemsByCategory,
  type SurvivalCategory,
  type ConsumeEffect,
  type SurvivalItemDef,
} from './crafting/survivalItems.js';

export {
  getSurvivalItem,
  listSurvivalItems,
} from './crafting/index.js';
