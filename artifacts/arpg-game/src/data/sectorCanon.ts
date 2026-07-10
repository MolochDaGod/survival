/**
 * sectorCanon — canonical deployment data for all 9 grid sectors.
 *
 * Albion-inspired combat palette + island-3d game-flow beats per cell.
 * Consumed by SectorDeployment (runtime), ResourceSystem (harvest weights),
 * EnemyCampSystem (roster), and VFX systems (attack colors / telegraphs).
 */

import type { FactionId } from './factions';
import { WORLD_GRID_SECTORS, type WorldGridSector } from './worldGridSectors';
import { getSector, type SectorDef } from './sectors';

/** VFX palette keyed to faction biome — Albion-style windup → hit → follow-through. */
export interface SectorVfxPalette {
  telegraph: number;
  meleeSlash: number;
  rangedTrail: number;
  magicCore: number;
  impact: number;
  /** Spline arc height multiplier (1 = default ~5m at 20m range). */
  arcScale: number;
}

/** Island-3d inspired flow beat shown on sector entry. */
export interface SectorFlowBeat {
  title: string;
  subtitle: string;
  /** Suggested player objective in this cell. */
  objective: string;
}

export interface SectorCanonEntry {
  gridId: string;
  grid: WorldGridSector;
  territory: SectorDef | null;
  faction: FactionId | null;
  /** Canonical hostile enemy type ids (bestiary / EnemyManager keys). */
  hostiles: string[];
  /** Ambient fauna tags for spawners. */
  fauna: string[];
  /** Harvestable resource def ids with spawn weight multiplier. */
  harvestWeights: Record<string, number>;
  /** FogSystem biome palette key. */
  terrainPalette: string;
  vfx: SectorVfxPalette;
  flow: SectorFlowBeat;
  /** Canonical NPC body silhouettes for faction camps (CharacterConfig ids). */
  campBodies: string[];
}

const DEFAULT_VFX: SectorVfxPalette = {
  telegraph: 0xff8844,
  meleeSlash: 0xffcc66,
  rangedTrail: 0xaaddff,
  magicCore: 0xcc66ff,
  impact: 0xffeedd,
  arcScale: 1,
};

type SectorCanonOverrides = {
  hostiles: string[];
  harvestWeights: Record<string, number>;
  terrainPalette: string;
  flow: SectorFlowBeat;
  campBodies: string[];
  vfx?: Partial<SectorVfxPalette>;
};

function entry(gridId: string, overrides: SectorCanonOverrides): SectorCanonEntry {
  const { vfx: vfxOverrides, ...rest } = overrides;
  const grid = WORLD_GRID_SECTORS.find(s => s.id === gridId)!;
  const territory = grid.territoryId ? getSector(grid.territoryId) ?? null : null;
  return {
    gridId,
    grid,
    territory,
    faction: grid.owner,
    fauna: territory?.fauna ?? [],
    vfx: { ...DEFAULT_VFX, ...vfxOverrides },
    ...rest,
  };
}

