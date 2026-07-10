/**
 * worldGridSectors — 3×3 macro grid (9 sectors) over the 20 km survival world.
 *
 * Aligns with the Grudge Studio 9-sector world map. Each cell is ~6.7 km.
 * Faction territories from `sectors.ts` map onto these cells; corner cells
 * are contested wildlands where AI factions plant starter island camps.
 */

import type { FactionId } from './factions';
import { WORLD_HALF } from '../game/world/WorldGen';

export const GRID_SECTOR_SPAN_M = (WORLD_HALF * 2) / 3;

export interface WorldGridSector {
  id: string;
  name: string;
  /** Grid column 0–2 (west → east). */
  col: number;
  /** Grid row 0–2 (north → south). */
  row: number;
  center: { x: number; z: number };
  /** Owning faction AI — null = contested wildlands or player safe zone. */
  owner: FactionId | null;
  /** Player spawn / no hostile AI camps. */
  isSafeZone?: boolean;
  /** Linked territory id from sectors.ts when applicable. */
  territoryId?: string;
}

function gridCenter(col: number, row: number): { x: number; z: number } {
  const span = GRID_SECTOR_SPAN_M;
  const x0   = -WORLD_HALF + span * 0.5;
  const z0   = -WORLD_HALF + span * 0.5;
  return { x: x0 + col * span, z: z0 + row * span };
}

/** Canonical 9-sector layout (north row = row 0). */
export const WORLD_GRID_SECTORS: WorldGridSector[] = [
  { id: 'grid_nw_wilds',      name: 'Frostbite Fringe',    col: 0, row: 0, center: gridCenter(0, 0), owner: 'keepers',         territoryId: 'frostbite_fringe' },
  { id: 'grid_north_uplands', name: 'Cathedral Highlands', col: 1, row: 0, center: gridCenter(1, 0), owner: 'keepers',         territoryId: 'cathedral_highlands' },
  { id: 'grid_ne_scrub',      name: 'Stormbreak Scrub',    col: 2, row: 0, center: gridCenter(2, 0), owner: 'tech_scavengers', territoryId: 'stormbreak_scrub' },
  { id: 'grid_west_rail',     name: 'The Switchyard',      col: 0, row: 1, center: gridCenter(0, 1), owner: 'network',         territoryId: 'switchyard' },
  { id: 'grid_convergence',   name: 'Convergence Nexus',   col: 1, row: 1, center: gridCenter(1, 1), owner: null, isSafeZone: true, territoryId: 'convergence_nexus' },
  { id: 'grid_east_junk',     name: 'The Junkyards',       col: 2, row: 1, center: gridCenter(2, 1), owner: 'tech_scavengers', territoryId: 'junkyards' },
  { id: 'grid_sw_marsh',      name: 'Silt Marshes',        col: 0, row: 2, center: gridCenter(0, 2), owner: 'forgotten',       territoryId: 'silt_marshes' },
  { id: 'grid_south_pit',     name: 'The Pit',             col: 1, row: 2, center: gridCenter(1, 2), owner: 'hollow_lords',    territoryId: 'the_pit' },
  { id: 'grid_se_drowned',    name: 'Drowned Quarter',     col: 2, row: 2, center: gridCenter(2, 2), owner: 'forgotten',       territoryId: 'drowned_quarter' },
];

/** Find the 3×3 grid sector containing (x, z). */
export function getGridSectorAt(x: number, z: number): WorldGridSector | null {
  const span = GRID_SECTOR_SPAN_M;
  const col  = Math.floor((x + WORLD_HALF) / span);
  const row  = Math.floor((z + WORLD_HALF) / span);
  if (col < 0 || col > 2 || row < 0 || row > 2) return null;
  return WORLD_GRID_SECTORS.find(s => s.col === col && s.row === row) ?? null;
}

/** Sectors where faction AI may seed a growing island camp. */
export function getAISeedSectors(): WorldGridSector[] {
  return WORLD_GRID_SECTORS.filter(s => !s.isSafeZone && s.owner !== null);
}