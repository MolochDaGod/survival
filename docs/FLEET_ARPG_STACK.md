# Fleet ARPG stack — best practices, upgrades & asset deploy reliability

**Live client:** https://grudges.grudge-studio.com/arpg-game/  
**Aliases:** `survival.grudge-studio.com`, `survival-grudgenexus.vercel.app`  
**Repo:** `artifacts/arpg-game` (**Grudges** — voxel-era lead survival MMO)  
**Product lock:** `docs/PRODUCT_ERA_VOXEL.md` · full wire: `docs/PRODUCTION_SSOT.md`  
**Related Open surface:** `open.grudge-studio.com` (dressing, lobby, combat sandbox)  

This document is the SSOT for **how we build and ship 3D games** on the Grudge fleet: package columns, Three.js production rules, lessons from reference scene demos, and a reliable asset-deploy pipeline.

---

## 1. What the live ARPG is

| Layer | Tech |
|-------|------|
| Shell | Vite + React (HUD, books, character select, auth) |
| Play loop | **Imperative Three.js** (`GameEngine`, not pure R3F combat) |
| Physics | `@dimforge/rapier3d-compat` + `PhysicsWorld` |
| Ground | `three-mesh-bvh` / `GroundSampler` (feet snap) |
| Camera | `ThirdPersonCamera` — **sole** play camera writer |
| Engine data | `@workspace/grudge-engine` manifest → `EngineAssets.boot()` |
| Assets | R2 (`assets.grudge-studio.com`) + local `public/` during migrate |
| Auth / saves | Grudge ID rewrites + Railway characters API |
| Co-op | WebSocket / msgpack (Railway) |

### Boot order (never exclusive modes)

Documented in `artifacts/arpg-game/docs/WORLD_DEPLOY.md`:

1. Home hub GLB + spawn JSON  
2. Procedural heightfield / chunks  
3. Sector terrain patches  
4. Island docks  
5. Deploy gate POI  
6. Authored location GLBs  

**Rule:** hub *and* open world layers always load. Exclusive modes break spawn or sector deploy.

### Character always-right (production)

1. Load mesh via `AssetManager` + body config  
2. Fit bbox height to **1.8 m**, feet at local y = 0  
3. `teleportTo` home spawn + `snapToGround()`  
4. Controller keeps feet on mesh/collider every frame  

---

## 2. Five-column package gate (every fleet 3D game)

From skill **`grudge-3d-game-packages`**. Fail PR if any column is red.

| Column | Required | ARPG status | Prefer |
|--------|----------|-------------|--------|
| **Gameplay** | Scene loop, combat, optional multiplayer | Pass | App code + `three` + Rapier; one physics authority |
| **Saves / identity** | SSO, characters, progress | Pass (rewrites) | `id.grudge-studio.com` + same-origin `/api/*` → Railway |
| **Assets** | CDN GLB/JSON | Partial (migrate local `public/models`) | `assets.grudge-studio.com` + ObjectStore defs |
| **Controller** | Grounded SI capsule ~1.8–2.0 m | Pass | Rapier capsule + BVH ground sample |
| **Camera** | One TPS writer in play | Pass | No Orbit fighting combat camera |

### Minimum packages (imperative Three path)

```json
{
  "dependencies": {
    "three": "^0.185.1",
    "@dimforge/rapier3d-compat": "^0.19.3",
    "three-mesh-bvh": "^0.9.9"
  }
}
```

| Package | ARPG today | Target |
|---------|------------|--------|
| `three` | **^0.185.1** | **^0.185.x** (fleet pin) |
| `rapier3d-compat` | ^0.19.3 | keep |
| `three-mesh-bvh` | ^0.9.9 | keep |
| Draco + Meshopt + KTX2 | wired in `createGLTFLoader.ts` | keep + bake assets to match |

---

## 3. Lessons from threejs-games examples

Reference demos (educational patterns — not copy-paste into production as-is):

