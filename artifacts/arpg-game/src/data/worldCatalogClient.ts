/**
 * Fetches D1-backed world catalog from /api/world and hydrates runtime sector canon.
 * Falls back to bundled sectorCanon.ts when API is unavailable.
 */

import {
  SECTOR_CANON,
  getSectorCanonAt,
  setRuntimeSectorCanon,
  type SectorCanonEntry,
  type SectorVfxPalette,
} from './sectorCanon';

export interface WorldCatalogAsset {
  sector_id?: string;
  island_id?: string;
  asset_role: string;
  asset_path: string;
  public_url: string | null;
  weight: number;
  metadata_json?: string | null;
}

export interface WorldCatalogIsland {
  id: string;
  sector_id: string;
  slug: string;
  name: string;
  kind: string;
  center_x: number;
  center_z: number;
  radius_m: number;
  scene_glb: string | null;
  platform_glb: string | null;
  texture_set: string | null;
  biome_tag: string | null;
  assets?: WorldCatalogAsset[];
}

export interface WorldCatalogSectorBundle {
  sector: {
    id: string;
    territory_id: string | null;
    name: string;
    grid_col: number;
    grid_row: number;
    center_x: number;
    center_z: number;
    faction_id: string | null;
    is_safe_zone: number;
    terrain_palette: string;
    biome_bias: string | null;
    glb_map: string | null;
    flow_title: string | null;
    flow_subtitle: string | null;
    flow_objective: string | null;
    vfx_json: string;
    hostiles_json: string;
    harvest_weights_json: string;
    camp_bodies_json: string;
  };
  assets: WorldCatalogAsset[];
  islands: WorldCatalogIsland[];
}

export interface WorldCatalogPayload {
  version: number;
  sectors: WorldCatalogSectorBundle[];
}

let _hydrated: SectorCanonEntry[] | null = null;
let _islands: WorldCatalogIsland[] = [];
let _source: 'd1' | 'bundled' = 'bundled';

function parseVfx(json: string): SectorVfxPalette {
  try {
    return JSON.parse(json) as SectorVfxPalette;
  } catch {
    return SECTOR_CANON[0]?.vfx ?? {
      telegraph: 0xff8844, meleeSlash: 0xffcc66, rangedTrail: 0xaaddff,
      magicCore: 0xcc66ff, impact: 0xffeedd, arcScale: 1,
    };
  }
}

function bundleToCanon(b: WorldCatalogSectorBundle): SectorCanonEntry {
  const s = b.sector;
  const local = SECTOR_CANON.find(c => c.gridId === s.id);
  return {
    gridId: s.id,
    grid: local?.grid ?? {
      id: s.id,
      name: s.name,
      col: s.grid_col,
      row: s.grid_row,
      center: { x: s.center_x, z: s.center_z },
      owner: s.faction_id as SectorCanonEntry['faction'],
      isSafeZone: s.is_safe_zone === 1,
      territoryId: s.territory_id ?? undefined,
    },
    territory: local?.territory ?? null,
    faction: s.faction_id as SectorCanonEntry['faction'],
    hostiles: JSON.parse(s.hostiles_json || '[]') as string[],
    fauna: local?.fauna ?? [],
    harvestWeights: JSON.parse(s.harvest_weights_json || '{}') as Record<string, number>,
    terrainPalette: s.terrain_palette,
    campBodies: JSON.parse(s.camp_bodies_json || '[]') as string[],
    vfx: parseVfx(s.vfx_json),
    flow: {
      title: s.flow_title ?? s.name,
      subtitle: s.flow_subtitle ?? '',
      objective: s.flow_objective ?? '',
    },
  };
}

export function getWorldCatalogSource(): 'd1' | 'bundled' {
  return _source;
}

export function getHydratedSectorCanon(): SectorCanonEntry[] {
  return _hydrated ?? SECTOR_CANON;
}

export function getHydratedSectorCanonAt(x: number, z: number): SectorCanonEntry | null {
  const canon = getHydratedSectorCanon();
  const col = Math.floor((x + 10000) / (20000 / 3));
  const row = Math.floor((z + 10000) / (20000 / 3));
  if (col < 0 || col > 2 || row < 0 || row > 2) return null;
  return canon.find(c => c.grid.col === col && c.grid.row === row) ?? getSectorCanonAt(x, z);
}

export function getHydratedIslands(sectorId?: string): WorldCatalogIsland[] {
  if (!sectorId) return _islands;
  return _islands.filter(i => i.sector_id === sectorId);
}

export function getSectorAssets(sectorId: string): WorldCatalogAsset[] {
  const bundle = _cachedBundles.find(b => b.sector.id === sectorId);
  return bundle?.assets ?? [];
}

let _cachedBundles: WorldCatalogSectorBundle[] = [];

/**
 * Boot-time fetch. Safe to call once from GameCanvas — uses bundled fallback on failure.
 */
export async function loadWorldCatalog(apiBase = ''): Promise<WorldCatalogPayload | null> {
  try {
    const res = await fetch(`${apiBase}/api/world`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as WorldCatalogPayload;
    _cachedBundles = data.sectors ?? [];
    _hydrated = _cachedBundles.map(bundleToCanon);
    setRuntimeSectorCanon(_hydrated);
    _islands = _cachedBundles.flatMap(b => b.islands ?? []);
    _source = 'd1';
    return data;
  } catch {
    _hydrated = null;
    setRuntimeSectorCanon(null);
    _islands = [];
    _cachedBundles = [];
    _source = 'bundled';
    return null;
  }
}

/** Harvest weight with D1 override when loaded. */
export function harvestWeightAtHydrated(x: number, z: number, resourceId: string): number {
  const canon = getHydratedSectorCanonAt(x, z);
  if (!canon) return 1;
  return canon.harvestWeights[resourceId] ?? 1;
}