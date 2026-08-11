# Character deploy best practices

Shared rules for putting a **player character** into:

| Game | Path / host |
|------|-------------|
| **ARPG / Survival** | `artifacts/arpg-game` → https://grudges.grudge-studio.com/arpg-game/ |
| **Armada ground** | `grim-armada-web` (same deploy bundle under `deploy-survival/arpg-game`) |
| **Prim (Play hub)** | `grudge-prim-sandbox` → play.grudge.studio |

Skill anchors: `deploy-animated-character`, `game-asset-import`.

---

## Non-negotiables (do not ship without)

| # | Requirement | Fail symptom |
|---|-------------|--------------|
| 1 | **SkeletonUtils.clone** per instance | Shared skeleton / T-pose clones |
| 2 | **Own AnimationMixer** on the instance | Frozen bind pose |
| 3 | Real clips ≥ idle + walk/run | Empty clip → T-pose forever |
| 4 | Mixer / director **update every frame** | Idle forever while moving |
| 5 | **Feet-rooted origin** (bake preferred) | Floating, half-buried, offset on X |
| 6 | Height ~ **1.7–1.9 m** (metres) | 100× giant / ant-sized |
| 7 | Dispose mixer + materials on unmount | Leaks / stolen roots |

**Never** mount the shared GLTF cache root. **Never** use `Object3D.clone` for skinned meshes.

---

## Origin = midpoint between feet

Canonical player mesh:

```
public/models/characters/player/arpg-player.glb   # ARPG
public/models/player/arpg-player.glb              # Armada
public/models/arpg-player.glb                     # Prim
```

Sidecar: `*.manifest.json` with `origin: "feet-midpoint"`, `bakedHeight`, `bakedMinY ≈ 0`, `bakedCenterXZ ≈ [0,0]`.

### Bake (import time — preferred)

```bash
# From survival monorepo
node artifacts/arpg-game/scripts/process-character.mjs \
  --in  path/to/raw-player.glb \
  --out artifacts/arpg-game/public/models/characters/player/arpg-player.glb \
  --height 1.85
```

What the script does:

1. Patches missing `samplers[]` (common toon-soldier export bug)
2. Measures **world-space** bounds of the primary body mesh
3. Scales to target height (metres)
4. Translates so **soles at y=0** and **XZ centered** (between the feet)
5. Writes sidecar manifest

Copy the baked GLB into Prim + Armada + deploy-survival before release.

### Runtime safety net

If an asset is not yet re-baked, every game still re-roots:

| Game | Code |
|------|------|
| ARPG | `normalizeToonHeight` / `PlayerController` plant + XZ center |
| Armada | `PlayerCharacter` + `GLTFModel` plant + XZ center |
| Prim | `CharacterModel` fit wrapper plant + XZ center |

Pattern (never double-scale):

```ts
root.scale.set(1, 1, 1);
root.position.set(0, 0, 0);
// cm → m if height > 20
// scale *= targetH / measuredH
// position = (-center.x, -box.min.y, -center.z)
```

---

## Deploy checklist

### ARPG → grudges.grudge-studio.com/arpg-game/

```bash
# survival monorepo
pnpm --filter @workspace/arpg-game build
# ship dist under base /arpg-game/
# or via grim-armada-web:
npm run deploy:arpg
vercel deploy deploy-survival --prod   # project: survival
```

Verify:

- [ ] `HEAD /arpg-game/` 200
- [ ] `HEAD /arpg-game/models/characters/player/arpg-player.glb` 200 (or CDN)
- [ ] Console: `[PlayerController] Model bbox: ~0.x × 1.85 × 0.x m … origin=feet-midpoint`
- [ ] Idle loops; move → walk/run; not floating

### Armada ground

```bash
cd grim-armada-web
npm run assets:prepare    # bake + manifest when assets change
npm run build
# Player uses PLAYER_TOON.url → /models/player/arpg-player.glb
```

Verify:

- [ ] Two toon instances animate independently
- [ ] Player feet on heightfield (terrain Y matches visual)
- [ ] Weapon parented to hand bone (not floating)

### Prim (play hub)

```bash
cd grudge-prim-sandbox
npm run build
npm run deploy            # vercel --prod
```

Verify:

- [ ] Loadout character **ARPG Operator** shows in hub + showcase
- [ ] CharacterModel fitHeight ~1.85–1.9, soles on ground plane

---

## Asset pipeline order

```
raw GLB/FBX
  → process-character.mjs (scale + feet re-root + manifest)
  → public/models/... in each game
  → (optional) R2 / assets.grudge-studio.com
  → SkeletonUtils.clone + mixer per spawn
  → height fit / plant only if manifest bakedMinY drifts
```

Do **not** “just drop a Sketchfab GLB in public/”. Always bake first.

---

## Related docs

- `docs/SURVIVAL-REMAKE.md` — live host + package
- `grim-armada-web/docs/STACK_ASSETS_GLTF.md` — GLTF importer + Rapier
- `.agents/skills/game-asset-import/SKILL.md` — import decision tree
- `deploy-animated-character` skill — mixer / clone rules