/** All 9 canonical sector deployments (north row = row 0). */
export const SECTOR_CANON: SectorCanonEntry[] = [
  entry('grid_nw_wilds', {
    hostiles: ['highland_wolf', 'skeleton_swordman', 'cave_troll'],
    harvestWeights: {
      iron_ore: 1.4, crystal_node: 1.2, permafrost_ore: 1.8,
      wild_herbs: 0.8, frozen_pond: 1.5,
    },
    terrainPalette: 'tundra',
    campBodies: ['medieval', 'witch', 'soldier'],
    vfx: { telegraph: 0x88ccff, meleeSlash: 0xccddff, magicCore: 0x66aaff, arcScale: 1.1 },
    flow: {
      title: 'Frostbite Fringe',
      subtitle: 'Keeper wildlands — thin ice, thick grudges',
      objective: 'Harvest permafrost shards and clear the shrine camp',
    },
  }),
  entry('grid_north_uplands', {
    hostiles: ['skeleton_axe', 'skeleton_swordman', 'cave_troll', 'highland_wolf'],
    harvestWeights: {
      iron_ore: 1.6, copper_deposit: 1.2, wild_herbs: 1.3,
      crystal_node: 1.4, stone_outcrop: 1.1,
    },
    terrainPalette: 'highland',
    campBodies: ['medieval', 'king', 'farmer'],
    vfx: { telegraph: 0xd4b870, meleeSlash: 0xffdd88, magicCore: 0xffaa44, arcScale: 1 },
    flow: {
      title: 'Cathedral Highlands',
      subtitle: 'Hallowed stone — Keepers hold the ridgeline',
      objective: 'Reach Old Cathedral and claim the Bone Altar boss',
    },
  }),
  entry('grid_ne_scrub', {
    hostiles: ['rogue_drone', 'miner', 'masked', 'scrap_golem'],
    harvestWeights: {
      scrap_pile: 1.5, copper_deposit: 1.3, flint_outcrop: 1.1,
      oil_drum: 1.2, wire_spool: 1.4,
    },
    terrainPalette: 'desert',
    campBodies: ['punk', 'worker', 'scifi'],
    vfx: { telegraph: 0xff6644, meleeSlash: 0xff8844, rangedTrail: 0xffaa00, arcScale: 0.9 },
    flow: {
      title: 'Stormbreak Scrub',
      subtitle: 'Scavenger frontier — every wreck is a workshop',
      objective: 'Salvage rust pits and scout Scout Point Raven',
    },
  }),
  entry('grid_west_rail', {
    hostiles: ['bandit_scout', 'rogue_trader', 'signal_drone', 'wild_dog_pack'],
    harvestWeights: {
      timber_log: 1.2, wild_herbs: 1.1, flint_outcrop: 1.0,
      wheat_field: 1.5, clay_deposit: 1.3,
    },
    terrainPalette: 'default',
    campBodies: ['suit', 'casual', 'adventurer'],
    vfx: { telegraph: 0x66ccaa, meleeSlash: 0xaaffcc, rangedTrail: 0x88ffdd, arcScale: 1 },
    flow: {
      title: 'The Switchyard',
      subtitle: 'Rail relays — the Network sells locations',
      objective: 'Trade at The Exchange and run the Shadow Den dungeon',
    },
  }),
  entry('grid_convergence', {
    hostiles: [],
    harvestWeights: {
      wild_herbs: 0.6, timber_log: 0.5, flint_outcrop: 0.4,
    },
    terrainPalette: 'default',
    campBodies: ['adventurer', 'casual', 'beach'],
    vfx: { telegraph: 0x88ffcc, meleeSlash: 0xffffff, magicCore: 0xccffee, arcScale: 0.8 },
    flow: {
      title: 'Convergence Nexus',
      subtitle: 'Safe encampment — five roads meet here',
      objective: 'Deploy to a faction sector or resume your last route',
    },
  }),
  entry('grid_east_junk', {
    hostiles: ['miner', 'masked', 'scrap_golem', 'rogue_drone'],
    harvestWeights: {
      scrap_pile: 1.8, copper_deposit: 1.5, oil_drum: 1.4,
      wire_spool: 1.6, flint_outcrop: 1.0,
    },
    terrainPalette: 'desert',
    campBodies: ['punk', 'worker', 'scifi'],
    vfx: { telegraph: 0xff4422, meleeSlash: 0xff6622, rangedTrail: 0xffcc00, arcScale: 0.85 },
    flow: {
      title: 'The Junkyards',
      subtitle: 'Corrugated steel law — salvage or be salvaged',
      objective: 'Forge at The Workshops and defeat The Crusher boss',
    },
  }),
  entry('grid_sw_marsh', {
    hostiles: ['marsh_lurker', 'poison_frog', 'drowned_dead', 'tide_caller'],
    harvestWeights: {
      driftwood: 1.3, salt_deposit: 1.2, kelp_bed: 1.5,
      wild_herbs: 1.4, coral_node: 1.1,
    },
    terrainPalette: 'swamp',
    campBodies: ['witch', 'beach', 'casual-hoodie'],
    vfx: { telegraph: 0x44aa66, meleeSlash: 0x66cc88, magicCore: 0x22ff88, arcScale: 1.15 },
    flow: {
      title: 'Silt Marshes',
      subtitle: 'Forgotten tide-flats — blades coated in toxin',
      objective: 'Harvest salt flats and reach Tide Camp Reed',
    },
  }),
  entry('grid_south_pit', {
    hostiles: ['hollow_raider', 'lava_monster', 'pit_worm', 'scarecrow', 'lizard_mule'],
    harvestWeights: {
      iron_ore: 1.7, coal_seam: 1.8, obsidian_node: 1.5,
      sulfur_vent: 1.4, stone_outcrop: 1.2,
    },
    terrainPalette: 'highland',
    campBodies: ['soldier', 'punk', 'medieval'],
    vfx: { telegraph: 0xff2222, meleeSlash: 0xff4400, impact: 0xffaa44, arcScale: 1.2 },
    flow: {
      title: 'The Pit',
      subtitle: 'Iron law — rank through strength',
      objective: 'Descend Howling Pit and challenge The Crucible boss',
    },
  }),
  entry('grid_se_drowned', {
    hostiles: ['seaexplorer', 'drowned_dead', 'marsh_lurker', 'tide_caller', 'poison_frog'],
    harvestWeights: {
      driftwood: 1.6, salt_deposit: 1.5, coral_node: 1.4,
      kelp_bed: 1.3, wild_herbs: 1.1,
    },
    terrainPalette: 'swamp',
    campBodies: ['beach', 'witch', 'casual'],
    vfx: { telegraph: 0x2288aa, meleeSlash: 0x44aacc, magicCore: 0x00ccff, arcScale: 1.1 },
    flow: {
      title: 'Drowned Quarter',
      subtitle: 'Sunken streets — the Forgotten move with the water',
      objective: 'Clear Sunken Vault and face The Tide Mother',
    },
  }),
];

