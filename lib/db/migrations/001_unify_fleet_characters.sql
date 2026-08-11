-- Unified fleet character identity migration (GrudgeBuilder Railway SSOT)
-- See also: Tactical-Infinity/shared/migrations/001_unify_fleet_characters.sql

ALTER TABLE characters
  ADD COLUMN IF NOT EXISTS grudge_spec_id VARCHAR(16),
  ADD COLUMN IF NOT EXISTS cnft_mint_id VARCHAR(128),
  ADD COLUMN IF NOT EXISTS prefab_id VARCHAR(64),
  ADD COLUMN IF NOT EXISTS spawn_code TEXT,
  ADD COLUMN IF NOT EXISTS game_era VARCHAR(32) DEFAULT 'warlords',
  ADD COLUMN IF NOT EXISTS active_for_era BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS schema_version INTEGER DEFAULT 1;

ALTER TABLE characters
  ADD COLUMN IF NOT EXISTS sprite_config JSONB,
  ADD COLUMN IF NOT EXISTS model_3d JSONB;

CREATE INDEX IF NOT EXISTS idx_characters_grudge_spec
  ON characters (grudge_spec_id)
  WHERE grudge_spec_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_characters_cnft
  ON characters (cnft_mint_id)
  WHERE cnft_mint_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_characters_account_era_active
  ON characters (account_id, game_era, active_for_era);

UPDATE characters
SET grudge_spec_id = UPPER(
  SUBSTRING(
    MD5(
      'v1|race:' || COALESCE(race_id, 'human')
      || '|class:' || COALESCE(class_id, 'warrior')
    )
    FROM 1 FOR 6
  )
)
WHERE grudge_spec_id IS NULL
  AND id IS NOT NULL;

UPDATE characters
SET grudge_spec_id = 'GRDG-' || grudge_spec_id
WHERE grudge_spec_id IS NOT NULL
  AND grudge_spec_id NOT LIKE 'GRDG-%';

UPDATE characters
SET game_era = 'warlords'
WHERE game_era IS NULL;

UPDATE characters c
SET active_for_era = true
FROM (
  SELECT DISTINCT ON (account_id) id
  FROM characters
  WHERE account_id IS NOT NULL
  ORDER BY account_id, last_played_at DESC NULLS LAST, updated_at DESC NULLS LAST, created_at DESC
) pick
WHERE c.id = pick.id;

CREATE TABLE IF NOT EXISTS character_loadouts (
  id              SERIAL PRIMARY KEY,
  character_id    VARCHAR(255) NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  slot            VARCHAR(16)  NOT NULL,
  gear_id         VARCHAR(64),
  weapon_instance_id VARCHAR(64),
  hotbar_slot     INTEGER,
  equipped_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (character_id, slot)
);

CREATE INDEX IF NOT EXISTS idx_character_loadouts_char
  ON character_loadouts (character_id);