| Demo | URL | Genre pattern |
|------|-----|---------------|
| **RPG Fantasy** | https://threejs-games.github.io/examples/80-scenes/rpg-fantasy/ | Open field, player + AI, goals UI, lazy enemy import |
| **Zeppelin** | https://threejs-games.github.io/examples/80-scenes/zeppelin/ | Vehicle/airship, large map, water + terrain, updatable list |
| **Graveyard Survival** | https://threejs-games.github.io/examples/80-scenes/graveyard-survival/ | Survive timer, wave spawn, particles, day/night win condition |

Core library: `https://threejs-games.github.io/core/` (`scene.js`, `loaders.js`, `helpers.js`, `GameLoop.js`, `ground.js`).

### 3.1 Patterns to **adopt** (best use)

| Pattern | How demos do it | Fleet / ARPG equivalent |
|---------|-----------------|-------------------------|
| **Shared scene boot** | One `scene` + `camera` + `createToonRenderer` / `GameLoop` | `GameEngine` + fixed renderer defaults (sRGB + ACES) |
| **Lazy dynamic `import()`** | Enemies/props loaded after first paint | Code-split heavy systems (VFX, sector packs, AI variants) |
| **Spinner until world ready** | `Spinner` hide after assets | Loading gate before control unlock |
| **First paint early** | `renderer.render` before heavy loads | Show terrain/sky ASAP; stream castles/NPCs |
| **Normalized model height** | `loadModel({ size: 40 })` → scale from bbox height | **Bake metres offline**; runtime fit only as safety (1.8 m hero) |
| **Place on solids** | `putOnSolids(mesh, terrain)` + raycast | `snapToGround` / BVH sampler / Rapier ray |
| **Empty coord grid** | `getEmptyCoords({ mapSize, fieldSize })` | Spawn tables + sector POIs (avoid random pile-up) |
| **Solids list for agents** | `solids = [terrain, castle]` passed to player/AI | Collision layers + shared ground set |
| **Updatables array** | `updatables.forEach(u => u.update(delta))` | Explicit system tick order in `GameEngine` |
| **Delta in seconds** | `GameLoop` passes `dt` seconds | All anim/physics/move use seconds |
| **Pause on tab hide** | `visibilitychange` → pause | Don’t drain battery; freeze sim carefully for multiplayer |
| **Goal screen before loop** | `gui.showGameScreen({ callback: start })` | Character select / deploy gate before full sim |
| **Pixel ratio cap** | `Math.min(2, devicePixelRatio)` | Prefer **≤ 1.5** on mobile fill-rate |
| **Import maps for three** | `importmap` → single three build | Vite resolves `three` once; never dual copies |

### 3.2 Patterns to **upgrade** (demos are educational)

| Demo habit | Why weak in production | Fleet upgrade |
|------------|------------------------|---------------|
| Load **FBX** at runtime for castles | Heavy, slow, no Draco/Meshopt | **Bake → GLB** (Meshopt/Draco) on CDN |
| Runtime `scale = targetHeight / bbox` for every model | Float/jitter; different packs fight | **Import bake SI**; catalog `scale: 1` when baked |
| Flat `MeshLambertMaterial` override | Loses PBR, wrong on modern pipeline | Keep glTF PBR; sRGB color maps |
| One giant map, all NPCs in scene | Draw call / anim cost | Chunks, LOD, sleep AI off-camera |
| `new THREE.Color` in loop (graveyard dawn) | GC pressure | Reuse `Color` / `Vector3` |
| No physics engine | Toy collision via raycasts | **Rapier** for playable worlds |
| No CDN / multi-host resolve | Fine for GitHub Pages toys | `assetUrl` + fleet hosts + dead-URL cache |
| OutlineEffect as default renderer | Nice toon; expensive full-time | Optional stylized mode; default ACES + selective outline |

### 3.3 Scene-specific upgrades we can steal

**RPG Fantasy → ARPG combat sandbox**

