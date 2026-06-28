---
name: grudge-engine
description: >
  Grudge Engine scriptable assets and systems for Nexus-era games (Grudox / Survival).
  Data-driven manifest for controllers, cameras, animation libraries, textures, and
  import pipeline. Covers EngineAssets facade, PrefabRegistry enrichment, grudge-control
  bridge, Forge export contract, and industry patterns (single boot manifest, mesh-level
  scale bake, registry facades). Use when wiring controllers, cameras, animations,
  textures, scriptable prefabs, engine manifest, or consolidating fragmented asset catalogs.
  Triggers: grudge engine, engine manifest, scriptable assets, controller profile,
  camera profile, animation library, EngineAssets, Nexus defaults, kindToScriptedRole.
---

# Grudge Engine (Nexus Era)

Single source of truth for scriptable runtime systems. Shared across client, API, Forge, and Dash.

## Architecture

```
lib/grudge-engine/          # Zod schemas + NEXUS_ENGINE_MANIFEST defaults
artifacts/arpg-game/
  EngineAssets.ts           # Boot facade (manifest + prefabs + path resolve)
  PrefabRegistry.ts         # DB prefabs → rich client Prefab
  GrudgeControlBridge.ts    # Controller/camera from manifest
  AssetManager.ts           # clipMap + companion packs from manifest
artifacts/api-server/
  routes/engine.ts          # GET /api/engine/manifest
```

**Industry pattern:** one boot manifest, data-driven configs, mesh-level scale at import (never runtime guess), registry facades behind one loader.

## Boot sequence

1. `engineAssets.boot()` — parallel fetch `/api/engine/manifest` + `/api/prefabs`
2. Fallback: localStorage cache → bundled `NEXUS_ENGINE_MANIFEST`
3. `AssetManager.loadAll()` must call `engineAssets.boot()` first (not raw `prefabRegistry`)

## Manifest sections

| Section | Purpose | Consumer |
|---------|---------|----------|
| `controllers` | grudge-control / legacy driver, worldScale, physics | `GrudgeControlBridge` |
| `cameras` | TPS / ARPG / FPS distances, FOV, spring | `GrudgeControlBridge`, orbit rigs |
| `animationLibraries` | clipMap, companionPacks, rig family | `AssetManager`, `LocomotionAnimator` |
| `textures` | sRGB, repeat, anisotropy profiles | `AssetManager.loadTexture` |
| `pipeline` | CDN base, import script paths, scale defaults | Forge, CI, `game-asset-import` skill |
| `libraries` | grudge-control, three, rapier, forge URLs | Dash, tooling |

## Controllers (grudge-control bridge)

- Manifest values are in **metres**
- grudge-control uses **cm** internally → `toGrudgeControlUnits(m, worldScale)` where `worldScale = 0.01`
- Never hardcode `WORLD_SCALE`, gravity, or camera distances in bridge code — read `engineAssets.getController(id)`

```ts
const ctrl = engineAssets.getController('grudge-control-tps')!;
const cam = engineAssets.getCameraForMode('third-person')!;
const animLib = engineAssets.getAnimLibrary(ctrl.animationLibraryId)!;
```

## Animation libraries

- `clipMap`: source GLB clip name → engine semantic name (`Idle`, `Walk`, `Run`, `StrafeLeft`, …)
- `companionPacks`: UAL1/UAL2 paths when character GLB ships zero clips
- Use `buildAnimClipMap(manifest, libraryId)` — do not duplicate ANIM_MAP in loaders

Rig sniffing (Unreal mannequin vs Mixamo) stays in `AssetManager`; only paths and clip names come from manifest.

## Scriptable prefabs

DB `prefabs` table → API `/api/prefabs` → `PrefabRegistry.enrichRow()`:

- `kind` → `scriptedRole` via `kindToScriptedRole()` (shared with `@workspace/grudge-engine`)
- Rich fields live in `data` jsonb until schema migrates: `animations`, `textures`, `collider`, `aiHints`, `spawnRules`

| kind | scriptedRole |
|------|--------------|
| monster | enemy |
| npc | npc |
| player_body | player |
| weapon, item, consumable | item |
| structure, furniture, turret | building |
| vehicle, drone, mech | vehicle |
| prop, vfx | fx |

## Forge export contract

When exporting from Forge (`pipeline.libraries.forge`):

```json
{
  "kind": "monster",
  "modelPath": "/models/creatures/foo.glb",
  "scale": 1.0,
  "data": {
    "legacyKey": "foo",
    "scriptedRole": "enemy",
    "animations": [{ "name": "walk", "clipPath": "...", "loop": true }],
    "spawnRules": { "biomes": ["tundra"], "maxPerChunk": 4 }
  }
}
```

Mesh must be import-baked to metres (`process-character.mjs`). Set `scale: 1.0` when baked.

## Adding a new controller or camera

1. Extend Zod schemas in `lib/grudge-engine/src/types.ts` if new fields needed
2. Add profile to `NEXUS_ENGINE_MANIFEST` in `nexus-defaults.ts`
3. Reference by id in bridge/spawn code — no magic numbers in game files
4. Dash `/games/grudox` reads `/api/engine/manifest` for ops visibility

## Adding an animation library

1. Add `animationLibraries[]` entry with `id`, `rig`, `companionPacks`, `clipMap`
2. Point controller `animationLibraryId` at the new id
3. Verify companion pack bone names bind (console bind report in AssetManager)

## API

```
GET /api/engine/manifest  → full EngineManifest JSON
GET /api/prefabs          → scriptable entity rows
```

## Related skills

- **game-asset-import** — mesh-level scale bake, `process-character.mjs`, units
- **threejs-animation** — clip merging, SkeletonUtils, root motion strip

## Anti-patterns (do not)

- Hardcode `WORLD_SCALE = 0.01` outside manifest
- Duplicate `ANIM_MAP` in multiple files
- Runtime `group.scale.setScalar(0.01)` to fix giant imports — bake at import
- Six separate catalogs without going through `engineAssets.boot()`