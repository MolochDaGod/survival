# World deploy + player placement (ARPG / Grudox)

**Live:** https://deploy-survival.vercel.app/arpg-game/

## Boot order (always all layers)

| Step | System | What |
|------|--------|------|
| 1 | **Home hub** | `encampment.glb` at origin + `encampment.json` spawn |
| 2 | **Procedural world** | heightfield, chunks, features, roads |
| 3 | **Sector maps** | 9× `terrain_cg_*` patches at sector centres |
| 4 | **Island docks** | `viking_shipyard` on each grid sector south edge |
| 5 | **Deploy gate** | same prefab at Convergence “Deploy Gate” POI + boat spawn |
| 6 | **GLB locations** | market / misty / multi-city props |

Never use exclusive “starter **or** open world” modes — that broke either player spawn or sector deploys.

## Player character

1. **Mesh** — `AssetManager.loadCharacterGLTF(characterConfig)` resolves `BODY_TYPES` → Quaternius path  
2. **Fit** — `PlayerController` normalizes bbox height to **1.8 m**, feet at local y=0  
3. **Spawn** — `SceneBuilder.getHomeSpawn()` → `teleportTo` + `snapToGround()`  
4. **Controller** — Rapier capsule (optional) or GroundSampler; mesh under feet each frame  

Console check:
```
[PlayerController] Model bbox: ~0.4 × 1.8 × 0.4 m
[SceneBuilder] Home hub "encampment" ready · spawn=...
[SceneBuilder] World boot complete · hub=true · sectors=… · docks=… · deployGate=…
```

## Prefab placement rules

- Y = `worldHeight(x,z) + yOffset` (arena radius is flat y=0)  
- Scale from `PREFABS` catalog (viking shipyard **6.0**)  
- Buildings enable **WORLD + GROUND** layers so feet snap on docks/piers  
- Deploy gate boat: waterline Y near 0 in the arena  

## Character select → play

`CharacterSelect` / creation → `CharacterConfig` → `GameEngine` constructor → `loadAll(config)` → body mesh matches the chosen outfit.

## Related code

- `SceneBuilder.ts` — layered boot  
- `DeployGateBootstrap.ts` / `IslandDockBootstrap.ts` / `SectorWorldBootstrap.ts`  
- `PlayerController.ts` — fit + `snapToGround`  
- `PrefabSystem.ts` — place + layers  
- Skill `game-asset-import` — bake models to metres before ship  
