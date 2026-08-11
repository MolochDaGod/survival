# Survival Hybrid World Rebuild (GRUDGES / Nexus)

**Era:** `survival` only  
**Hosts:** survival.grudge-studio.com · grudges.grudge-studio.com  

## Architecture

| Layer | Source | Colliders | Notes |
|-------|--------|-----------|-------|
| Middle sector hub | `StarterMap` → `locations/encampment.glb` at origin | BVH + Rapier trimesh (`MapColliders`) | Handcrafted starting city |
| 9 sector anchors | Chicken-gun / town3f GLBs via `TerrainPatchSystem` | Heightfield blend | Origin skipped when starter map loaded |
| Open world stream | `WorldChunkManager` beyond `OPEN_WORLD_STREAM_RADIUS` (250 m) | Heightfield Rapier | Procedural biomes |
| Islands / docks | `IslandDockBootstrap` + D1/world catalog | Prefab colliders | Era-isolated from Warlords home islands |
| Player camp | `MiddleCampBootstrap` + `CampClaimSystem` | Claim 80 m | Middle pad offset (0, +10 m) |

## Canonical maps

| Role | Asset |
|------|--------|
| Starting city / encampment | `encampment.glb` (StarterMap) |
| Sector city (Junkyards) | `town3f2_chicken_gun_map_reupload.glb` |
| Western / highlands | `chicken_gun_western_reupload.glb` |
| Town / scrub | `chicken_gun_town2f_reupload.glb` |
| Farm / Pit | `chicken_gun_bigfarm_full_map.glb` |
| Misty / rail | `chicken_gun_mistytown.glb` |
| Fruzer camp / drowned | `chicken_gun_fruzer_-_encampment.glb` |

## Camp bodies (toon operators)

`sectorCanon.campBodies` and API `worldCatalogSeed` use Survival toon ids:

- Keepers: `toon-nim`, `toon-suture`, `toon-permafrost`
- Scavs: `toon-vex`, `toon-rivet`, …
- Hollow: `toon-brick`, `toon-bastion`, …
- Network: `toon-ledger`, `toon-scope`, `toon-ashcoil`
- Forgotten: `toon-cinder`, `toon-greyvial`, `toon-permafrost`

Hub NPCs (`EncampmentIntro`): Ledger, Rivet, Ashcoil, Bastion, Brick.

## Game flow (info.html aligned)

1. Spawn Convergence Nexus (middle sector).
2. Meet hub crew → **Stake Your Camp** intro quest.
3. Claim middle pad (auto-claim on fresh start; quest confirms).
4. Vendor / vault / battle trial.
5. Unlock five faction roads (sector quests).
6. Expand: flag → benches → buildings → hires (CampClaimSystem).

## Key files

- `SceneBuilder.ts` — hybrid load
- `SectorWorldBootstrap.ts` — chicken-gun sector plant + origin skip
- `MiddleCampBootstrap.ts` — starter camp pad
- `CampClaimSystem.ts` — claim / benches / buildings
- `EncampmentIntro.ts` — NPCs + intro + sector quests
- `QuestSystem.ts` — includes `claim` step type
- `sectorCanon.ts` — flow beats + toon campBodies

## Not Warlords

Do not import these modules into `grudge-builder` or Warlords fleet packages.
