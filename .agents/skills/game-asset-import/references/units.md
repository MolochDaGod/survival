# Grudge Studio — Asset Unit Reference

## Target

- World space: **metres**
- Humanoid height: **1.8 m** (eye line ~1.6 m)
- Player capsule: **~0.3 m radius, 1.8 m tall** in world space

## Import scripts

### process-character.mjs

Bakes uniform scale into scene-root child matrices (same technique as maps).
Outputs `.manifest.json` with measured heights.

```bash
node artifacts/arpg-game/scripts/process-character.mjs \
  --in <raw> --out <public/path.glb> --height 1.8
```

Override scale manually when height measurement is unreliable (nested transforms):

```bash
--scale 0.01   # cm → m
--scale 0.001  # mm → m
```

### process-map.mjs

```bash
node artifacts/arpg-game/scripts/process-map.mjs \
  --in <raw.glb> --out <location.glb> --scale 0.01 --marker player
```

## Runtime loaders

### GrudgeControlBridge (third-person / ARPG)

- `WORLD_SCALE = 0.01` on `playerModelConfig.scale`
- Physics/camera values pre-multiplied by `WORLD_UNITS = 100`
- grudge-control fits model: `(180 / bboxHeight) * scale`

### PlayerController + AssetManager (first-person fallback)

- Auto-normalizes loaded template to `PLAYER_TARGET_HEIGHT_M = 1.8`
- Does not affect grudge-control path (separate model instance)

### AssetManager enemy loader

- FBX: uses `creatures.ts` `scale` (typically `0.014`)
- GLB with `scale === 1.0`: auto-fits if bbox height > 3 m

## Source pack defaults

| Pack | Raw height | Import scale | Runtime scale (if not baked) |
|------|------------|--------------|------------------------------|
| Quaternius GLTF | ~1.8 m | 1.0 (already metres) | grudge `0.01` only |
| Mixamo FBX | ~180 units | bake or `0.01` matrix | `0.014` |
| Sketchfab scene | cm | `0.01` | N/A (map) |