# Grudges production world — terrain, sectors, entry, checklist

**Product:** voxel-era lead MMO · `docs/PRODUCT_ERA_VOXEL.md`  
**Terrain lessons:** `docs/SNAKEY_TERRAIN_LESSONS.md`  
**Systems:** `docs/PRODUCTION_SSOT.md`

---

## 1. Goals (from product + lore + gameplay)

| Goal | Production requirement |
|------|------------------------|
| **Survive on the surface** after The Way sealed elevators | Open 20 km world, not endless wave arena |
| **Five factions** claw for territory | 9-sector grid + 5 territory anchors + banners |
| **Safe start** | Convergence hub at origin — spawn, intro, no hostiles |
| **Deploy / expand** | Deploy gate + boat; sector POIs; claim flag → camp → town |
| **Harvest / craft / professions** | Resource nodes, recipes, MainPanel bag |
| **Voxel avatar** | `era=voxel`, SI 1.8 m, feet on `groundY`, one mixer |
| **Identity** | Grudge ID + Railway characters; D1/R2 for asset index |

---

## 2. World topology (production)

```
                    N
        Frostbite · Cathedral · Stormbreak
        Switchyard · ★ Convergence · Junkyards
        Silt Marsh · The Pit · Drowned Q
                    S
```

| Layer | Role | Code |
|-------|------|------|
| **L0 Flat pad** | Spawn disc y=0, ~50 m | `WorldGen.ARENA_RADIUS` |
| **L1 Safe zone** | No wave/camp hostiles near hub | `EnemyManager` + `ARENA_SAFE_RADIUS` camps |
| **L2 Hub GLB** | Encampment walk mesh | `StarterMap` `encampment` |
| **L3 Chunks** | Streamed heightfield | `WorldChunkManager` |
| **L4 Sector patches** | 5+ territory GLB blends | `SectorWorldBootstrap` |
| **L5 Deploy gate** | Boat / sector march | `DeployGateBootstrap` |
| **L6 Content** | Resources, roads, camps, NPCs | ResourceSystem, FeaturePlacer, … |

**Center cell** `grid_convergence` = **safe zone** (`isSafeZone: true`, owner null).  
Rename in UI: “Convergence Hub” / “Safe Encampment” — **not** product era “Nexus”.

---

## 3. Entry (purged “old survival”)

| Old / wrong | Production |
|-------------|------------|
| Pure arena wave as the game | Waves optional after grace; open world primary |
| `era=nexus` create | **`era=voxel` only** |
| Empty void if map fails | Fail closed → flat pad + procedural, never black void |
| Second physics / second height | One `worldHeight` + BVH feet |

**Boot order (SSOT):** hub GLB → winter trees → terrain arena → chunks → sector patches → docks → deploy gate → scatter → city GLBs.

---

## 4. Safe zone numbers

| Constant | Value | Use |
|----------|-------|-----|
| `WorldGen.ARENA_RADIUS` | **50 m** | Flat y=0 pad |
| `TerrainBuilder.WORLD.ARENA_RADIUS` | **50 m** (aligned) | Arena mesh + collider |
| `EnemyManager.SPAWN_SAFE_RADIUS` | **80 m** | No wave enemies in hub |
| `SECTORS` / camps | **≥ 200 m** from origin | Patrol camps |
| Grid safe cell | whole Convergence cell | No AI island camps |

---

## 5. Assets / database wiring

| Store | Holds | Grudges use |
|-------|-------|-------------|
| **Railway** | Player characters, bag, wallet | `era=voxel` roster |
| **D1 + R2** | Asset index + GLB/tex binaries | Sector maps, hub, props |
| **worldCatalogSeed** | Sector/island seed rows | API `/api` world catalog |
| **grudges-systems.json** | Machine catalog | Website + AI workers |
| **prefabs.ts** | terrain_patch ids | SectorWorldBootstrap map |

**Must wire for production play:**

- [x] Hub `locations/encampment.glb`  
- [ ] Sector chicken-gun GLBs present on CDN or local `public` (fail soft if missing)  
- [x] Faction banners `/icons/factions/banners`  
- [x] CraftPix HUD unit-frames  
- [ ] Harvest node meshes upgraded from placeholders when CDN packs ready  
- [x] `era=voxel` starter stats  

---

## 6. Lore → gameplay content matrix

| Lore beat | Systems that must ship |
|-----------|------------------------|
| Five factions | `factions.ts`, banners, sector ownership, rep |
| Surface after elevators | Open world + biomes + water |
| Claim flag / camp | Township tiers, flag pole, bag |
| Harvest surface | ResourceSystem + PlayerHarvest + professions XP |
| Raids / warbands | EnemyCampSystem outside safe zone |
| Craft / forge | Recipes, stations, MainPanel craft |
| Deploy to territory | Deploy gate, map overlay, sector POIs |

---

## 7. Snakey best practices applied

1. **Single height SSOT** — `worldHeight` only for analytic.  
2. **Feet on visual mesh** — `groundY` BVH.  
3. **Stream, don’t rebuild** — chunks.  
4. **Hub pad flat** — like snakey spawn clarity.  
5. **Deploy static client** — Vite → Vercel.

---

## 8. Smoke (production world)

```bash
pnpm run deploy:prod
# then in client:
# - Spawn at Convergence hub, feet grounded
# - No enemies for intro grace; none inside ~80 m
# - M map shows 9 sectors + faction banners
# - March outside pad → heightfield + resources
# - Deploy gate boat present if prefab loads
```

Live: `https://grudges.grudge-studio.com/arpg-game/`
