/**
 * EnemyCampBuildings — procedural build kit unlocked as AI camps tier up.
 *
 * Maps gameplay roles (furnace, workbench, forestry, mystic, cooking,
 * defenses) to PrefabSystem ids and places them on a ring around the
 * central enemy_camp GLB.
 */

import type { FactionId } from '../../data/factions';
import type { AICampTier } from './EnemyCampGrowth';
import type { CampMissionKind } from '../quest/EnemyCampMissions';

export type CampBuildingRole =
  | 'campfire'
  | 'furnace'
  | 'workbench'
  | 'cooking'
  | 'forestry'
  | 'miner'
  | 'mystic'
  | 'defense_wall'
  | 'defense_dummy'
  | 'defense_post';

const TIER_ORDER: AICampTier[] = ['outpost', 'camp', 'war_camp', 'stronghold'];

export function tierIndex(tier: AICampTier): number {
  return TIER_ORDER.indexOf(tier);
}

export interface CampBuildingSlot {
  slotId: string;
  prefabId: string;
  role: CampBuildingRole;
  minTier: AICampTier;
  /** Metres from camp centre. */
  radius: number;
  /** Radians offset from camp layout phase. */
  angle: number;
  scaleMul?: number;
  collide?: boolean;
}

/** Deterministic facing offset from world position. */
export function campLayoutPhase(x: number, z: number): number {
  const phase = ((x * 73856093) ^ (z * 19349663)) >>> 0;
  return (phase % 1000) / 1000 * Math.PI * 2;
}

/** Core layout — cumulative unlocks per tier. */
const BASE_LAYOUT: CampBuildingSlot[] = [
  // ── Outpost: fire + stash ─────────────────────────────────────────────────
  { slotId: 'fire',      prefabId: 'campfire',    role: 'campfire',      minTier: 'outpost',    radius: 5,  angle: 0 },
  { slotId: 'stash',     prefabId: 'scrap_pile',  role: 'workbench',     minTier: 'outpost',    radius: 7,  angle: 0.9, scaleMul: 0.85 },

  // ── Camp: crafting ring ───────────────────────────────────────────────────
  { slotId: 'workbench', prefabId: 'workbench',   role: 'workbench',     minTier: 'camp',       radius: 10, angle: 1.4 },
  { slotId: 'cooking',   prefabId: 'camp_stove',  role: 'cooking',       minTier: 'camp',       radius: 9,  angle: 2.3 },
  { slotId: 'forestry',  prefabId: 'woodcutter',  role: 'forestry',      minTier: 'camp',       radius: 12, angle: 3.8 },
  { slotId: 'forage',    prefabId: 'hemp',        role: 'forestry',      minTier: 'camp',       radius: 11, angle: 4.6, scaleMul: 0.9 },

  // ── War camp: industry + mystic + light defense ───────────────────────────
  { slotId: 'furnace',   prefabId: 'smeltery',    role: 'furnace',       minTier: 'war_camp',   radius: 11, angle: 5.2, scaleMul: 0.9 },
  { slotId: 'miner',     prefabId: 'ore_crystals',role: 'miner',         minTier: 'war_camp',   radius: 13, angle: 0.5 },
  { slotId: 'mystic',    prefabId: 'plinth',      role: 'mystic',        minTier: 'war_camp',   radius: 8,  angle: 5.9 },
  { slotId: 'dummy',     prefabId: 'rts_target',  role: 'defense_dummy', minTier: 'war_camp',   radius: 14, angle: 1.0 },
  { slotId: 'wall_n',    prefabId: 'brick_wall',  role: 'defense_wall',  minTier: 'war_camp',   radius: 16, angle: -Math.PI / 2 },

  // ── Stronghold: full production + perimeter ───────────────────────────────
  { slotId: 'bakery',    prefabId: 'bakery',      role: 'cooking',       minTier: 'stronghold', radius: 15, angle: 2.9, scaleMul: 0.85 },
  { slotId: 'gems',      prefabId: 'crystal_gems',role: 'mystic',        minTier: 'stronghold', radius: 9,  angle: 6.1 },
  { slotId: 'smith',     prefabId: 'weaponsmith', role: 'workbench',     minTier: 'stronghold', radius: 17, angle: 3.2, scaleMul: 0.9 },
  { slotId: 'wall_e',    prefabId: 'brick_wall',  role: 'defense_wall',  minTier: 'stronghold', radius: 18, angle: 0 },
  { slotId: 'wall_s',    prefabId: 'brick_wall',  role: 'defense_wall',  minTier: 'stronghold', radius: 18, angle: Math.PI },
  { slotId: 'wall_w',    prefabId: 'brick_wall',  role: 'defense_wall',  minTier: 'stronghold', radius: 18, angle: Math.PI / 2 },
  { slotId: 'barracks',  prefabId: 'house_orc',   role: 'defense_post',  minTier: 'stronghold', radius: 20, angle: 1.7, scaleMul: 0.9 },
];

