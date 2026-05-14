import * as THREE from 'three';
import { sampleTerrainHeight } from './TerrainBuilder';
import { MASK_GROUND } from './Layers';

/**
 * Single source of truth for "what Y is the ground at world (x, z)?".
 *
 * Two strategies, in priority order:
 *  1. BVH-accelerated downward raycast against meshes tagged LAYERS.WORLD
 *     (terrain chunks + arena floor). This is the *visual* surface — the
 *     same triangles the player can see — so anchoring units to it
 *     guarantees no floating or sinking, even at chunk seams or where
 *     vertex shading interpolates differently from the analytic noise.
 *  2. Analytic fallback (`sampleTerrainHeight`). Used while the first
 *     terrain chunk is still loading, or for queries far outside the
 *     loaded radius.
 *
 * The raycaster is configured `firstHitOnly = true` so the BVH stops at
 * the first triangle, turning per-frame ground queries into O(log n).
 *
 * Usage: call `setScene(scene)` once after the game scene is built; then
 * every system (player, enemies, props) calls `groundY(x, z)` instead of
 * its own ad-hoc terrain math.
 */

// Shoot the probe ray from this height above the world. Must be taller
// than the highest terrain bump or BVH peak we'll ever query against.
const RAY_START_Y = 1000;
// Far enough below so a missed ray genuinely registers as "no surface".
const RAY_LENGTH = 2000;

let scene: THREE.Scene | null = null;
const raycaster = new THREE.Raycaster();
// Strictly walkable ground only. Trees/walls/rocks render on WORLD for
// camera occlusion, but if we sampled them too then standing under a
// tree would snap the player onto the canopy.
raycaster.layers.mask = MASK_GROUND;
// three-mesh-bvh fast-path — patched onto the prototype in BVHRaycast.ts.
(raycaster as unknown as { firstHitOnly: boolean }).firstHitOnly = true;
raycaster.far = RAY_LENGTH;

const _origin = new THREE.Vector3();
const DOWN = new THREE.Vector3(0, -1, 0);

export function setGroundScene(s: THREE.Scene) {
  scene = s;
}

/**
 * Sample the ground height at world (x, z).
 *
 * Returns the Y coordinate of the highest WORLD-layer surface beneath the
 * point. Falls back to the analytic terrain height when no scene is set
 * or no surface is found.
 */
export function groundY(x: number, z: number): number {
  if (!scene) return sampleTerrainHeight(x, z);

  _origin.set(x, RAY_START_Y, z);
  raycaster.set(_origin, DOWN);
  // Walk children once — root has no geometry of its own. `recursive=true`
  // descends into each chunk + prop. Layer mask filters to WORLD only.
  const hits = raycaster.intersectObjects(scene.children, true);
  if (hits.length > 0) return hits[0].point.y;

  return sampleTerrainHeight(x, z);
}
