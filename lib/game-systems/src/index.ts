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

// Derived Stats (legacy STR/VIT sheet — prefer Nexus bake for voxel era)
export {
  computeDerivedStats, derivedToCombatStats, derivedToResistances,
  DERIVED_STAT_META,
  type DerivedStats, type DerivedStatMeta,
} from './derivedStats.js';

// Nexus bake — BIO…GRA → 37 derived + Main Panel / voxel-era defaults
export {
  DEFAULT_STATS,
  VOXEL_ERA_STARTER_STATS,
  cloneStats,
  isValidGrudgeStats,
  NEXUS_PRIMARY,
  NEXUS_DERIVED_META,
  computeDerivedFromNexus,
  applyNexusToPlayerStats,
  createVoxelEraNexusDefaults,
  type NexusAffinity,
  type NexusPrimaryDef,
  type NexusDerivedSheet,
} from './nexusDerived.js';

// Deployables (turrets, drones, mechs, beacons + entity role system)
export {
  ENTITY_ROLES, ROLE_AI_GOALS, ROLE_COLORS,
  DEPLOYABLE_KINDS, DEPLOYABLES,
  getDeployable, getDeployablesByKind, getDeployablesByUnlock, getUnlockedDeployables,
  scaleDeployableStats,
  type EntityRole, type DeployableKind, type DeployableDef, type DeployableAnimSet,
} from './deployables.js';

// Perks (Nexus milestone perk effects — quantified from STAT_MILESTONE_PERKS)
export {
  getMilestoneEffects, mergeEffectBags, readEffect,
  MILESTONE_EFFECTS,
  type MilestoneEffectBag,
} from './perks.js';

// Loot (Diablo-style affix generation, tier-scaled drops)
export {
  AFFIX_POOL, AFFIX_COUNT_BY_TIER,
  generateLootDrop, rollDropTier, formatAffixTooltip,
  tierValueMultiplier,
  type AffixDef, type AffixSlotType, type RolledAffix, type LootDrop,
} from './loot.js';
