/**
 * World catalog service — D1 bootstrap, seed, and query for sectors/islands.
 */

import type { Logger } from 'pino';
import { D1 } from './d1Client';
import { catalogState } from './assetBridge';
import { WORLD_CATALOG_SCHEMA, WORLD_CATALOG_VERSION } from './worldCatalogSchema';
import {
  SEED_SECTORS,
  buildSeedIslands,
  buildSectorAssets,
  buildIslandAssets,
} from '../data/worldCatalogSeed';
import { logger as rootLogger } from './logger';

export interface SectorAssetRow {
  sector_id: string;
  asset_role: string;
  asset_path: string;
  public_url: string | null;
  asset_id: string | null;
  weight: number;
  metadata_json: string | null;
}

export interface IslandAssetRow {
  island_id: string;
  asset_role: string;
  asset_path: string;
  public_url: string | null;
  asset_id: string | null;
  scale: number;
  metadata_json: string | null;
}

export interface SectorRow {
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
  description: string | null;
  lore: string | null;
  flow_title: string | null;
  flow_subtitle: string | null;
  flow_objective: string | null;
  vfx_json: string;
  hostiles_json: string;
  harvest_weights_json: string;
  camp_bodies_json: string;
  fauna_json: string;
  resources_json: string;
  metadata_json: string | null;
  schema_version: number;
  updated_at: number;
}

export interface IslandRow {
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
  deployed: number;
  metadata_json: string | null;
  updated_at: number;
}

interface WorldCatalogState {
  available: boolean;
  seeded: boolean;
  version: number;
  reason?: string;
  checkedAt: number;
}

let _state: WorldCatalogState = {
  available: false,
  seeded: false,
  version: 0,
  reason: 'not yet probed',
  checkedAt: 0,
};

export function worldCatalogState(): WorldCatalogState {
  return _state;
}

export async function ensureWorldCatalog(log: Logger = rootLogger, forceReseed = false): Promise<WorldCatalogState> {
  const cat = catalogState();
  if (!cat.available) {
    const probe = await D1.available();
    if (!probe.ok) {
      _state = { available: false, seeded: false, version: 0, reason: probe.message, checkedAt: Date.now() };
      log.warn({ reason: probe.message }, '[worldCatalog] D1 unavailable');
      return _state;
    }
  }

  try {
    for (const sql of WORLD_CATALOG_SCHEMA) {
      await D1.query(sql);
    }

    const meta = await D1.one<{ value: string }>(
      `SELECT value FROM gn_world_meta WHERE key = 'catalog_version'`,
    );
    const currentVersion = meta ? Number(meta.value) : 0;

    if (forceReseed || currentVersion < WORLD_CATALOG_VERSION) {
      await seedWorldCatalog(log);
      await D1.exec(
        `INSERT OR REPLACE INTO gn_world_meta (key, value, updated_at) VALUES (?, ?, ?)`,
        ['catalog_version', String(WORLD_CATALOG_VERSION), Date.now()],
      );
      _state = { available: true, seeded: true, version: WORLD_CATALOG_VERSION, checkedAt: Date.now() };
      log.info({ version: WORLD_CATALOG_VERSION }, '[worldCatalog] seeded');
    } else {
      const count = await D1.one<{ n: number }>(`SELECT COUNT(*) as n FROM gn_sectors`);
      _state = {
        available: true,
        seeded: (count?.n ?? 0) > 0,
        version: currentVersion,
        checkedAt: Date.now(),
      };
      log.info({ sectors: count?.n, version: currentVersion }, '[worldCatalog] ready');
    }
  } catch (e) {
    _state = {
      available: false,
      seeded: false,
      version: 0,
      reason: (e as Error).message,
      checkedAt: Date.now(),
    };
    log.error({ err: e }, '[worldCatalog] bootstrap failed');
  }
  return _state;
}