- Goal milestones (`messageDict` kills) → mission / camp intro toasts  
- Mix enemy types via dynamic import → creature registry + biome tables  
- `shouldRaycastGround: true` on AI → always sample heightfield/BVH  

**Zeppelin → vehicles / airship / lobby cinema**

- Player is a **vehicle** with camera parented, not a humanoid TPS only  
- Large `mapSize` + water plane → water system already in ARPG; keep vehicle as first-class `scriptedRole: vehicle`  
- Separate tree coords from player coords (`emptyCenter`) → keep docks clear of clutter  

**Graveyard Survival → wave / night modes**

- Time-boxed survival (`totalTime`) + score → Danger Room / sector defense modes  
- Interval spawn + particle burst on spawn → telegraph + VFX pool  
- Night → day win condition (background lerp) → weather/day cycle hooks already present  

---

## 4. Three.js reliability checklist (deploy assets well)

### 4.1 Delivery format (hard rules)

| Do | Don’t |
|----|-------|
| Ship **glTF/GLB** as production mesh | Ship OBJ/FBX/Collada as primary client loads |
| Draco and/or **Meshopt** on geometry | Uncompressed multi-MB skinned meshes |
| **KTX2 / Basis** when texture-heavy | 4K PNG albedo for every prop |
| Same-origin **or** CORS-enabled CDN | Random third-party hosts without CORS |
| Content-addressed or versioned keys | Overwrite CDN keys without cache bust |

**Loader stack (ARPG already has this — keep it mandatory):**

```ts
// createGLTFLoader.ts pattern
GLTFLoader + DRACOLoader (wasm) + KTX2Loader + MeshoptDecoder
// KTX2: detectSupport(renderer) after WebGLRenderer exists
```

Vendored decoders under `public/decoders/` so production does not depend on a third-party CDN for wasm.

### 4.2 Color & renderer (r152+ / fleet r185)

```ts
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.0 // tune 0.9–1.2
renderer.shadowMap.type = THREE.PCFSoftShadowMap
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5))
// color maps: texture.colorSpace = SRGBColorSpace
// normal/rough/metal/data: leave linear / NoColorSpace
```

Never use legacy `outputEncoding` / `sRGBEncoding` guides without translation.

### 4.3 Units & character

| Rule | Value |
|------|-------|
| World unit | **1 = 1 metre** |
| Average human | **~1.8 m** height |
| Feet | Local y = 0 after fit; snap to ground every spawn |
| Import | Bake scale offline (`game-asset-import` / `process-character.mjs`) |

### 4.4 Animation mixer (no silent T-pose)

1. Skeleton bone names must match clip tracks (`mixamorig*` / `Bip001` — pick one family per rig).  
2. `mixer.update(dt)` every frame after load.  
3. Always have an **idle** clip loaded before unlock control.  
4. If pack missing on CDN: log hard error; fall back to base pack — never empty map.  
5. Companion packs when character GLB ships zero clips (engine manifest `animationLibraries`).  
6. Strip root XZ motion for treadmill locomotion when engine owns translation.

### 4.4b Spine / aim IK (gunplay)

**Module:** `artifacts/arpg-game/src/game/ik/SpineIK.ts`  
**Existing light layer:** `AnimBlendLayer.ts` (`AdditiveAnimLayer` — local-X pitch + breath).

| | AdditiveAnimLayer | SpineIK |
|--|-------------------|---------|
| Use when | ARPG light aim, idle breath | FP/TP **gun ADS**, camera-parented head |
| Axes | Local bone X | Camera **world** pitch axis + parent conjugation |
| Restore buffer | No (post-multiply only) | Yes — `restoreBones()` before mixer |
| Head roll | No | `clearHeadRoll()` for FP |

**Frame order (required):**

```
spineIK.restoreBones()
locomotion + mixer.update(dt)
spineIK.applyAim1P(camera, pitch)   // or applyAim3P(camera, gunEngaged)
// optional: AdditiveAnimLayer.lateUpdate for breath only (don't double-pitch)
```

