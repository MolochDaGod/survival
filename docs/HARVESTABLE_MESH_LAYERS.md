# Harvestables · mesh · terrain · colliders · three-layer scenes

Canonical placement for outdoor resource nodes in Survival ARPG.

---

## Three different “layers” (never mix them)

| System | Purpose | Module |
|--------|---------|--------|
| **Scene graph roots** | Parent groups for culling & lighting | `SceneGraphLayers.ts` |
| **Three.js `Object3D.layers`** | Camera / raycast visibility | `Layers.ts` |
| **Rapier groups** | Who collides with whom | `PhysicsGroups.ts` |

Setting `mesh.layers.set(WORLD)` does **not** change Rapier.  
Putting a rock under `HarvestRoot` does **not** make it walkable ground.

---

## Scene graph (best-looking outdoor layout)

```
Scene
 ├─ WorldRoot      terrain (GROUND+WORLD), buildings, nature scatter
 ├─ HarvestRoot    harvestables streamed in/out  ← ResourceSystem
 ├─ ActorRoot      player, NPCs, enemies
 └─ VfxRoot        particles, telegraphs (no shadows)
```

Created by `ensureSceneGraph(scene)`.

Why this looks better:

1. **World** — static, heavy shadows, rarely dirty  
2. **Harvest** — mid-rate stream; can fade/hide without touching terrain  
3. **Actors** — high update rate, mixers, no ground-ray pollution  
4. **VFX** — separate layer; cull from minimap / secondary cams  

---

## Mesh pipeline (order is mandatory)

```
template cache  →  clone  →  materials (sRGB maps)
  →  plant feet (y=0, XZ center)
  →  groundY(x,z)          // GROUND layer BVH only
  →  parent HarvestRoot
  →  tag WORLD (not GROUND)
  →  Rapier solid + sensor
```

Implemented by `HarvestablePlacer.place()`.

### Terrain snap

```ts
import { groundY } from '../GroundSampler';
const wy = groundY(wx, wz); // raycast LAYERS.GROUND only
```

- Terrain chunks enable `LAYERS.GROUND` + `WORLD`  
- Harvest props enable **WORLD only**  
- If props were on GROUND, standing under a rock would put feet on the rock top  

### Plant feet

After scale, shift so soles sit at local y=0 and XZ is centered (same idea as player re-root). Then set world position `(wx, groundY, wz)`.

---

## Colliders

| Kind | Shape | Groups | Role |
|------|-------|--------|------|
| **Solid** | Cylinder (0.78× visual radius) | `GROUPS_PROP` | Blocks player / enemies |
| **Sensor** | Slightly larger cylinder | PROP × PLAYER+PROBE | Harvest volume events |
| **Soft plants** | `collider: 'none'` | — | Herbs/hemp don’t block walk |

Shared **fixed** rigid body per placer (static world props).  
Solid is **smaller** than the mesh so silhouettes don’t snag characters.

---

## ResourceSystem integration

1. `seedChunk` — deterministic positions, biome filter, store `worldY`  
2. `update` (near player ~95 m) — `HarvestablePlacer.place({ meshKey, … })`  
3. Far / depleted — `setVisible(false)` (keep handle for respawn)  
4. `setPhysics(physics)` after Rapier init — colliders attach on next place  

```ts
// GameEngine boot
const res = getResourceSystem(scene);
// … after initPhysics
res.setPhysics(this.physics);
```

---

## Graphical quality checklist

- [ ] Shared GLB templates (NatureAssets) — no re-parse per node  
- [ ] `castShadow` / `receiveShadow` on harvest meshes  
- [ ] `frustumCulled = true` for static props  
- [ ] Splat terrain textures active (`enableTerrainSplatTextures`)  
- [ ] Grass on GROUND biomes only (`GrassSystem`)  
- [ ] Nature scatter under WorldRoot (not HarvestRoot)  
- [ ] Cap draw distance (~95 m bubble)  
- [ ] No empty AnimationClips on props  

---

## Code map

| Concern | File |
|---------|------|
| Scene roots | `world/SceneGraphLayers.ts` |
| Place mesh + colliders | `world/HarvestablePlacer.ts` |
| Seed / stream / harvest | `world/ResourceSystem.ts` |
| Textured meshes | `world/NatureAssets.ts` |
| Ground sample | `GroundSampler.ts` |
| Terrain ground layer | `WorldChunkManager.ts` (`LAYERS.GROUND`) |
| Physics groups | `physics/PhysicsGroups.ts` |

---

## Anti-patterns

| Don’t | Why |
|-------|-----|
| `scene.add(mesh)` at y=0 | Floats / sinks vs terrain |
| Tag harvest as GROUND | Breaks foot raycasts |
| Trimesh dynamic colliders | Expensive / unstable |
| Mount shared GLTF cache | One mesh for N nodes |
| Solid collider = full AABB | Snaggy walls of rock |

Do the pipeline above instead.
