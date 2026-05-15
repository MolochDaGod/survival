/**
 * @workspace/game-systems — Grudge Studio Shared Game Logic
 *
 * Pure TypeScript. Zero runtime dependencies. No Three.js, no React, no DOM.
 * Import from any Grudge Studio app: game client, API server, admin, forge.
 *
 * Usage:
 *   import { STAT_META, calculateDamage, TIERS } from '@workspace/game-systems';
 *   import { GrudgeStats, WeaponStats } from '@workspace/game-systems/types';
 */

// Types (re-export everything)
export * from './types.js';

// Attributes (8 Nexus stats, cost curves, diminishing returns, stat caps)
export {
  STARTING_BUDGET, STAT_MIN, STAT_MAX, STAT_DEFAULT,
  STAT_COST, costToReach, costForNext, computeSpentPoints,
  STAT_META,
  DR_FULL_CAP, DR_HALF_CAP, effectivePoints,
  STAT_CAPS, clampStat,
  STAT_MILESTONE_PERKS, getBadgesEarned,
  type MilestonePerk, type Badge,
} from './attributes.js';

// Combat (damage pipeline, healing, drain)
export {
  DEFAULT_COMBAT_STATS, DEFAULT_RESISTANCES,
  calculateDamage, calculateHealing, calculateDrain,
  applyModifiers,
  type DamageInput, type StatModifier,
} from './combat.js';

// Tiers (T1-T8 gear, crafting stations, harvesting, rarity)
export {
  TIERS, getTierDef, getTierLabel, getTierColor,
  CRAFTING_STATIONS, HARVESTING_PROFESSIONS,
  RARITY_COLORS, RARITY_WEIGHT,
  type CraftingStation, type HarvestingProfession,
} from './tiers.js';

// Loot (Diablo-style affix generation, tier-scaled drops)
export {
  AFFIX_POOL, AFFIX_COUNT_BY_TIER,
  generateLootDrop, rollDropTier, formatAffixTooltip,
  tierValueMultiplier,
  type AffixDef, type AffixSlotType, type RolledAffix, type LootDrop,
} from './loot.js';