**Rules:** module-level scratch quats (no per-frame `new`); 2–3 spine bones max; prefer bake aim clips for big poses, IK only for continuous mouse pitch; do not fight a second system writing the same bones.

### 4.5 Performance (always)

| Rule | Practice |
|------|----------|
| No `new` in tick | Reuse Vector3 / Quaternion / Raycaster |
| Instancing | Grass, rocks, tombstones, trees |
| LOD | Distant props / sector shells |
| Lights | Few direct; hide with `.visible`, don’t destroy |
| Shadows | Tight frustum on player; 1024–2048 map |
| Frustum | Reasonable far plane |
| Origin | Keep play near local origin; floating origin if huge maps |
| Dispose | Only permanent removes; prefer `visible = false` pools |

### 4.6 Deploy path for binaries

```
Author FBX/OBJ
    → bake (gltf-transform: resize, draco/meshopt, webp/ktx2)
    → SI scale bake
    → upload R2 (assets.grudge-studio.com/{key})
    → register D1 / prefab / asset-manifest
    → client resolves via assetUrl() / fleet multi-host
    → Vercel ships ONLY small shell + decoders + critical boot GLBs
```

| Anti-pattern | Symptom |
|--------------|---------|
| `**/*.glb` / `**/*.fbx` vercelignored with no CDN | T-pose, missing world, 404 storm |
| Same-origin-only probe when files live on R2 | “Pack missing” forever |
| HTML SPA fallback served as 200 for missing GLB | Loader parses HTML as GLB → cryptic fail |
| Dual three copies (importmap + bundler) | Broken materials / huge bundle |

**Probe production after deploy:**

```bash
# binary must NOT be text/html
curl -sI https://deploy-survival.vercel.app/arpg-game/decoders/draco/gltf/draco_decoder.wasm
curl -sI https://assets.grudge-studio.com/locations/encampment.glb
```

### 4.7 Multi-host resolve pattern (Open + Survival)

```
same-origin BASE_URL path
  → open / survival host
  → assets.grudge-studio.com
  → mark dead URL (TTL) so we don't spam 404s
```

Never use incomplete prefixes (e.g. broken `assets.grudge-studio.com/gameopen/**` mass 404s).

---

## 5. Upgrade roadmap (prioritized)

### P0 — reliability

| Item | Why |
|------|-----|
| Keep Draco/Meshopt/KTX2 decoders in deploy artifact | Compressed GLB unreadable without them |
| Assert boot clips load (idle + loco) before control unlock | Eliminates T-pose launches |
| CDN + same-origin HEAD/GET probes with content-type check | Detect SPA HTML false-200 |
| Single physics authority (Rapier) | No dual sim |

### P1 — quality & parity with demos (upgraded)

| Item | From demos | Production form |
|------|------------|-----------------|
| Lazy sector / enemy packs | dynamic `import()` | Vite async chunks per biome/faction |
| Goal / wave modes | RPG + graveyard | QuestSystem + Danger Room presets |
| Vehicle camera modes | Zeppelin | Boat / airship controllers already sketched — finish |
| Coordinate pools for scatter | `getEmptyCoords` | Seeded Poisson / grid with empty center |
| Early first frame | paint terrain before castles | Progressive `SceneBuilder` stages |

### P2 — fleet alignment

| Item | Action |
|------|--------|
| three **0.185** | Upgrade + regression (post, color, loaders) |
| Finish R2 offload of `public/models` | Vercel size + cache |
| Engine manifest as only controller/camera/anim SSOT | Kill hard-coded magic numbers |
| Register all play origins in Grudge ID CORS | Auth reliability |

### P3 — polish

| Item | Action |
|------|--------|
| Optional toon outline mode | From `OutlineEffect` demos — post stack toggle |
| Meshopt-first bake for all characters | Faster TTI |
| Floating origin for 6.4 km world | Reduce precision shimmer |

---

