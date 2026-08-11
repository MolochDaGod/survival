# Original game assets → ARPG nature / buildings / vehicles

Pulled from **grim-armada-web** (Armada ground) into **artifacts/arpg-game** so
Survival / Prim / Armada deploys share the same textured set.

## Terrain textures (splat)

| File | Use |
|------|-----|
| `/textures/terrain/grass.jpg` | Grassland + grass blades palette |
| `/textures/terrain/sand.jpg` | Beach / low elevation |
| `/textures/terrain/stone.jpg` | Highland / slopes |
| `/textures/terrain/snow.jpg` | Peaks |
| `/textures/terrain/sky.jpg` | Sky / fog reference |

Wired into `BiomeTerrainMaterial` via `enableTerrainSplatTextures()` — multiplies
vertex biome colours with tiled splat maps (`uUseSplat`).

## Nature props (scatter + harvestables)

| Mesh | Path | Resource ids |
|------|------|----------------|
| Tree | `/models/terrain/tree1.glb` | timber_log (tinted log) |
| Bush | `/models/terrain/bush.glb` | wild_herbs, hemp stand-in |
| Rock 1/2 | `/models/terrain/rock1.glb`, `rock2.glb` | iron/copper/flint ore |
| Barrel | `/models/terrain/barrel.glb` | crates |
| Cliffs | `/models/terrain/cliff1.glb`, `cliff2.glb` | mountain scatter |
| Hemp | `/models/prefabs/hemp.glb` | hemp_plant |
| Ore crystals | `/models/prefabs/ore_and_crystals.glb` | permafrost_ore |
| Scrap | `/models/prefabs/pile_of_scrap_metal_…glb` | scrap_pile |

Loader: `src/game/world/NatureAssets.ts`  
Scatter: `TerrainScatter` (original GLBs primary)  
Harvest: `ResourceSystem` (async GLB swap over procedural placeholder)

## Colony buildings + vehicles

Registered in `src/data/prefabs.ts` with `assetPath` under:

- `/models/colony/*` (+ `T_Spase.png` atlas)
- `/models/ships/*` (destroyers / cruisers)
- `/models/structures/*` (cabin, watchtower, mining station, …)

Use `PrefabSystem.place(id, x, z)` or FeaturePlacer tags `colony` / `armada` / `fleet`.

## Grass

`GrassSystem` blade colours updated to grass.jpg greens  
(`0x2d5a22` base → `0x8fc65a` tip). Terrain shader still runs near-field volumetric grass.

## Animations

| Asset class | Animation source |
|-------------|------------------|
| Player / toons | Embedded GLB clips + UAL / Mixamo retarget (`AssetManager`, `ToonSoldierController`) |
| Harvest actions | `AnimationRegistry` (Farm_Harvest, TreeChopping_Loop, …) |
| Nature / buildings / most vehicles | **Static meshes** (no loco clips) — intentional props |
| Future | Attach one-shots via PrefabSystem if a GLB ships clips |

## Deploy copy targets

```
artifacts/arpg-game/public/textures/terrain/*
artifacts/arpg-game/public/models/terrain/*
artifacts/arpg-game/public/models/colony/*
artifacts/arpg-game/public/models/ships/*
artifacts/arpg-game/public/models/structures/*
→ also mirrored under grim-armada-web/deploy-survival/arpg-game/
```

## Code entry points

| Concern | File |
|---------|------|
| Splat textures | `world/BiomeTerrainMaterial.ts` |
| Nature load/cache | `world/NatureAssets.ts` |
| Harvestable meshes | `world/ResourceSystem.ts` |
| Tree/rock scatter | `world/TerrainScatter.ts` |
| Prefab catalog | `data/prefabs.ts` |
| Boot prefetch | `SceneBuilder.buildEnvironment()` |
