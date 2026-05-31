/**
 * sectors — the five named territories of the surface map.
 *
 * Each sector is a faction-owned region on the 6400m × 6400m world.
 * The world is centred on (0,0), so sector centres sit at roughly
 * (±1900, ±1900) on the cardinals/diagonals with one northern uplift.
 *
 * Geometry is intentionally simple — a centre + radius disc — so the
 * minimap, settlement seeder, and (future) AI raid planner can do
 * point-in-sector tests with one distance check.
 *
 * Overlap is permitted: where two discs intersect is contested ground.
 * `getSectorForPosition()` returns whichever sector is closest by
 * centre-distance ratio, so a point on a border resolves deterministically.
 *
 * Outside every sector radius is the **Wildlands** — independent, no
 * faction owns it. That's where neutral wandering survivors and most
 * world-spawn POIs live.
 */

import type { FactionId } from './factions';

export interface SectorDef {
  id: string;
  name: string;
  /** Faction that claims this territory. */
  owner: FactionId;
  /** Centre in world metres (matches WorldGen coordinate space). */
  center: { x: number; z: number };
  /** Radius of the territory in metres. */
  radius: number;
  /** Biome bias — what terrain this region tends toward (descriptive only). */
  biomeBias: 'highland' | 'forest' | 'grassland' | 'pit' | 'coast' | 'wreckage';
  /** Description for tooltips and the world-map legend. */
  description: string;
}

export const SECTORS: SectorDef[] = [
  {
    id: 'cathedral_highlands',
    name: 'Cathedral Highlands',
    owner: 'keepers',
    center: { x: 0, z: -1900 },
    radius: 1100,
    biomeBias: 'highland',
    description: 'Mountain shrines, ritual circles, hallowed stone. The Keepers hold the high ground and the old chapels.',
  },
  {
    id: 'junkyards',
    name: 'The Junkyards',
    owner: 'tech_scavengers',
    center: { x: 1900, z: 0 },
    radius: 1100,
    biomeBias: 'wreckage',
    description: 'Salvage fields and workshop sheds. Every wreck is a parts shop. Pistol fire and grinding wheels at all hours.',
  },
  {
    id: 'the_pit',
    name: 'The Pit',
    owner: 'hollow_lords',
    center: { x: 0, z: 1900 },
    radius: 1100,
    biomeBias: 'pit',
    description: 'Sunken shaft-mouths and warband barracks. The Hollow Lords rule from the deep shafts and stage raids on the surface.',
  },
  {
    id: 'switchyard',
    name: 'The Switchyard',
    owner: 'network',
    center: { x: -1900, z: 0 },
    radius: 1100,
    biomeBias: 'grassland',
    description: 'Rail relays and signal towers. The Network sells locations, runs caravans, never raids.',
  },
  {
    id: 'drowned_quarter',
    name: 'The Drowned Quarter',
    owner: 'forgotten',
    center: { x: 1500, z: 1500 },
    radius: 950,
    biomeBias: 'coast',
    description: 'Sunken streets and tidal flats. The Forgotten move with the water — poison-tipped, silent, patient.',
  },
];

/** Lookup a sector by id. Returns undefined for the wildlands. */
export function getSector(id: string): SectorDef | undefined {
  return SECTORS.find(s => s.id === id);
}

/** Find the sector that owns (x,z), or null if it's in the wildlands. */
export function getSectorForPosition(x: number, z: number): SectorDef | null {
  let best: SectorDef | null = null;
  let bestRatio = 1.0; // ratio = dist / radius; <1 means inside
  for (const s of SECTORS) {
    const dx = x - s.center.x;
    const dz = z - s.center.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const ratio = dist / s.radius;
    if (ratio < bestRatio) {
      bestRatio = ratio;
      best = s;
    }
  }
  return best;
}

/** Owning faction for a coord, or null if wildlands (no faction claim). */
export function getOwnerFor(x: number, z: number): FactionId | null {
  return getSectorForPosition(x, z)?.owner ?? null;
}
