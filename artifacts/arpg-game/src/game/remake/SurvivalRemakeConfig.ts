/**
 * SurvivalRemakeConfig — canonical GRUDGES Survival remake constants.
 *
 * Host: https://grudges.grudge-studio.com/arpg-game/
 * Lore: five factions, claim flag camps, living NPCs, 20 km surface.
 *
 * Scale: 1 unit = 1 metre throughout terrain, colliders, characters.
 */

/** World half-extent (metres) — full map is 20 km × 20 km. */
export const WORLD_HALF_EXTENT_M = 10_000;

/** Player target height (metres) for all toon / Quaternius bodies. */
export const PLAYER_HEIGHT_M = 1.8;

/** Default camera for remake — third-person shooter, not ARPG top-down. */
export const REMAKE_DEFAULT_CAMERA = 'third-person' as const;

/** Open-world stream begins beyond encampment footprint. */
export const REMAKE_OPEN_WORLD_STREAM_M = 250;

/**
 * Hub no-hostile circle (metres) around the baked spawn / encampment.
 * Production safe zone — must cover walkable city + starter pad.
 * Enemy spawn rings sit outside this radius (see SafeZoneSystem).
 */
export const HUB_SAFE_ZONE_RADIUS_M = 200;

/** Ally combat engagement radius around player. */
export const ALLY_COMBAT_RADIUS_M = 28;

/** Ally melee damage (base) — scales lightly with township tier later. */
export const ALLY_MELEE_DAMAGE = 12;

/** Camp claim radius (matches CampClaimSystem). */
export const CAMP_CLAIM_RADIUS_M = 80;

/**
 * TPS camera tuning (over-the-shoulder).
 * ADS tightens Z and widens shoulder bias in PlayerController.
 */
export const TUNING_TPS = {
  idealOffset: { x: 0.55, y: 1.55, z: -3.4 },
  idealLookat: { x: 0.15, y: 1.45, z: 0.85 },
  follow: 14,
  look: 16,
  adsFov: 42,
  hipFov: 58,
  adsShoulderMul: 1.55,
  adsDollyZ: 0.48,
};

/** Lore blurb for spawn toast / sector objective. */
export const REMAKE_SPAWN_LORE = {
  title: 'Convergence Nexus',
  line: 'Stake a claim. Recruit survivors. The Way left us the surface — make it yours.',
  modeHint: 'M mode · RMB focus · Shift dodge · F hire · B build',
};

/** Faction road names for HUD / deploy. */
export const FACTION_ROADS = [
  { id: 'keepers', name: 'Pilgrim Road', dir: 'N' },
  { id: 'tech_scavengers', name: 'Scrap Highway', dir: 'E' },
  { id: 'hollow_lords', name: 'Descent Road', dir: 'S' },
  { id: 'network', name: 'Rail Line West', dir: 'W' },
  { id: 'forgotten', name: 'Tidal Path', dir: 'SE' },
] as const;
