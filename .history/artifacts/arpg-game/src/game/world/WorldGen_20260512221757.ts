/**
 * World generation — height function, biomes, feature seeding.
 *
 * The world is 6 400 m × 6 400 m (≈ 4 miles × 4 miles), centred on the origin.
 * Coordinates run from –3 200 to +3 200 on both axes.
 *
 * Height map:
 *   • Multi-octave fBm noise scaled to a –30 … +80 m range.
 *   • An island gradient pulls the outer 50 % toward deep ocean.
 *   • Ridged noise carves river valleys.
 *   • A flat disc of ARENA_RADIUS around the origin is always y = 0
 *     (the starting camp area).
 */

import { fbm, ridgedFbm, smoothstep, noise2D } from './Noise';

// ─── World constants ───────────────────────────────────────────────────────────

export const WORLD_HALF = 3200;          // metres from centre to edge
export const WORLD_SIZE = WORLD_HALF * 2;// total extent

export const SEA_LEVEL   = 0;
export const ARENA_RADIUS = 30;          // flat safe zone around spawn

const BASE_FREQ   = 0.00045;   // ~2 000 m per major noise cycle
const DETAIL_FREQ = 0.0016;    // ~600 m medium detail
const MICRO_FREQ  = 0.005;     // ~200 m micro variation

// ─── Island gradient ──────────────────────────────────────────────────────────

function islandMask(x: number, z: number): number {
  // Chebyshev distance → smooth island silhouette with some coastline irregularity
  const nx = x / WORLD_HALF;
  const nz = z / WORLD_HALF;
  const d = Math.sqrt(nx * nx * 0.9 + nz * nz * 1.1);  // slightly oval
  // Add coastal noise so shores are irregular
  const cn = (noise2D(x * 0.0006, z * 0.0006) * 0.5 + 0.5) * 0.18;
  return 1 - smoothstep(0.42 + cn, 0.92, d);
}

// ─── Main height function ─────────────────────────────────────────────────────

/**
 * Returns terrain height at world (x, z) in metres.
 * Values below 0 are underwater; 0 is sea level.
 */
export function worldHeight(x: number, z: number): number {
  // Keep starting arena perfectly flat
  const dist = Math.sqrt(x * x + z * z);
  if (dist <= ARENA_RADIUS) return 0;

  const island = islandMask(x, z);

  // Base continental shape (low frequency)
  const base = fbm(x * BASE_FREQ, z * BASE_FREQ, 6, 2.0, 0.55);  // –1 .. +1

  // Medium hills
  const detail = fbm(x * DETAIL_FREQ + 3.7, z * DETAIL_FREQ + 1.4, 4, 2.0, 0.5) * 0.45;

  // Micro texture
  const micro = fbm(x * MICRO_FREQ + 7.1, z * MICRO_FREQ + 5.3, 3, 2.0, 0.5) * 0.12;

  // Mountain uplift in high-noise zones
  const mountainMask = smoothstep(0.15, 0.55, base) * smoothstep(0.2, 0.7, island);
  const mountains = fbm(x * BASE_FREQ * 1.8 + 2.0, z * BASE_FREQ * 1.8, 5, 2.2, 0.48) * mountainMask * 60;

  // River carving — ridged noise digs narrow valleys
  const rivers = ridgedFbm(x * BASE_FREQ * 1.2 + 11.3, z * BASE_FREQ * 1.2 + 4.7, 3);
  const riverCarve = Math.max(0, (0.88 - rivers)) * 25 * smoothstep(0, 0.3, island);

  // Combine
  let h = (base + detail + micro) * 50 * island;
  h += mountains;
  h -= riverCarve;
  h -= (1 - island) * 40;   // deep ocean at world edges

  // Smooth transition from arena to world terrain
  if (dist < ARENA_RADIUS + 20) {
    const blend = smoothstep(ARENA_RADIUS, ARENA_RADIUS + 20, dist);
    h = h * blend;
  }

  return h;
}

// ─── Biomes ───────────────────────────────────────────────────────────────────

export const enum Biome {
  DeepOcean  = 0,
  Ocean      = 1,
  ShallowSea = 2,
  Beach      = 3,
  Grassland  = 4,
  Forest     = 5,
  Highland   = 6,
  Mountain   = 7,
  SnowPeak   = 8,
}

