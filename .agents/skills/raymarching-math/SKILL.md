# Raymarching Math Skill

## Purpose
Integrate sphere-tracing / raymarching mathematics into Grudge Nexus for:
- Accurate terrain collision (no tunneling at high speed)
- Line-of-sight / cover queries for AI
- GPU-side distance field visualization (tundra ice pillars, volumetric fog)
- Debug ground-normal estimation without BVH overhead

## Reference
"Raymarching & Fixed Point Iteration" shader study  
https://www.shadertoy.com/view/ldsGWl  
"Frozen Wasteland" distance field: https://www.shadertoy.com/view/Xls3D2  
Inigo Quilez implicit distance: https://iquilezles.org/articles/distance/

---

## Core Concepts

### Fixed-Point Iteration (FPI) Termination
Standard sphere tracing marches forward by the SDF value at each step.
The FPI view: we solve `f(t) = t` where `f(t) = SDF(ray(t)) + t`.

```glsl
// Convergence condition: |t - last_t| < eps  (not just SDF < eps)
// This correctly handles near-zero gradient regions.
float t = tMin;
float lastT = -1e6;
for (int i = 0; i < MAX_STEPS; i++) {
  if (abs(lastT - t) < 0.001) break;   // FPI converged
  lastT = t;
  float d = sdf(ro + rd * t);
  t += STEP_MULT * d;                  // STEP_MULT ≤ 1.0 for safety
  if (t > tMax) break;
}
```

**Why this matters for games:**  
When the height-field SDF has large gradients (steep slopes, cliff edges), the normal
sphere-trace `d < eps` test fails to converge — the step orbits around the intersection.
FPI detects convergence even in those cases.

---

## TypeScript Terrain Raycast (CPU-side)

Used in `PlayerController.ts` for predictive floor-finding — prevents tunneling when
falling fast or on fast-moving terrain.

```typescript
// artifacts/arpg-game/src/game/math/TerrainRaycast.ts

import { GroundSampler } from '../GroundSampler';

const MAX_STEPS   = 64;
const STEP_MULT   = 0.65;   // conservative overstep guard
const HIT_EPS     = 0.02;   // metres — convergence radius
const GRADIENT_EPS= 0.25;   // FPI convergence check

/**
 * March a ray against the heightfield.
 * Returns hit distance or Infinity if no hit within tMax.
 */
export function terrainRaycast(
  ox: number, oy: number, oz: number,   // ray origin
  dx: number, dy: number, dz: number,   // ray direction (unit)
  tMin = 0.1,
  tMax = 80,
): number {
  let t = tMin, lastT = -1e6;

  for (let i = 0; i < MAX_STEPS; i++) {
    const px = ox + dx * t;
    const pz = oz + dz * t;
    const surfY = GroundSampler.getHeight(px, pz);
    const py    = oy + dy * t;

    const d = py - surfY;           // signed distance to surface (+ = above)

    if (Math.abs(lastT - t) < GRADIENT_EPS) break; // FPI converged but no hit
    if (d < HIT_EPS) return t;                      // hit

    lastT = t;
    t += Math.min(d * STEP_MULT + t * 0.001, 6.0);  // adaptive step
    if (t > tMax) break;
  }
  return Infinity;
}

/**
 * Quick downward cast — replaces simple heightmap lookup when
 * the player is moving fast (dy < -5 m/s).
 */
export function downCast(ox: number, oy: number, oz: number, speed: number): number {
  const steps = Math.max(4, Math.min(16, Math.ceil(speed * 0.08)));
  const dt    = 2.0 / steps;
  for (let i = 0; i < steps; i++) {
    const t     = i * dt;
    const hitT  = terrainRaycast(ox, oy, oz, 0, -1, 0, t, t + dt + 0.5);
    if (hitT < Infinity) return oy - hitT;
  }
  return GroundSampler.getHeight(ox, oz);
}
```

---

## LOS (Line-Of-Sight) Query for AI

Used by `NPCBrain.ts` to check if an NPC can see the player or another entity.

