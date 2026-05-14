/**
 * Asset catalog schema for the D1 database.
 *
 * Tables:
 *   assets       – one row per logical asset, may live in GCS, R2, or both
 *   asset_tags   – many-to-many tags for browsing/filtering
 *   bridge_events – audit log of mirror / upload / delete operations
 *
 * Asset id convention:
 *   `<source-prefix>:<bucket>/<key>`  e.g. `r2:grudge-assets/3d-models/abc/diffuse.png`
 *   But in practice we use a stable hash key derived from the *path* (not the
 *   bucket), so the same asset mirrored to both stores gets the same id.
 *
 * All timestamps are unix epoch milliseconds.
 */

import { createHash } from 'crypto';

export const SCHEMA_STATEMENTS: ReadonlyArray<string> = [
  `CREATE TABLE IF NOT EXISTS gn_assets (
    id            TEXT PRIMARY KEY,
    path          TEXT NOT NULL,
    source        TEXT NOT NULL CHECK (source IN ('gcs','r2','both')),
    gcs_bucket    TEXT,
    gcs_key       TEXT,
    r2_bucket     TEXT,
    r2_key        TEXT,
    content_type  TEXT,
    size_bytes    INTEGER,
    sha256        TEXT,
    width         INTEGER,
    height        INTEGER,
    duration_ms   INTEGER,
    public_url    TEXT,
    metadata_json TEXT,
    created_at    INTEGER NOT NULL,
    updated_at    INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_gn_assets_path ON gn_assets(path)`,
  `CREATE INDEX IF NOT EXISTS idx_gn_assets_source ON gn_assets(source)`,
  `CREATE INDEX IF NOT EXISTS idx_gn_assets_content_type ON gn_assets(content_type)`,
  `CREATE INDEX IF NOT EXISTS idx_gn_assets_updated_at ON gn_assets(updated_at)`,

  `CREATE TABLE IF NOT EXISTS gn_asset_tags (
    asset_id  TEXT NOT NULL,
    tag       TEXT NOT NULL,
    PRIMARY KEY (asset_id, tag)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_gn_asset_tags_tag ON gn_asset_tags(tag)`,

  `CREATE TABLE IF NOT EXISTS gn_bridge_events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    op          TEXT NOT NULL,
    asset_id    TEXT,
    payload     TEXT,
    ok          INTEGER NOT NULL,
    error       TEXT,
    occurred_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_gn_bridge_events_op ON gn_bridge_events(op)`,
  `CREATE INDEX IF NOT EXISTS idx_gn_bridge_events_occurred_at ON gn_bridge_events(occurred_at)`,

  // Studio-only structured tags. Distinct from gn_asset_tags (which is a
  // simple many-to-many string-tag list keyed by hashed asset id) because the
  // Asset Studio editor needs four typed fields per asset and is keyed by the
  // raw R2 object key the studio already uses.
  `CREATE TABLE IF NOT EXISTS gn_studio_asset_tags (
    asset_key      TEXT PRIMARY KEY,
    gear_slot      TEXT,
    character_form TEXT,
    grudge_uuid    TEXT,
    notes          TEXT,
    updated_at     INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_gn_studio_asset_tags_updated_at ON gn_studio_asset_tags(updated_at)`,
];

/**
 * Stable id derived from a logical path, so the same asset mirrored to both
 * GCS and R2 has one row.
 *
 * Implementation: SHA-256(utf8(path)) truncated to the first 128 bits / 32 hex
 * chars. With 32 hex chars the birthday collision floor is ~2^64 unique paths
 * before any expected collision, which is far beyond any realistic asset
 * count. UTF-8 encoding ensures multi-byte paths (non-ASCII filenames) hash
 * identically across platforms.
 *
 * Format: `a_<hex32>`  (35 chars total)
 */
export function assetIdFromPath(path: string): string {
  const hex = createHash('sha256').update(path, 'utf8').digest('hex').slice(0, 32);
  return `a_${hex}`;
}