/** Faction-specific extra slots (added when tier threshold met). */
const FACTION_EXTRAS: Partial<Record<FactionId, CampBuildingSlot[]>> = {
  keepers: [
    { slotId: 'fk_shrine', prefabId: 'plinth',      role: 'mystic',        minTier: 'camp',       radius: 7,  angle: 2.0 },
    { slotId: 'fk_relic',  prefabId: 'crystal_gems',role: 'mystic',        minTier: 'war_camp',   radius: 10, angle: 4.0 },
  ],
  tech_scavengers: [
    { slotId: 'ts_bench2', prefabId: 'weaponsmith', role: 'workbench',     minTier: 'camp',       radius: 11, angle: 0.3, scaleMul: 0.85 },
    { slotId: 'ts_scrap',  prefabId: 'scrap_pile',  role: 'miner',         minTier: 'camp',       radius: 13, angle: 1.8 },
    { slotId: 'ts_smelt',  prefabId: 'smeltery',    role: 'furnace',       minTier: 'war_camp',   radius: 12, angle: 5.5, scaleMul: 0.8 },
  ],
  hollow_lords: [
    { slotId: 'hl_drums',  prefabId: 'rts_target',  role: 'defense_dummy', minTier: 'camp',       radius: 13, angle: 3.0 },
    { slotId: 'hl_hut',    prefabId: 'house_orc',   role: 'defense_post',  minTier: 'war_camp',   radius: 16, angle: 4.4, scaleMul: 0.85 },
  ],
  network: [
    { slotId: 'nw_market', prefabId: 'caravan',     role: 'workbench',     minTier: 'camp',       radius: 14, angle: Math.PI },
    { slotId: 'nw_post',   prefabId: 'house_human', role: 'defense_post',  minTier: 'war_camp',   radius: 17, angle: 2.5, scaleMul: 0.85 },
  ],
  forgotten: [
    { slotId: 'fg_herbs',  prefabId: 'hemp',        role: 'mystic',        minTier: 'camp',       radius: 8,  angle: 1.1 },
    { slotId: 'fg_stove',  prefabId: 'camp_stove',  role: 'cooking',       minTier: 'war_camp',   radius: 10, angle: 3.3 },
  ],
};

const PATROL_LAYOUT: CampBuildingSlot[] = [
  { slotId: 'patrol_fire', prefabId: 'campfire',   role: 'campfire',      minTier: 'outpost', radius: 4, angle: 0 },
  { slotId: 'patrol_dummy',prefabId: 'rts_target', role: 'defense_dummy', minTier: 'camp',    radius: 7, angle: 1.5 },
];

export interface CampBuildContext {
  kind: CampMissionKind;
  tier: AICampTier;
  factionId: FactionId | null;
  x: number;
  z: number;
}

/** All building slots that should exist for this camp at its current tier. */
export function slotsForCamp(ctx: CampBuildContext): CampBuildingSlot[] {
  const maxIdx = tierIndex(ctx.tier);
  if (ctx.kind === 'patrol') {
    return PATROL_LAYOUT.filter(s => tierIndex(s.minTier) <= maxIdx);
  }

  const slots = [...BASE_LAYOUT];
  if (ctx.factionId && FACTION_EXTRAS[ctx.factionId]) {
    slots.push(...FACTION_EXTRAS[ctx.factionId]!);
  }

  return slots.filter(s => tierIndex(s.minTier) <= maxIdx);
}

/** World-space placement for a slot relative to camp centre. */
export function slotWorldPosition(
  campX: number,
  campZ: number,
  slot: CampBuildingSlot,
  phase: number,
): { x: number; z: number; ry: number } {
  const a  = phase + slot.angle;
  const r  = slot.radius;
  const x  = campX + Math.cos(a) * r;
  const z  = campZ + Math.sin(a) * r;
  const ry = a + Math.PI;
  return { x, z, ry };
}