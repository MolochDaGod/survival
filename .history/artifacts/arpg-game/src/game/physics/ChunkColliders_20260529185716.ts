/**
 * ChunkColliders — Rapier static colliders for streamed terrain chunks.
 *
 * Why this exists:
 *   The procedural world (WorldChunkManager) ships only visual meshes —
 *   the player's kinematic capsule had nothing to stand on, which let the
 *   capsule freefall whenever the player wandered outside the starter
 *   map's baked trimesh. The kill-plane recovery hid the symptom but it
 *   ate CPU and reset the player every few seconds.
 *
 *   A heightfield is the cheapest correct collider for grid terrain
 *   (Rapier stores it as a single 2D array — no per-triangle bookkeeping).
 *   We sample heights from the exact same `worldHeight()` the visual
 *   mesh uses, at the exact same grid resolution, so the collider and
 *   the rendered surface agree to within a float epsilon.
 *
 *   Trees get cheap cuboid colliders attached to one shared static body
 *   per chunk so the broad-phase only has to track O(chunks) extra nodes.
 */
import type RAPIER from '@dimforge/rapier3d-compat';
import type { PhysicsWorld } from './PhysicsWorld';

export interface ChunkColliderHandle {
  dispose: () => void;
}

/**
 * Attach a Rapier heightfield collider to a chunk.
 *
 * @param physics     Active physics world.
 * @param baseX/baseZ World-space centre of the chunk.
 * @param size        Side length of the chunk in metres.
 * @param segments    Quad segments per side. Heightfield grid is (segments+1)².
 * @param sampleY     Sampler returning the surface Y at world (x, z). Must be
 *                    the same function the visual mesh uses to guarantee
 *                    collider and render geometry stay in sync.
 */
export function attachChunkHeightfield(
  physics: PhysicsWorld,
  baseX: number,
  baseZ: number,
  size: number,
  segments: number,
  sampleY: (x: number, z: number) => number,
): ChunkColliderHandle {
  const RAPIER = physics.RAPIER;
  const world = physics.world;

  // Rapier heightfield grid:
  //   - `(nrows + 1) × (ncols + 1)` height values, COLUMN-major.
  //   - `i ∈ [0, nrows]` → local x ∈ [-scale.x/2, +scale.x/2].
  //   - `j ∈ [0, ncols]` → local z ∈ [-scale.z/2, +scale.z/2].
  //   - heights[j * (nrows + 1) + i] is the Y at (i, j).
  const nrows = segments;
  const ncols = segments;
  const stride = nrows + 1;
  const heights = new Float32Array((nrows + 1) * (ncols + 1));
  const step = size / segments;
  for (let j = 0; j <= ncols; j++) {
    const wz = baseZ + (j / ncols - 0.5) * size;
    for (let i = 0; i <= nrows; i++) {
      const wx = baseX + (i / nrows - 0.5) * size;
      heights[j * stride + i] = sampleY(wx, wz);
    }
    // Per-frame allocations are forbidden in the hot path; this only runs
    // on chunk-load, which is already off the simulate-step.
    if ((j & 7) === 0) yieldHint();
  }

  const bodyDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(baseX, 0, baseZ);
  const body = world.createRigidBody(bodyDesc);
  const desc = RAPIER.ColliderDesc.heightfield(
    nrows,
    ncols,
    heights,
    { x: size, y: 1, z: size },
  );
  world.createCollider(desc, body);

  let disposed = false;
  return {
    dispose: () => {
      if (disposed) return;
      disposed = true;
      try { world.removeRigidBody(body); } catch { /* already gone */ }
    },
  };
}

/**
 * Attach an upright cuboid collider per tree instance to a single shared
 * static body. One body, N colliders is the cheapest layout for static
 * scenery — the broad-phase only tracks a single AABB per chunk.
 *
 * @param trunks  Array of `(x, y, z, halfHeight, halfWidth)` per trunk. `y`
 *                is the centre of the cuboid (i.e. ground + halfHeight).
 */
export function attachChunkTrunks(
  physics: PhysicsWorld,
  trunks: ReadonlyArray<{ x: number; y: number; z: number; halfHeight: number; halfWidth: number }>,
): ChunkColliderHandle | null {
  if (trunks.length === 0) return null;
  const RAPIER = physics.RAPIER;
  const world = physics.world;

  const bodyDesc = RAPIER.RigidBodyDesc.fixed();
  const body = world.createRigidBody(bodyDesc);
  for (const t of trunks) {
    const desc = RAPIER.ColliderDesc.cuboid(t.halfWidth, t.halfHeight, t.halfWidth)
      .setTranslation(t.x, t.y, t.z);
    world.createCollider(desc, body);
  }

  let disposed = false;
  return {
    dispose: () => {
      if (disposed) return;
      disposed = true;
      try { world.removeRigidBody(body); } catch { /* already gone */ }
    },
  };
}

/**
 * Attach a thin cylinder ground plate for a flat arena disk. Used by the
 * procedural starter-zone arena (TerrainBuilder.buildArena) so the player
 * has solid footing inside the spawn ring even before the surrounding
 * terrain chunks finish streaming in.
 */
export function attachArenaDisk(
  physics: PhysicsWorld,
  centerY: number,
  radius: number,
): ChunkColliderHandle {
  const RAPIER = physics.RAPIER;
  const world = physics.world;
  const bodyDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(0, centerY - 0.5, 0);
  const body = world.createRigidBody(bodyDesc);
  // 1 m thick disk → top surface at centerY, bottom at centerY - 1.
  const desc = RAPIER.ColliderDesc.cylinder(0.5, radius);
  world.createCollider(desc, body);
  let disposed = false;
  return {
    dispose: () => {
      if (disposed) return;
      disposed = true;
      try { world.removeRigidBody(body); } catch { /* already gone */ }
    },
  };
}

/** Tiny no-op — placeholder so future async chunking can plug in without
 *  changing call sites. */
function yieldHint(): void { /* no-op */ }