export function getBiome(h: number): Biome {
  if (h < -20) return Biome.DeepOcean;
  if (h < -8)  return Biome.Ocean;
  if (h < -0.5)return Biome.ShallowSea;
  if (h <  1.5)return Biome.Beach;
  if (h <  12) return Biome.Grassland;
  if (h <  28) return Biome.Forest;
  if (h <  45) return Biome.Highland;
  if (h <  65) return Biome.Mountain;
  return Biome.SnowPeak;
}

/** RGB vertex colour in 0-1 range for each biome. */
export function getBiomeColor(biome: Biome): [number, number, number] {
  switch (biome) {
    case Biome.DeepOcean:  return [0.03, 0.06, 0.16];
    case Biome.Ocean:      return [0.04, 0.10, 0.24];
    case Biome.ShallowSea: return [0.07, 0.17, 0.32];
    case Biome.Beach:      return [0.76, 0.72, 0.52];
    case Biome.Grassland:  return [0.24, 0.46, 0.14];
    case Biome.Forest:     return [0.10, 0.30, 0.09];
    case Biome.Highland:   return [0.44, 0.40, 0.26];
    case Biome.Mountain:   return [0.52, 0.50, 0.47];
    case Biome.SnowPeak:   return [0.90, 0.92, 0.96];
  }
}

/** Returns true if the biome is below sea level (should not have trees / buildings). */
export function isWater(biome: Biome): boolean {
  return biome <= Biome.ShallowSea;
}

/** Returns true if the biome can have forest trees. */
export function isForestBiome(biome: Biome): boolean {
  return biome === Biome.Forest || biome === Biome.Highland;
}

// ─── Settlement seeding ───────────────────────────────────────────────────────

export interface SettlementDef {
  x: number;
  z: number;
  type: 'town' | 'camp' | 'outpost' | 'cave';
  name: string;
}

const SETTLEMENT_NAMES = [
  'Ashveil', 'Thornmere', 'Duskwall', 'Ironmoor', 'Crestfall',
  'Embervast', 'Stonehaven', 'Reedholm', 'Blackpeak', 'Graymoor',
  'Frostgate', 'Dunshire',
];

const CAMP_NAMES = ['Survivor Camp Alpha', 'Survivor Camp Beta', 'Survivor Camp Gamma', 'Survivor Camp Delta'];
const CAVE_NAMES  = ['Dark Maw Cave', 'Howling Pit', 'Stone Throat', 'Shadow Den'];
const POST_NAMES  = ['Watch Post Kestrel', 'Scout Point Raven', 'Lookout Hawk', 'Perch Falcon'];

/**
 * Pre-seeded settlement locations on land (verified at generation time).
 * Calling this multiple times returns the same list.
 */
let _cachedSettlements: SettlementDef[] | null = null;

export function getSettlements(): SettlementDef[] {
  if (_cachedSettlements) return _cachedSettlements;

  const settlements: SettlementDef[] = [];

  // Eight towns in a rough ring at 500–1400 m from centre
  const townAngles = [0.3, 1.1, 1.9, 2.8, 3.7, 4.5, 5.3, 6.0];
  townAngles.forEach((angle, i) => {
    const radius = 600 + ((i * 137) % 700);
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    const h = worldHeight(x, z);
    if (h > 1) {
      settlements.push({ x, z, type: 'town', name: SETTLEMENT_NAMES[i % SETTLEMENT_NAMES.length] });
    }
  });

  // Four survivor camps at medium range
  const campAngles = [0.8, 2.4, 4.0, 5.6];
  campAngles.forEach((angle, i) => {
    const radius = 900 + ((i * 211) % 500);
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    const h = worldHeight(x, z);
    if (h > 1) {
      settlements.push({ x, z, type: 'camp', name: CAMP_NAMES[i] });
    }
  });

  // Four cave entrances in hills
  const caveAngles = [1.5, 3.1, 4.7, 0.1];
  caveAngles.forEach((angle, i) => {
    const radius = 400 + ((i * 97) % 600);
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    const h = worldHeight(x, z);
    if (h > 10) {
      settlements.push({ x, z, type: 'cave', name: CAVE_NAMES[i] });
    }
  });

  // Four outposts at outer range
  const outpostAngles = [0.5, 1.9, 3.4, 5.0];
  outpostAngles.forEach((angle, i) => {
    const radius = 1400 + ((i * 173) % 800);
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    const h = worldHeight(x, z);
    if (h > 1) {
      settlements.push({ x, z, type: 'outpost', name: POST_NAMES[i] });
    }
  });

  _cachedSettlements = settlements;
  return settlements;
}
