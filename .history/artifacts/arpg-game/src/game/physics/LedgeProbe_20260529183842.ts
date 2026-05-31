/**
 * LedgeProbe — Rapier raycast helper that classifies the geometry ahead of
 * the player as "mantleable ledge" or "not".
 *
 * Strategy (matches the heuristic used by most third-person action games):
 *   1. Forward ray at chest height looking for a near-vertical wall close
 *      enough to grab.
 *   2. Downward ray from above the apparent top of that wall, landing on
 *      the actual surface the player will stand on.
 *   3. Upward clearance ray so we don't try to mantle into an overhang or
 *      a low ceiling (e.g. under a balcony).
 *
 * Returns null when any of the three checks fails. Callers (the
 * LedgeClimbController) treat null as "ordinary jump should fire instead".
 *
 * Performance: three short raycasts per call. Only invoked when the player
 * presses Space, never per-frame, so the cost is negligible.
 */
import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import type { PhysicsWorld } from './PhysicsWorld';

export interface LedgeHit {
  /** World-space top surface point the capsule will stand on. */
  topPoint: THREE.Vector3;
  /** Outward-facing wall normal projected onto the XZ plane. */
  wallNormal: THREE.Vector3;
  /** Vertical rise from current feet to the ledge surface (metres). */
  rise: number;
}

/** Horizontal reach from the front of the capsule to the wall surface. */
const MAX_FWD_REACH = 0.45;
/** Capsule radius — keep in sync with PlayerController. */
const CAPSULE_RADIUS = 0.4;
/** Minimum rise we treat as a "ledge". Below this Rapier autostep handles it. */
const MIN_RISE = 0.55;
/** Maximum rise the 1 m clip can convincingly cover. */
const MAX_RISE = 1.55;
/** Height above the player's feet to start the top-surface probe. */
const TOP_PROBE_START_OFFSET = 2.2;
/** How far down the top probe casts before giving up. */
const TOP_PROBE_DEPTH = 2.4;
/** Required clear headroom above the destination surface. */
const CLEARANCE_HEIGHT = 1.7;
/** Push the top-down probe this far past the wall surface so it lands on
 *  the top, not the front face. */
const SURFACE_BIAS = 0.25;

export function probeLedge(
  physics: PhysicsWorld,
  feetPos: THREE.Vector3,
  forward: THREE.Vector3,
  excludeBody: RAPIER.RigidBody | null,
): LedgeHit | null {
  const R = physics.RAPIER;
  const world = physics.world;

  // Normalise the forward direction on the XZ plane. A nearly-vertical
  // forward (looking straight up/down) means there's no meaningful "ahead"
  // and we shouldn't probe.
  const fx = forward.x;
  const fz = forward.z;
  const fLen = Math.hypot(fx, fz);
  if (fLen < 0.05) return null;
  const fwdX = fx / fLen;
  const fwdZ = fz / fLen;

  // 1. Forward ray from chest height. Start just outside the capsule so
  //    we don't hit our own collider's interior on solid=true.
  const startX = feetPos.x + fwdX * CAPSULE_RADIUS;
  const startZ = feetPos.z + fwdZ * CAPSULE_RADIUS;
  const fwdRay = new R.Ray(
    { x: startX, y: feetPos.y + 1.0, z: startZ },
    { x: fwdX,    y: 0,             z: fwdZ },
  );
  const fwdHit = world.castRayAndGetNormal(
    fwdRay,
    MAX_FWD_REACH,
    true,
    undefined,
    undefined,
    undefined,
    excludeBody ?? undefined,
  );
  if (!fwdHit) return null;

  // Reject sloped surfaces — a hill or ramp shouldn't trigger a mantle,
  // only an actual wall. |normal.y| > 0.4 means more than ~24° off
  // vertical (i.e. lying down).
  if (Math.abs(fwdHit.normal.y) > 0.4) return null;

  // 2. Down ray. Land on the ledge top by probing slightly past the wall
  //    surface in the forward direction.
  const reach = fwdHit.timeOfImpact ?? (fwdHit as { toi?: number }).toi ?? 0;
  const topX = startX + fwdX * (reach + SURFACE_BIAS);
  const topZ = startZ + fwdZ * (reach + SURFACE_BIAS);
  const downRay = new R.Ray(
    { x: topX, y: feetPos.y + TOP_PROBE_START_OFFSET, z: topZ },
    { x: 0,    y: -1,                                 z: 0    },
  );
  const topHit = world.castRayAndGetNormal(
    downRay,
    TOP_PROBE_DEPTH,
    true,
    undefined,
    undefined,
    undefined,
    excludeBody ?? undefined,
  );
  if (!topHit) return null;

  // The destination surface must be walkable (≈ flat upward normal).
  if (topHit.normal.y < 0.7) return null;

  const topToi = topHit.timeOfImpact ?? (topHit as { toi?: number }).toi ?? 0;
  const topY = feetPos.y + TOP_PROBE_START_OFFSET - topToi;
  const rise = topY - feetPos.y;
  if (rise < MIN_RISE || rise > MAX_RISE) return null;

  // 3. Headroom — make sure the player fits above the destination
  //    surface. Use a hair of bias so we don't immediately re-hit the
  //    surface we just landed on.
  const ceilRay = new R.Ray(
    { x: topX, y: topY + 0.05, z: topZ },
    { x: 0,    y: 1,           z: 0    },
  );
  const ceilHit = world.castRay(
    ceilRay,
    CLEARANCE_HEIGHT,
    true,
    undefined,
    undefined,
    undefined,
    excludeBody ?? undefined,
  );
  if (ceilHit) return null;

  return {
    topPoint: new THREE.Vector3(topX, topY, topZ),
    wallNormal: new THREE.Vector3(fwdHit.normal.x, 0, fwdHit.normal.z).normalize(),
    rise,
  };
}
