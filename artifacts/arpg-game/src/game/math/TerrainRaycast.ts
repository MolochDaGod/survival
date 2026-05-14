/**
 * TerrainRaycast — Fixed-Point-Iteration sphere-trace against the heightfield.
 *
 * Adapted from the raymarching analysis at https://www.shadertoy.com/view/ldsGWl
 * (see .agents/skills/raymarching-math/SKILL.md for full derivation).
 *
 * Used by:
 *  • PlayerController  — no-tunnel downcast when |vy| > 5 m/s
 *  • NPCBrain          — line-of-sight queries
 *  • AbilitySystem     — projectile arc collision
 */

import { groundY } from '../GroundSampler';

const MAX_STEPS    = 64;
const STEP_MULT    = 0.65;   // conservative overstep guard (< 1 = safe)
const HIT_EPS      = 0.025;  // metres — hit threshold
const FPI_CONV_EPS = 0.18;   // FPI convergence detection

// ─── Core raycast ─────────────────────────────────────────────────────────────

/**
 * March a ray against the terrain heightfield using FPI-termination sphere
 * tracing.  Returns hit distance, or `Infinity` if no surface within tMax.
 *
 * @param ox,oy,oz  Ray origin (world space)
 * @param dx,dy,dz  Ray direction — **must be a unit vector**
 * @param tMin      Start distance along ray (default 0.1)
 * @param tMax      Max distance to search   (default 80)
 */
export function terrainRaycast(
  ox: number, oy: number, oz: number,
  dx: number, dy: number, dz: number,
  tMin = 0.1,
  tMax = 80,
): number {
  let t    = tMin;
  let last = tMin - 999;   // seed far from t so loop always starts

  for (let i = 0; i < MAX_STEPS; i++) {
    const px = ox + dx * t;
    const pz = oz + dz * t;
    const py = oy + dy * t;

    const surf = groundY(px, pz);
    const d    = py - surf;       // positive = above surface

    // FPI convergence: the iteration stopped changing — past or on surface
    if (Math.abs(last - t) < FPI_CONV_EPS && d < 0.5) break;

    if (d < HIT_EPS) return t;   // hit

    last = t;
    // Adaptive step: near the surface take smaller steps; far, take bigger
    const step = Math.min(Math.max(d, 0.05) * STEP_MULT + t * 0.0015, 6.0);
    t += step;

    if (t > tMax) break;
  }
  return Infinity;
}

// ─── Fast downward cast ────────────────────────────────────────────────────────

/**
 * Predictive downward cast for fast-falling characters.
 * Subdivides the fall arc into `steps` intervals to catch thin surfaces.
 * Returns the predicted ground Y, or the static `groundY` fallback.
 */
export function downCast(
  ox: number, oy: number, oz: number,
  fallSpeed: number,
  dt = 0.016,
): number {
  const distance   = Math.abs(fallSpeed) * dt + 0.5;
  const numSamples = Math.max(3, Math.min(12, Math.ceil(fallSpeed * 0.06)));
  const step       = distance / numSamples;

  for (let i = 0; i <= numSamples; i++) {
    const sampleY = oy - i * step;
    const surf    = groundY(ox, oz);
    if (sampleY <= surf) {
      return surf;
    }
  }
  return groundY(ox, oz);
}

// ─── Line-of-sight query ──────────────────────────────────────────────────────

/**
 * Returns `true` if the terrain does not block the line from A to B.
 * Both positions should be at eye height (add ~1.7m to ground Y).
 *
 * Designed to be cheap: called on a 200 ms timer per NPC, not every frame.
 */
export function hasLOS(
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
): boolean {
  const dx   = bx - ax;
  const dy   = by - ay;
  const dz   = bz - az;
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (dist < 0.5) return true;

  const invD = 1.0 / dist;
  const hitT = terrainRaycast(
    ax, ay, az,
    dx * invD, dy * invD, dz * invD,
    0.4, dist - 0.4,
  );
  return hitT === Infinity;
}

// ─── Slope query ─────────────────────────────────────────────────────────────

/**
 * Returns the terrain slope magnitude at (x, z).
 * Used to block lateral movement on cliff faces.
 *
 * ~55° max walkable ≈ gradient 1.4
 */
export function terrainSlope(x: number, z: number, eps = 0.4): number {
  const hL = groundY(x - eps, z);
  const hR = groundY(x + eps, z);
  const hF = groundY(x, z - eps);
  const hB = groundY(x, z + eps);
  const sx  = (hR - hL) / (2 * eps);
  const sz  = (hB - hF) / (2 * eps);
  return Math.sqrt(sx * sx + sz * sz);
}
