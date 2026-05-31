/**
 * World generation — height function, biomes, feature seeding.
 *
 * The world is 20 000 m × 20 000 m (20 km × 20 km), centred on the origin.
 * Five faction sectors, each 4 km × 4 km, arranged around the map with
 * wildlands between them. Coordinates run from –10 000 to +10 000 on both axes.
 *
 * Height map:
 *   • Multi-octave fBm noise scaled to a –30 … +120 m range.
 *   • An island gradient pulls the outer edge toward deep ocean.
 *   • Ridged noise carves river valleys.
 *   • A flat disc of ARENA_RADIUS around the origin is always y = 0
 *     (the starting encampment area).
 */

import { fbm, ridgedFbm, smoothstep, noise2D } from './Noise';

// ─── World constants ───────────────────────────────────────────────────────────

export const WORLD_HALF = 10000;         // metres from centre to edge (20 km total)
export const WORLD_SIZE = WORLD_HALF * 2;// total extent

export const SEA_LEVEL   = 0;
export const ARENA_RADIUS = 50;          // flat safe zone around encampment spawn

// Frequencies scaled for 20 km world — proportional terrain features
const BASE_FREQ   = 0.00015;   // ~6 600 m per major noise cycle
const DETAIL_FREQ = 0.0005;    // ~2 000 m medium detail
const MICRO_FREQ  = 0.002;     // ~500 m micro variation

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
  const mountains = fbm(x * BASE_FREQ * 1.8 + 2.0, z * BASE_FREQ * 1.8, 5, 2.2, 0.48) * mountainMask * 90;

  // River carving — ridged noise digs narrow valleys
  const rivers = ridgedFbm(x * BASE_FREQ * 1.2 + 11.3, z * BASE_FREQ * 1.2 + 4.7, 3);
  const riverCarve = Math.max(0, (0.88 - rivers)) * 35 * smoothstep(0, 0.3, island);

  // Combine
  let h = (base + detail + micro) * 65 * island;
  h += mountains;
  h -= riverCarve;
  h -= (1 - island) * 50;   // deep ocean at world edges

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

import { SECTORS } from '../../data/sectors';
import type { FactionId } from '../../data/factions';

export interface SettlementDef {
  x: number;
  z: number;
  type: 'town' | 'camp' | 'outpost' | 'cave';
  name: string;
  /** Owning faction, or null for independent wildlands settlements. */
  factionId: FactionId | null;
  /** Sector id this settlement sits in, or null for wildlands. */
  sectorId: string | null;
}

/** Faction capitals — one town per sector, planted at the sector centre. */
const FACTION_CAPITALS: Record<FactionId, string> = {
  keepers: 'Old Cathedral',
  tech_scavengers: 'The Workshops',
  hollow_lords: 'Iron Pit',
  network: 'The Exchange',
  forgotten: 'Tidewatch',
};

/** Per-faction satellite settlements (camp / cave / outpost). */
interface SatelliteSeed {
  type: 'camp' | 'cave' | 'outpost';
  name: string;
  /** Offset from sector centre as polar (angle radians, distance frac of radius). */
  angle: number;
  distFrac: number;
  /** Minimum world height to accept the placement. */
  minH: number;
}

