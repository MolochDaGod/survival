/**
 * Wild West small-town prefab (Grudges).
 *
 * Scene GLB: public/locations/wild-west-town.glb
 * Source zip: D:\Games\diorama_modular_wild_west_stylized_lowpoly.zip
 *
 * Prefab rules (product):
 *  - Small town hub
 *  - 4 vendors + 4 neutral guards
 *  - Player-held base = friendly zone (no enemy spawn)
 *  - No player building inside the zone
 */
import * as THREE from 'three';

export const WILD_WEST_TOWN = {
  mapName: 'wild-west-town',
  label: 'Dusty Gulch (Small Town)',
  /** Friendly / no-build / no-hostile-spawn radius around spawn (metres). */
  friendlyRadiusM: 40,
  allowBuild: false,
} as const;

export type TownNpcRole = 'vendor' | 'guard';

export interface TownNpcDef {
  id: string;
  label: string;
  role: TownNpcRole;
  talkLine: string;
  /** Offset from town centre / player spawn (metres). */
  offset: { x: number; z: number };
  /** Neutral guards never aggro unless attacked; vendors stand still. */
  faction: 'friendly' | 'neutral';
}

/** 4 vendors + 4 neutral guards arranged around a small town square. */
export const WILD_WEST_NPCS: readonly TownNpcDef[] = [
  {
    id: 'ww_vendor_general',
    label: 'General Store — Sal',
    role: 'vendor',
    talkLine: '"Beans, bullets, and boardwalk gossip. What\'ll it be?"',
    offset: { x: -10, z: -6 },
    faction: 'friendly',
  },
  {
    id: 'ww_vendor_gun',
    label: 'Gunsmith — Rex',
    role: 'vendor',
    talkLine: '"Keep that iron clean, stranger. Dust don\'t shoot straight."',
    offset: { x: 10, z: -6 },
    faction: 'friendly',
  },
  {
    id: 'ww_vendor_stable',
    label: 'Stable Hand — Mae',
    role: 'vendor',
    talkLine: '"Horses rest. You rest. Town\'s safe inside the rails."',
    offset: { x: -10, z: 8 },
    faction: 'friendly',
  },
  {
    id: 'ww_vendor_saloon',
    label: 'Saloonkeep — Dolly',
    role: 'vendor',
    talkLine: '"First drink\'s water. Second\'s your business."',
    offset: { x: 10, z: 8 },
    faction: 'friendly',
  },
  {
    id: 'ww_guard_n',
    label: 'Town Guard (North)',
    role: 'guard',
    talkLine: '"North gate\'s clear. Stay friendly and we stay friendly."',
    offset: { x: 0, z: -16 },
    faction: 'neutral',
  },
  {
    id: 'ww_guard_s',
    label: 'Town Guard (South)',
    role: 'guard',
    talkLine: '"You\'re on claimed ground. No claim-jumping."',
    offset: { x: 0, z: 16 },
    faction: 'neutral',
  },
  {
    id: 'ww_guard_e',
    label: 'Town Guard (East)',
    role: 'guard',
    talkLine: '"Rails mark the friendly zone. Outside, watch your back."',
    offset: { x: 16, z: 0 },
    faction: 'neutral',
  },
  {
    id: 'ww_guard_w',
    label: 'Town Guard (West)',
    role: 'guard',
    talkLine: '"No building inside the town claim. Sheriff\'s orders."',
    offset: { x: -16, z: 0 },
    faction: 'neutral',
  },
] as const;

/** True when world position is inside the player-held friendly base (no build). */
export function isInFriendlyBase(
  worldPos: THREE.Vector3,
  centre: THREE.Vector3,
  radiusM: number = WILD_WEST_TOWN.friendlyRadiusM,
): boolean {
  const dx = worldPos.x - centre.x;
  const dz = worldPos.z - centre.z;
  return dx * dx + dz * dz <= radiusM * radiusM;
}

/** Build permission for Grudges: never inside friendly town claim. */
export function canPlayerBuildAt(
  worldPos: THREE.Vector3,
  centre: THREE.Vector3 | null,
): boolean {
  if (!centre) return true;
  if (!WILD_WEST_TOWN.allowBuild && isInFriendlyBase(worldPos, centre)) return false;
  return true;
}