## 6. System map (mental model)

```
React shell (select, HUD, books)
        │
        ▼
   GameEngine
        ├─ Renderer (sRGB, ACES, pr≤1.5)
        ├─ SceneBuilder (hub → world → sectors → docks → gate)
        ├─ PlayerController + ThirdPersonCamera
        ├─ PhysicsWorld (Rapier) + GroundSampler (BVH)
        ├─ AssetManager / EngineAssets (manifest + GLTF stack)
        ├─ Combat / AI / VFX pools / township
        └─ NetClient (co-op)
```

**Open dressing / Explorer** should follow the same laws: ship or CDN every clip the mixer needs; labels match resolved motion; SI height; idle kicked on load.

---

## 7. PR / deploy gate (copy into CI)

```
[ ] three pinned ~0.185 (or documented exception)
[ ] Rapier present for playable 3D
[ ] GLTFLoader has Draco + Meshopt (+ KTX2 when used)
[ ] decoders/ shipped next to client
[ ] idle (or loco set) loads before input unlock
[ ] assets resolve CDN or same-origin; no HTML 200 on .glb
[ ] auth: id hub + /api rewrites
[ ] camera: one play writer
[ ] SI 1.8 m hero fit; feet snap
[ ] physics debug gated
[ ] no dual three bundles
[ ] world boot non-exclusive layers
```

---

## 8. Related skills & docs

| Topic | Skill / path |
|-------|----------------|
| Package columns | `grudge-3d-game-packages` |
| three r185 production | `threejs-production-best-practices` |
| Character scale/facing | `grudge-character-correctness`, `grudge6-full-stack` |
| Engine manifest | `survival/.agents/skills/grudge-engine` |
| Import bake | `survival/.agents/skills/game-asset-import` |
| World boot | `artifacts/arpg-game/docs/WORLD_DEPLOY.md` |
| Auth / Railway | `grudge-production-wiring` |
| Open fleet | `gameopen` / `grudge-live-servers` |

---

## 9. Quick reference — three demo → fleet one-liner

| Demo takeaway | Fleet sentence |
|---------------|----------------|
| Lazy import actors | Code-split enemies and vehicles |
| Normalize size on load | Prefer bake; runtime fit is safety net |
| putOnSolids | BVH/Rapier ground snap |
| GameLoop dt seconds | One clock; pause on hidden |
| Early render | Progressive world boot |
| Updatables list | Explicit system order |
| Cap pixel ratio | ≤ 1.5 production |
| Don’t runtime-FBX forever | glTF + compression + CDN |

---

### P0 combat integration (2026-07-28)

Implemented in ARPG client:

| Piece | Location |
|-------|----------|
| Weapon sockets (`muzzle`, `blade_tip`, `blade_base`) | `WeaponAttachment.getMuzzlePose` / `getBladeSegment` |
| Projectiles from muzzle + 3D aim | `GameEngine.fireBullet` → `player.getMuzzleSpawn()` |
| SpineIK (restore → mixer → apply) | `PlayerController` + `ik/SpineIK.ts` |
| Blade-segment melee hits | `EnemyManager.checkPlayerAttack(..., blade)` |

### P1 feet IK (2026-07-28)

| Piece | Location |
|-------|----------|
| Feet plant on BVH ground | `ik/FeetIK.ts` `FeetPlantIK` |
| Wired after SpineIK | `PlayerController` (grounded only; skip jump/roll/mantle) |
| No bone stretch | hips local Y only + light foot pitch |

Pipeline SSOT for body/skeleton/scale:  
`grudge-pipeline` → `docs/SKELETON_AND_FEET.md` · `web/js/skeletonCanon.js` · game-ready filter default.

Next: equip/sheath packs, upper-body mask for reload-while-run.

---

*Last updated: 2026-07-28 · Live: deploy-survival.vercel.app/arpg-game · References: threejs-games 80-scenes (rpg-fantasy, zeppelin, graveyard-survival).*