const FACTION_SATELLITES: Record<FactionId, SatelliteSeed[]> = {
  keepers: [
    { type: 'camp', name: 'Shrine Camp Vesper', angle: 0.4, distFrac: 0.35, minH: 3 },
    { type: 'outpost', name: 'Watch Post Kestrel', angle: 2.1, distFrac: 0.65, minH: 3 },
    { type: 'cave', name: 'Stone Throat', angle: 3.6, distFrac: 0.45, minH: 10 },
    { type: 'outpost', name: 'Pilgrim Gate South', angle: 4.7, distFrac: 0.90, minH: 2 },
  ],
  tech_scavengers: [
    { type: 'camp', name: 'Survivor Camp Alpha', angle: 1.1, distFrac: 0.35, minH: 1 },
    { type: 'outpost', name: 'Scout Point Raven', angle: 4.0, distFrac: 0.70, minH: 1 },
    { type: 'cave', name: 'Dark Maw Cave', angle: 2.6, distFrac: 0.50, minH: 10 },
    { type: 'camp', name: 'Scrap Yard Bravo', angle: 5.5, distFrac: 0.60, minH: 1 },
  ],
  hollow_lords: [
    { type: 'camp', name: 'Warband Camp Iron', angle: 0.8, distFrac: 0.40, minH: 1 },
    { type: 'outpost', name: 'Lookout Hawk', angle: 3.2, distFrac: 0.75, minH: 1 },
    { type: 'cave', name: 'Howling Pit', angle: 5.2, distFrac: 0.40, minH: 10 },
    { type: 'camp', name: 'Slag Forge', angle: 1.5, distFrac: 0.85, minH: 3 },
  ],
  network: [
    { type: 'camp', name: 'Relay Camp Signal', angle: 1.5, distFrac: 0.40, minH: 1 },
    { type: 'outpost', name: 'Perch Falcon', angle: 5.0, distFrac: 0.70, minH: 1 },
    { type: 'cave', name: 'Shadow Den', angle: 2.4, distFrac: 0.45, minH: 10 },
    { type: 'outpost', name: 'Checkpoint Toll', angle: 0.3, distFrac: 0.90, minH: 1 },
  ],
  forgotten: [
    { type: 'camp', name: 'Tide Camp Reed', angle: 0.6, distFrac: 0.40, minH: 1 },
    { type: 'outpost', name: 'Drowned Watch', angle: 3.4, distFrac: 0.70, minH: 1 },
    { type: 'cave', name: 'Silt Grotto', angle: 5.0, distFrac: 0.50, minH: 5 },
  ],
};

/** Independent wildlands settlements — neutral, no faction claim.
 * Scattered in the buffer zones between faction sectors. */
const WILDLANDS_SEEDS: { x: number; z: number; type: SettlementDef['type']; name: string }[] = [
  { x: -800,  z:  1600, type: 'camp',    name: 'Ashveil' },
  { x:  2200, z: -2400, type: 'outpost', name: 'Thornmere' },
  { x: -2800, z: -1800, type: 'camp',    name: 'Duskwall' },
  { x:  1800, z:  2400, type: 'outpost', name: 'Ironmoor' },
  { x: -1800, z:  3200, type: 'camp',    name: 'Crestfall' },
  { x:  3200, z:  1200, type: 'camp',    name: 'Scrapheap' },
  { x: -3000, z:  2800, type: 'outpost', name: 'Windbreak' },
  { x:   400, z: -3600, type: 'cave',    name: 'Deep Hollow' },
  { x: -1200, z: -3000, type: 'camp',    name: 'Frostbite Hollow' },
  { x:  3800, z: -800,  type: 'outpost', name: 'Signal Ridge' },
];

let _cachedSettlements: SettlementDef[] | null = null;

/**
 * Pre-seeded settlement locations. Towns are faction capitals planted at
 * each sector centre; satellites populate each territory; the remainder
 * are independent wildlands camps.
 */
export function getSettlements(): SettlementDef[] {
  if (_cachedSettlements) return _cachedSettlements;

  const settlements: SettlementDef[] = [];

  for (const sector of SECTORS) {
    // Faction capital — guaranteed at the sector centre (or nearest valid land).
    const cx = sector.center.x;
    const cz = sector.center.z;
    const ch = worldHeight(cx, cz);
    if (ch > 0.5) {
      settlements.push({
        x: cx, z: cz, type: 'town', name: FACTION_CAPITALS[sector.owner],
        factionId: sector.owner, sectorId: sector.id,
      });
    }
    // Satellite settlements scattered inside the sector radius.
    const sats = FACTION_SATELLITES[sector.owner] ?? [];
    for (const sat of sats) {
      const x = cx + Math.cos(sat.angle) * sector.radius * sat.distFrac;
      const z = cz + Math.sin(sat.angle) * sector.radius * sat.distFrac;
      const h = worldHeight(x, z);
      if (h > sat.minH) {
        settlements.push({
          x, z, type: sat.type, name: sat.name,
          factionId: sector.owner, sectorId: sector.id,
        });
      }
    }
  }

  // Independent wildlands settlements — only kept if outside every sector.
  for (const w of WILDLANDS_SEEDS) {
    const h = worldHeight(w.x, w.z);
    if (h <= 1) continue;
    const inSector = SECTORS.some(s => {
      const dx = w.x - s.center.x, dz = w.z - s.center.z;
      return (dx * dx + dz * dz) < (s.radius * s.radius);
    });
    if (inSector) continue;
    settlements.push({ ...w, factionId: null, sectorId: null });
  }

  _cachedSettlements = settlements;
  return settlements;
}
