---
name: game-asset-import
description: >
  Import and convert 3D assets for Grudge Studio Nexus-era games (Grudox / Survival ARPG).
  Bakes mesh-level scale to metres at import time so runtime loaders never guess.
  Covers GLB/GLTF characters, FBX enemies, and map GLBs. Use when importing
  models, fixing wrong scale (100x giant, tiny model), converting Sketchfab/Mixamo/
  Quaternius exports, or adding creatures/characters to artifacts/arpg-game.
  Triggers: import model, scale wrong, mesh scale, convert glb, process character,
  asset pipeline, 100x too large, character too big.
---

# Game Asset Import (Grudge Studio)

All Grudge Studio browser games use **metres**: `1 Three.js unit = 1 metre`.
Never ship raw Sketchfab/Mixamo/FBX exports without baking scale at import.

## Decision tree

| Asset type | Import script | Runtime scale |
|------------|---------------|---------------|
| Player character GLB | `process-character.mjs` | `NEXUS_ENGINE_MANIFEST.controllers` `worldScale: 0.01` (GrudgeControlBridge) |
| Enemy/creature FBX | `process-character.mjs` or manual `--scale` | `creatures.ts` `scale` field (0.014 Mixamo, 1.0 if mesh-baked) |
| World map GLB | `process-map.mjs` | `1.0` (baked at import) |
| Prop/weapon GLB | `process-character.mjs --height <m>` | `1.0` unless documented |

## Workflow (characters)

1. **Inspect raw file** — measure height before touching runtime code:
   ```bash
   node artifacts/arpg-game/scripts/inspect-character-rigs.mjs <path/to/raw.glb>
   ```

2. **Bake to metres** — mesh/matrix level, not runtime `group.scale`:
   ```bash
   node artifacts/arpg-game/scripts/process-character.mjs \
     --in  attached_assets/raw/adventurer.glb \
     --out artifacts/arpg-game/public/models/characters/male/adventurer.glb \
     --height 1.8
   ```
   Humanoid target: **1.8 m**. Large mechs: **2.5–3.5 m**. Props: measure in Blender.

3. **Verify manifest** — sidecar JSON records `rawHeight`, `appliedScale`, `bakedHeight`:
   ```
   adventurer.manifest.json
   ```

4. **Register in game** — add `gltfPath` in `CharacterConfig.ts` `BODY_TYPES` if new variant.

5. **Runtime check** — boot game, confirm console log:
   ```
   [PlayerController] Model bbox: ~0.4 × 1.8 × 0.4 m
   ```
   For third-person (grudge-control), character should be ~1.8 m tall, capsule ~0.3 m radius.

## Workflow (maps)

```bash
node artifacts/arpg-game/scripts/process-map.mjs \
  --in  attached_assets/scene.glb \
  --out artifacts/arpg-game/public/locations/town.glb \
  --scale 0.01 \
  --marker player
```

Sketchfab exports usually need `--scale 0.01` (cm → m). Read spawn from sidecar `.json`.

## Workflow (enemies)

1. Bake FBX → GLB externally (Blender) or scale at import with explicit `--scale`.
2. If mesh-baked to metres, set `scale: 1.0` in `creatures.ts`.
3. If still raw Mixamo FBX (~100 units tall), keep `scale: 0.014` until re-baked.
4. `AssetManager` auto-fits GLB enemies with `scale === 1.0` to ~1.5 m if bbox > 3 m.

## Unit conventions (do not mix)

| System | Internal units | Bridge to metres |
|--------|----------------|------------------|
| Survival world / Rapier | metres | — |
| grudge-control capsule | centimetres (h=180, r=30) | manifest `worldScale` via `toGrudgeControlUnits()` |
| Mixamo FBX raw | ~100 units | `0.014` runtime OR bake at import |
| Quaternius GLTF | ~1.8 m | bake + `WORLD_SCALE 0.01` for grudge-control |
| Sketchfab GLB | often cm | `--scale 0.01` at import |

## Common bugs

**100× giant character in third-person**
- Cause: grudge-control `modelScale = 180 / size.y` when GLTF is already in metres and `scale: 1`.
- Fix: `GrudgeControlBridge` uses `WORLD_SCALE = 0.01`. Do not set `scale: 1` on grudge-control configs.

**Giant in first-person / legacy path**
- `PlayerController` auto-normalizes to 1.8 m — if still wrong, raw bbox may include hidden nodes; run `process-character.mjs`.

**T-pose after import**
- Scale bake does not fix rig/clip mismatch. Use Quaternius clips baked in GLTF or companion UAL/Mixamo packs per `AssetManager` logs.

## Files to touch

| File | When |
|------|------|
| `artifacts/arpg-game/scripts/process-character.mjs` | New import script |
| `artifacts/arpg-game/scripts/process-map.mjs` | Map imports |
| `artifacts/arpg-game/src/game/CharacterConfig.ts` | New body type path |
| `artifacts/arpg-game/src/data/creatures.ts` | New enemy + scale |
| `artifacts/arpg-game/src/game/GrudgeControlBridge.ts` | grudge-control unit bridge |
| `artifacts/arpg-game/src/game/AssetManager.ts` | Loader behaviour (rare) |

## CDN deploy

Character models ship from `assets.grudge-studio.com`. After baking locally, upload to R2/CDN and keep `gltfPath` as `/models/characters/...`.

## References

- `references/units.md` — full unit table + loader behaviour
- `artifacts/arpg-game/scripts/inspect-glb.mjs` — animation/skeleton audit
- `artifacts/arpg-game/scripts/inspect-character-rigs.mjs` — bone naming audit