async function seedWorldCatalog(log: Logger): Promise<void> {
  const now = Date.now();
  const islands = buildSeedIslands();
  const sectorAssets = buildSectorAssets();
  const islandAssets = buildIslandAssets(islands);

  log.info({ sectors: SEED_SECTORS.length, islands: islands.length }, '[worldCatalog] seeding');

  for (const s of SEED_SECTORS) {
    await D1.exec(
      `INSERT OR REPLACE INTO gn_sectors (
        id, territory_id, name, grid_col, grid_row, center_x, center_z,
        faction_id, is_safe_zone, terrain_palette, biome_bias, glb_map,
        description, lore, flow_title, flow_subtitle, flow_objective,
        vfx_json, hostiles_json, harvest_weights_json, camp_bodies_json,
        fauna_json, resources_json, schema_version, updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        s.id, s.territoryId, s.name, s.gridCol, s.gridRow, s.centerX, s.centerZ,
        s.factionId, s.isSafeZone ? 1 : 0, s.terrainPalette, s.biomeBias, s.glbMap,
        s.description, s.lore, s.flow.title, s.flow.subtitle, s.flow.objective,
        JSON.stringify(s.vfx), JSON.stringify(s.hostiles), JSON.stringify(s.harvestWeights),
        JSON.stringify(s.campBodies), JSON.stringify(s.fauna), JSON.stringify(s.resources),
        WORLD_CATALOG_VERSION, now,
      ],
    );
  }

  for (const isl of islands) {
    await D1.exec(
      `INSERT OR REPLACE INTO gn_islands (
        id, sector_id, slug, name, kind, center_x, center_z, radius_m,
        scene_glb, platform_glb, texture_set, biome_tag, deployed, updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        isl.id, isl.sectorId, isl.slug, isl.name, isl.kind,
        isl.centerX, isl.centerZ, isl.radiusM,
        isl.sceneGlb, isl.platformGlb, isl.textureSet, isl.biomeTag, 1, now,
      ],
    );
  }

  await D1.exec(`DELETE FROM gn_sector_assets`);
  for (const a of sectorAssets) {
    await D1.exec(
      `INSERT OR REPLACE INTO gn_sector_assets (
        sector_id, asset_role, asset_path, public_url, weight, metadata_json
      ) VALUES (?,?,?,?,?,?)`,
      [a.sectorId, a.assetRole, a.assetPath, a.publicUrl, a.weight, a.metadata ? JSON.stringify(a.metadata) : null],
    );
  }

  await D1.exec(`DELETE FROM gn_island_assets`);
  for (const a of islandAssets) {
    await D1.exec(
      `INSERT OR REPLACE INTO gn_island_assets (
        island_id, asset_role, asset_path, public_url, scale
      ) VALUES (?,?,?,?,?)`,
      [a.islandId, a.assetRole, a.assetPath, a.publicUrl, a.scale],
    );
  }
}

export async function listSectors(): Promise<SectorRow[]> {
  return D1.rows<SectorRow>(`SELECT * FROM gn_sectors ORDER BY grid_row, grid_col`);
}

export async function getSector(id: string): Promise<SectorRow | null> {
  return D1.one<SectorRow>(`SELECT * FROM gn_sectors WHERE id = ?`, [id]);
}

export async function getSectorAssets(sectorId: string): Promise<SectorAssetRow[]> {
  return D1.rows<SectorAssetRow>(
    `SELECT * FROM gn_sector_assets WHERE sector_id = ? ORDER BY asset_role, weight DESC`,
    [sectorId],
  );
}

export async function listIslands(sectorId?: string): Promise<IslandRow[]> {
  if (sectorId) {
    return D1.rows<IslandRow>(
      `SELECT * FROM gn_islands WHERE sector_id = ? AND deployed = 1 ORDER BY kind, name`,
      [sectorId],
    );
  }
  return D1.rows<IslandRow>(`SELECT * FROM gn_islands WHERE deployed = 1 ORDER BY sector_id, kind`);
}

export async function getIsland(id: string): Promise<IslandRow | null> {
  return D1.one<IslandRow>(`SELECT * FROM gn_islands WHERE id = ?`, [id]);
}

export async function getIslandAssets(islandId: string): Promise<IslandAssetRow[]> {
  return D1.rows<IslandAssetRow>(
    `SELECT * FROM gn_island_assets WHERE island_id = ? ORDER BY asset_role`,
    [islandId],
  );
}

/** Full sector payload for game client boot. */
export async function getSectorBundle(id: string) {
  const sector = await getSector(id);
  if (!sector) return null;
  const [assets, islands] = await Promise.all([
    getSectorAssets(id),
    listIslands(id),
  ]);
  const islandBundles = await Promise.all(
    islands.map(async (isl) => ({
      ...isl,
      assets: await getIslandAssets(isl.id),
    })),
  );
  return { sector, assets, islands: islandBundles };
}

/** Full world payload — all 9 sectors with assets + islands. */
export async function getWorldBundle() {
  const sectors = await listSectors();
  const bundles = await Promise.all(
    sectors.map(async (s) => {
      const [assets, islands] = await Promise.all([
        getSectorAssets(s.id),
        listIslands(s.id),
      ]);
      const islandBundles = await Promise.all(
        islands.map(async (isl) => ({
          ...isl,
          assets: await getIslandAssets(isl.id),
        })),
      );
      return { sector: s, assets, islands: islandBundles };
    }),
  );
  return {
    version: _state.version || WORLD_CATALOG_VERSION,
    sectors: bundles,
  };
}