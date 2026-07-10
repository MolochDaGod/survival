-- D1 world catalog (sectors + islands + asset furnishing)
-- Applied at runtime by api-server ensureWorldCatalog() — not PostgreSQL.
-- Reference copy for ops / manual D1 console runs.

-- See artifacts/api-server/src/lib/worldCatalogSchema.ts for full DDL.
-- Tables: gn_world_meta, gn_sectors, gn_islands, gn_sector_assets, gn_island_assets

-- Reseed trigger (admin): POST /api/world/reseed with admin bearer token.
-- Client boot: GET /api/world → hydrates arpg-game sectorCanon at runtime.