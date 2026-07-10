/**
 * D1 world catalog — sectors (9-grid) + islands + asset furnishing.
 *
 * Best practices:
 *   • Stable TEXT primary keys (grid_id / island slug)
 *   • JSON columns for arrays (hostiles, harvest weights, VFX palette)
 *   • Junction tables for asset roles (normalized, queryable)
 *   • INTEGER epoch-ms timestamps
 *   • Idempotent bootstrap via INSERT OR REPLACE
 *   • Indexes on foreign keys + lookup columns
 */

export const WORLD_CATALOG_SCHEMA: ReadonlyArray<string> = [
  `CREATE TABLE IF NOT EXISTS gn_world_meta (
    key         TEXT PRIMARY KEY,
    value       TEXT NOT NULL,
    updated_at  INTEGER NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS gn_sectors (
    id                    TEXT PRIMARY KEY,
    territory_id          TEXT,
    name                  TEXT NOT NULL,
    grid_col              INTEGER NOT NULL,
    grid_row              INTEGER NOT NULL,
    center_x              REAL NOT NULL,
    center_z              REAL NOT NULL,
    faction_id            TEXT,
    is_safe_zone          INTEGER NOT NULL DEFAULT 0,
    terrain_palette       TEXT NOT NULL DEFAULT 'default',
    biome_bias            TEXT,
    glb_map               TEXT,
    description           TEXT,
    lore                  TEXT,
    flow_title            TEXT,
    flow_subtitle         TEXT,
    flow_objective        TEXT,
    vfx_json              TEXT NOT NULL,
    hostiles_json         TEXT NOT NULL DEFAULT '[]',
    harvest_weights_json  TEXT NOT NULL DEFAULT '{}',
    camp_bodies_json      TEXT NOT NULL DEFAULT '[]',
    fauna_json            TEXT NOT NULL DEFAULT '[]',
    resources_json        TEXT NOT NULL DEFAULT '[]',
    metadata_json         TEXT,
    schema_version        INTEGER NOT NULL DEFAULT 1,
    updated_at            INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_gn_sectors_grid ON gn_sectors(grid_col, grid_row)`,
  `CREATE INDEX IF NOT EXISTS idx_gn_sectors_territory ON gn_sectors(territory_id)`,
  `CREATE INDEX IF NOT EXISTS idx_gn_sectors_faction ON gn_sectors(faction_id)`,

  `CREATE TABLE IF NOT EXISTS gn_islands (
    id              TEXT PRIMARY KEY,
    sector_id       TEXT NOT NULL,
    slug            TEXT NOT NULL UNIQUE,
    name            TEXT NOT NULL,
    kind            TEXT NOT NULL CHECK (kind IN ('capital','camp','dungeon','boss','harvest','gate','safe','wild')),
    center_x        REAL NOT NULL,
    center_z        REAL NOT NULL,
    radius_m        REAL NOT NULL DEFAULT 180,
    scene_glb       TEXT,
    platform_glb    TEXT,
    texture_set     TEXT,
    biome_tag       TEXT,
    deployed        INTEGER NOT NULL DEFAULT 1,
    metadata_json   TEXT,
    updated_at      INTEGER NOT NULL,
    FOREIGN KEY (sector_id) REFERENCES gn_sectors(id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_gn_islands_sector ON gn_islands(sector_id)`,
  `CREATE INDEX IF NOT EXISTS idx_gn_islands_kind ON gn_islands(kind)`,
  `CREATE INDEX IF NOT EXISTS idx_gn_islands_deployed ON gn_islands(deployed)`,

  `CREATE TABLE IF NOT EXISTS gn_sector_assets (
    sector_id       TEXT NOT NULL,
    asset_role      TEXT NOT NULL,
    asset_path      TEXT NOT NULL,
    public_url      TEXT,
    asset_id        TEXT,
    weight          REAL NOT NULL DEFAULT 1,
    metadata_json   TEXT,
    PRIMARY KEY (sector_id, asset_role, asset_path),
    FOREIGN KEY (sector_id) REFERENCES gn_sectors(id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_gn_sector_assets_role ON gn_sector_assets(asset_role)`,

  `CREATE TABLE IF NOT EXISTS gn_island_assets (
    island_id       TEXT NOT NULL,
    asset_role      TEXT NOT NULL,
    asset_path      TEXT NOT NULL,
    public_url      TEXT,
    asset_id        TEXT,
    scale           REAL NOT NULL DEFAULT 1,
    metadata_json   TEXT,
    PRIMARY KEY (island_id, asset_role, asset_path),
    FOREIGN KEY (island_id) REFERENCES gn_islands(id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_gn_island_assets_role ON gn_island_assets(asset_role)`,
];

export const WORLD_CATALOG_VERSION = 2;