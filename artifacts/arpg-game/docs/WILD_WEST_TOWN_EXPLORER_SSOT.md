# Grudges: Wild West town + Explorer player SSOT

**Date:** 2026-08-12  
**Product:** Grudges (`artifacts/arpg-game`)

## Player

| Rule | Value |
|------|--------|
| Live body | **Explorer avatar** (blocky ~1.8 m) — `ExplorerAvatar.ts` |
| 4 characters | Palette/look from fleet 4-slot (`grudge.fleetRoster` / active char colors) |
| Not used as live hero | Quaternius BODY_TYPES GLTF, capsules, Meshy |

Load path: `AssetManager.loadCharacterGLTF` → `loadExplorerPlayerAvatar`.

## Scene prefab

| Field | Value |
|-------|--------|
| Source zip | `D:\Games\diorama_modular_wild_west_stylized_lowpoly.zip` |
| Runtime GLB | `public/locations/wild-west-town.glb` |
| Sidecar | `public/locations/wild-west-town.json` |
| Starter mode | `SceneBuilder` `STARTER_MAP_MODE=true`, `STARTER_MAP_NAME=wild-west-town` |

### Prefab rules

- **Small town** hub at origin  
- **4 vendors** + **4 neutral guards** (`EncampmentIntro.ENCAMPMENT_NPCS` / `WildWestTownPrefab`)  
- **Friendly zone** radius **40 m** — no enemy spawns (`EnemyManager.SPAWN_SAFE_RADIUS`)  
- **No build** inside claim (`WILD_WEST_TOWN.allowBuild=false`, Build menu banner)

## Code

| File | Role |
|------|------|
| `src/game/ExplorerAvatar.ts` | Player mesh |
| `src/game/world/WildWestTownPrefab.ts` | Town rules + NPC list |
| `src/game/quest/EncampmentIntro.ts` | Spawn + intro quest |
| `src/game/SceneBuilder.ts` | Starter map switch |
| `src/data/prefabs.ts` | Prefab catalog row |

## Smoke

1. Boot Grudges → spawn in Dusty Gulch (wild-west-town GLB).  
2. Player is blocky Explorer avatar (not Quaternius).  
3. 8 named NPCs (4 shop + 4 guard).  
4. No hostiles inside 40 m of spawn.  
5. Build menu shows no-build hub message.
