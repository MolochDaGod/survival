/**
 * LedgeClimbController — drives the player through a scripted mantle when
 * the LedgeProbe finds a ~1 m surface to climb onto.
 *
 * Design:
 *   The animation system already loads `ClimbUp_1m_RM` (Quaternius UAL2)
 *   and supports root-motion extraction. We deliberately do NOT depend on
 *   that extraction here — most exporters bake X/Z root delta but only a
 *   subset bake Y reliably, and a mantle is a primarily-vertical move.
 *
 *   Instead we drive `position` directly with a two-phase cubic-ease lerp
 *   (Y leads XZ so the capsule rises before sliding forward, avoiding
 *   front-face clipping) and write the same translation into the
 *   kinematic Rapier body each frame. The clip plays for visuals only.
 *
 *   While `isActive` is true the PlayerController short-circuits
 *   `handleMovement` and `handleGravity`, so input and gravity cannot
 *   fight the lerp.
 */
import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import type { PhysicsWorld } from './physics/PhysicsWorld';
import { probeLedge, LedgeHit } from './physics/LedgeProbe';

/** Total mantle wall-clock duration. Tuned to feel snappy without
 *  outrunning the visual clip (~0.95 s playback). */
const MANTLE_DURATION = 0.95;
/** Final standing position is set this far past the ledge edge so the
 *  capsule isn't balanced precariously on the lip. */
const STAND_INSET = 0.32;
/** Mirror of PlayerController constants — kept local so we don't
 *  introduce a circular import. Adjust here if those change. */
const PLAYER_HEIGHT = 1.8;
const CAPSULE_HALF_HEIGHT = 0.5;
const CAPSULE_RADIUS = 0.4;

type PlayClip = (clipName: string, duration: number) => void;

export class LedgeClimbController {
  private readonly physics: PhysicsWorld;
  private readonly body: RAPIER.RigidBody;
  private readonly playClip: PlayClip;

  private _active = false;
  private _elapsed = 0;
  private readonly _start = new THREE.Vector3();
  private readonly _end = new THREE.Vector3();

  constructor(physics: PhysicsWorld, body: RAPIER.RigidBody, playClip: PlayClip) {
    this.physics = physics;
    this.body = body;
    this.playClip = playClip;
  }

  /** True while a mantle is in progress — PlayerController should skip
   *  its normal movement / gravity steps while this returns true. */
  get isActive(): boolean { return this._active; }

  /**
   * Attempt to begin a mantle from `feetPos` looking along `forward`.
   * Returns true if a ledge was found and the climb has started, in which
   * case the caller MUST stop processing its normal jump for this frame.
   */
  tryStart(feetPos: THREE.Vector3, forward: THREE.Vector3): boolean {
    if (this._active) return false;
    const hit = probeLedge(this.physics, feetPos, forward, this.body);
    if (!hit) return false;
    this._begin(feetPos, hit);
    return true;
  }

  private _begin(feetPos: THREE.Vector3, hit: LedgeHit): void {
    this._active = true;
    this._elapsed = 0;

    // Convert feet-anchored start position into capsule-centre space —
    // that's what the Rapier body actually carries, and what update()
    // will write back via setNextKinematicTranslation.
    const startCentreY =
      feetPos.y + CAPSULE_HALF_HEIGHT + CAPSULE_RADIUS - PLAYER_HEIGHT;
    this._start.set(feetPos.x, startCentreY, feetPos.z);

    // End position is the ledge top point pushed inward (away from the
    // wall) by STAND_INSET. Inward direction is the opposite of the
    // wall's outward normal.
    const endFeetY = hit.topPoint.y;
    const endCentreY =
      endFeetY + CAPSULE_HALF_HEIGHT + CAPSULE_RADIUS - PLAYER_HEIGHT;
    const inX = -hit.wallNormal.x * STAND_INSET;
    const inZ = -hit.wallNormal.z * STAND_INSET;
    this._end.set(hit.topPoint.x + inX, endCentreY, hit.topPoint.z + inZ);

    // Fire the visual. Locomotion will own this one-shot clip on its
    // additive layer — no fade fight with idle/walk because the player
    // can't move horizontally while we're active.
    this.playClip('ClimbUp_1m_RM', MANTLE_DURATION);
  }

  /**
   * Advance the mantle by `dt`. Writes the new feet-anchored position
   * into `outPos` and updates the kinematic body. Returns true while the
   * climb is still in progress so the caller can short-circuit its
   * normal movement/gravity step.
   */
  update(dt: number, outPos: THREE.Vector3): boolean {
    if (!this._active) return false;
    this._elapsed += dt;
    const t = Math.min(1, this._elapsed / MANTLE_DURATION);

    // Y leads XZ: rise first, then slide forward onto the surface.
    // Clipping against the wall front face would happen if XZ ran
    // ahead of Y, so we offset their ease curves.
    const tY = easeCubicOut(Math.min(1, t * 1.45));
    const tXZ = easeCubicOut(Math.max(0, t * 1.25 - 0.25));

    const cx = THREE.MathUtils.lerp(this._start.x, this._end.x, tXZ);
    const cy = THREE.MathUtils.lerp(this._start.y, this._end.y, tY);
    const cz = THREE.MathUtils.lerp(this._start.z, this._end.z, tXZ);

    this.body.setNextKinematicTranslation({ x: cx, y: cy, z: cz });

    // PlayerController stores position as feet + PLAYER_HEIGHT (its
    // historical "logical reference"). Reconstruct that from the
    // capsule centre we just wrote.
    const feetY = cy - (CAPSULE_HALF_HEIGHT + CAPSULE_RADIUS);
    outPos.set(cx, feetY + PLAYER_HEIGHT, cz);

    if (t >= 1) this._active = false;
    return true;
  }

  /** Abort an in-progress mantle (called on teleport, death, dispose). */
  cancel(): void { this._active = false; }
}

function easeCubicOut(t: number): number {
  const u = 1 - t;
  return 1 - u * u * u;
}