const CANON_BY_GRID = new Map(SECTOR_CANON.map(c => [c.gridId, c]));

export function getSectorCanon(gridId: string): SectorCanonEntry | undefined {
  return CANON_BY_GRID.get(gridId);
}

export function getSectorCanonAt(x: number, z: number): SectorCanonEntry | null {
  const col = Math.floor((x + 10000) / (20000 / 3));
  const row = Math.floor((z + 10000) / (20000 / 3));
  if (col < 0 || col > 2 || row < 0 || row > 2) return null;
  const grid = WORLD_GRID_SECTORS.find(s => s.col === col && s.row === row);
  return grid ? CANON_BY_GRID.get(grid.id) ?? null : null;
}

/** Harvest spawn weight for a resource def at world position. 1 = default. */
export function harvestWeightAt(x: number, z: number, resourceId: string): number {
  const canon = getSectorCanonAt(x, z);
  if (!canon) return 1;
  return canon.harvestWeights[resourceId] ?? 1;
}

/** Runtime override set by worldCatalogClient after D1 fetch. */
let _runtimeCanon: SectorCanonEntry[] | null = null;

export function setRuntimeSectorCanon(entries: SectorCanonEntry[] | null): void {
  _runtimeCanon = entries;
}

export function getActiveSectorCanon(): SectorCanonEntry[] {
  return _runtimeCanon ?? SECTOR_CANON;
}

export function getActiveSectorCanonAt(x: number, z: number): SectorCanonEntry | null {
  const col = Math.floor((x + 10000) / (20000 / 3));
  const row = Math.floor((z + 10000) / (20000 / 3));
  if (col < 0 || col > 2 || row < 0 || row > 2) return null;
  const active = getActiveSectorCanon();
  return active.find(c => c.grid.col === col && c.grid.row === row) ?? getSectorCanonAt(x, z);
}

export function activeHarvestWeightAt(x: number, z: number, resourceId: string): number {
  const canon = getActiveSectorCanonAt(x, z);
  if (!canon) return 1;
  return canon.harvestWeights[resourceId] ?? 1;
}