```typescript
// Returns true if the ray from A to B is unobstructed by terrain.
export function hasLOS(
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
): boolean {
  const dx   = bx - ax, dy = by - ay, dz = bz - az;
  const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
  if (dist < 0.5) return true;
  const invD = 1 / dist;
  const hit  = terrainRaycast(ax, ay + 0.5, az,
                              dx*invD, dy*invD, dz*invD,
                              0.3, dist - 0.3);
  return hit === Infinity;
}
```

---

## GLSL SDF Primitives (for GPU use in shaders)

```glsl
// Smooth minimum — blends two SDF surfaces
float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

// Box SDF
float sdBox(vec3 p, vec3 b) {
  vec3 d = abs(p) - b;
  return min(max(d.x, max(d.y, d.z)), 0.0) + length(max(d, 0.0));
}

// Cylinder SDF (for NPC capsule debug visualisation)
float sdCylinder(vec3 p, float r, float h) {
  vec2 d = abs(vec2(length(p.xz), p.y)) - vec2(r, h);
  return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
}

// Heightfield approximate SDF — usable for terrain gradient normals
float hfSDF(vec3 p, sampler2D heightTex, float worldScale) {
  float hy = texture2D(heightTex, p.xz / worldScale).r * 80.0;
  return p.y - hy;
}
```

---

## Normal Estimation via Finite Differences

```glsl
// Used in BiomeTerrainMaterial for bump detail without normal map texture
vec3 estimateNormal(vec3 pos, float eps) {
  vec2 e = vec2(eps, 0.0);
  return normalize(vec3(
    hfSDF(pos + e.xyy) - hfSDF(pos - e.xyy),
    hfSDF(pos + e.yxy) - hfSDF(pos - e.yxy),
    hfSDF(pos + e.yyx) - hfSDF(pos - e.yyx)
  ));
}
```

---

## Movement Math Integration

### No-Tunnel Gravity Step
In `PlayerController.handleGravity()`, replace the simple
`position.y = groundY` snap with a FPI downcast:

```typescript
import { downCast } from './math/TerrainRaycast';

// In handleGravity(dt):
const speed = Math.abs(this.velocity.y);
if (speed > 5) {
  const predictedY = downCast(px, py, pz, speed);
  if (predictedY > this.position.y - speed * dt - 0.5) {
    this.position.y = predictedY + PLAYER_HALF_HEIGHT;
    this.velocity.y = 0;
    this.onGround = true;
  }
}
```

### Slope Limit via SDF Gradient
```typescript
// Compute local terrain slope and limit lateral movement on cliffs
const eps = 0.4;
const hL  = GroundSampler.getHeight(px - eps, pz);
const hR  = GroundSampler.getHeight(px + eps, pz);
const hF  = GroundSampler.getHeight(px, pz - eps);
const hB  = GroundSampler.getHeight(px, pz + eps);
const slopeX = (hR - hL) / (2 * eps);
const slopeZ = (hB - hF) / (2 * eps);
const slope  = Math.sqrt(slopeX*slopeX + slopeZ*slopeZ);
const maxSlope = 1.4; // ~55 degrees
if (slope > maxSlope && !this.onGround) { /* block lateral input */ }
```

---

## Files to Create / Edit
| File | Action |
|------|--------|
| `src/game/math/TerrainRaycast.ts` | Create — FPI heightfield raycaster |
| `src/game/PlayerController.ts` | Edit — use `downCast` for fast-fall |
| `src/game/ai/NPCBrain.ts` | Use `hasLOS` for vision queries |
| `src/game/world/BiomeTerrainMaterial.ts` | Use `estimateNormal` for tundra bump |

---

## Performance Budget
| Function | Cost per call | Max calls/frame |
|----------|--------------|-----------------|
| `terrainRaycast` | ~0.01 ms | 64 (NPCs) |
| `downCast` | ~0.003 ms | 1 (player) |
| `hasLOS` | ~0.015 ms | 32 (nearby NPCs) |

Keep LOS checks behind a 200ms timer per NPC — no need to check every frame.
