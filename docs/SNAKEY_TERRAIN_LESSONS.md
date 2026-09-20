# Lessons from snakey-locomotion → Grudges voxel terrain

**Source:** [muratkamci/snakey-locomotion](https://github.com/muratkamci/snakey-locomotion) (MIT)  
**Clone (local):** `F:/GitHub/_refs/snakey-locomotion`  
**Stack note:** demo uses `three ^0.185` + Vite static deploy — same fleet pin direction as `FLEET_ARPG_STACK.md`.

## What snakey does well (map into Grudges)

| Lesson | Snakey | Grudges production map |
|--------|--------|------------------------|
| **One height function** | `heightAt(x,z)` is SSOT for mesh, snake, camera | `worldHeight` / `sampleTerrainHeight` / `GroundSampler.groundY` — never invent a second analytic field |
| **CPU = GPU ground** | Bakes heightmap from same FBM the mesh uses | Chunk meshes must sample `worldHeight`; BVH raycast for feet; patches blend via `TerrainPatchSystem` |
| **Streaming foliage** | 5×5 toroidal grass tiles, no rebuild | Prefer tile wrap / chunk stream (`WorldChunkManager`, grass systems) over full-world rebuilds |
| **Props mask grass** | Height tex G channel = grass mask under props | Terrain scatter / hub grass must mask under buildings |
| **Simple deploy** | `vite build` → static `dist/` | `build:game` + `vercel-prebuilt` → `/arpg-game/` |
| **SI scale** | Small 400 m demo, 1 unit = 1 m | Grudges 20 km world, human **1.8 m**, feet at ground — voxel avatar same |

## What we do **not** port

| Skip | Why |
|------|-----|
| Snake trail body | Not the avatar stack |
| No physics engine | Grudges **requires** Rapier + mesh-bvh (fleet SSOT) |
| No external models | Grudges ships hub GLB + sector patches + CDN assets |

## Voxel avatar character rules (from lessons)

1. **Feet Y** = `groundY(x,z)` after spawn / every grounded frame — not pelvis, not spawn Y alone.  
2. **Hub + open world** always co-exist: flat Convergence pad + streamed heightfield (snakey: head follows surface modes).  
3. **One AnimationMixer** on the voxel body; harvest / focus / walk share it.  
4. **No OrbitControls** writing combat camera.  
5. **Safe zone** = no hostiles; ground still real height outside flat pad.

## Production wire targets

| System | File |
|--------|------|
| Height SSOT | `world/WorldGen.ts` → `worldHeight` |
| Analytic proxy | `TerrainBuilder.sampleTerrainHeight` |
| Visual feet | `GroundSampler.groundY` |
| Sector GLB blend | `TerrainPatchSystem` + `SectorWorldBootstrap` |
| Safe pad | `ARENA_RADIUS` (flat) + enemy/camp exclusion |
| 9-sector map | `worldGridSectors.ts` + `sectors.ts` + Railway seed |

See `docs/PRODUCTION_WORLD_VOXEL.md`.
