/**
 * PhysicsWorld — thin wrapper around a single Rapier `World`.
 *
 * Why this exists:
 *   The arpg-game has historically used `three-mesh-bvh` raycasts plus a
 *   hand-rolled kinematic capsule controller for the player. That approach
 *   can't tell the player from a tree from the ground — every contact is a
 *   ray hit, every "stand on" decision is a heuristic. Rapier gives us
 *   actual rigid bodies, colliders, and a `KinematicCharacterController`
 *   that handles slopes, step-up, snap-to-ground and "what am I touching"
 *   in one place.
 *
 * Scope:
 *   - Player capsule = kinematic position-based body (see CapsuleBody.ts).
 *   - Map = static trimesh colliders (MapColliders.ts).
 *   - Streamed terrain = heightfields (ChunkColliders.ts).
 *   - NPCs / projectiles / doors still use BVH gameplay paths.
 *
 * Singleton init:
 *   `@dimforge/rapier3d-compat` ships its WASM as a base64 blob and must
 *   be `await`ed once via `RAPIER.init()` before any class on the module
 *   can be constructed. We expose `initPhysics()` which is idempotent —
 *   safe to call from GameEngine boot or any test setup.
 */
import RAPIER from '@dimforge/rapier3d-compat';

let _initialized = false;
let _initPromise: Promise<void> | null = null;

/**
 * Resolve once Rapier's WASM blob has been instantiated.
 *
 * Idempotent: subsequent calls return the same in-flight promise (or
 * resolve immediately once init has completed).
 */
export async function initPhysics(): Promise<typeof RAPIER> {
  if (_initialized) return RAPIER;
  if (!_initPromise) {
    _initPromise = RAPIER.init().then(() => {
      _initialized = true;
    });
  }
  await _initPromise;
  return RAPIER;
}

export class PhysicsWorld {
  /**
   * Action-game gravity (m/s²). Stronger than Earth 9.81 so jumps feel
   * snappy; matches PlayerController legacy GRAVITY and engine manifest.
   */
  static readonly GRAVITY_Y = -22;

  /**
   * Fixed simulation step. Rapier docs recommend fixed dt — the engine
   * accumulates real time and substeps when a frame exceeds this.
   */
  static readonly STEP_DT = 1 / 60;

  /** Max substeps per call — prevents spiral-of-death after long pauses. */
  static readonly MAX_SUBSTEPS = 4;

  world: RAPIER.World;
  readonly RAPIER: typeof RAPIER;
  /** Accumulator for the fixed-timestep stepper. */
  private _accumulator = 0;
  /** Guard so dispose() is safe to call repeatedly. */
  private _disposed = false;

  constructor(gravityY: number = PhysicsWorld.GRAVITY_Y) {
    if (!_initialized) {
      throw new Error(
        '[PhysicsWorld] RAPIER not initialised. await initPhysics() before constructing.',
      );
    }
    this.RAPIER = RAPIER;
    this.world = new RAPIER.World({ x: 0, y: gravityY, z: 0 });
  }

  /**
   * Advance the simulation by `dt` real seconds.
   * Uses a fixed-step accumulator so behaviour is deterministic regardless
   * of frame rate. Caps catch-up to MAX_SUBSTEPS (~67 ms).
   */
  step(dt: number): void {
    if (this._disposed) return;
    const capped = Math.min(dt, PhysicsWorld.STEP_DT * PhysicsWorld.MAX_SUBSTEPS);
    this._accumulator += capped;
    let safety = PhysicsWorld.MAX_SUBSTEPS + 2;
    while (this._accumulator >= PhysicsWorld.STEP_DT && safety-- > 0) {
      this.world.step();
      this._accumulator -= PhysicsWorld.STEP_DT;
    }
  }

  /** Create a kinematic position-based rigid body at world metres. */
  createKinematicBody(x: number, y: number, z: number): RAPIER.RigidBody {
    const desc = this.RAPIER.RigidBodyDesc.kinematicPositionBased()
      .setTranslation(x, y, z);
    return this.world.createRigidBody(desc);
  }

  /** Create a static rigid body (map props, buildings). */
  createStaticBody(x: number, y: number, z: number): RAPIER.RigidBody {
    const desc = this.RAPIER.RigidBodyDesc.fixed().setTranslation(x, y, z);
    return this.world.createRigidBody(desc);
  }

  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
    this.world.free();
    // Null so accidental post-dispose access throws a clear TypeError.
    this.world = null as unknown as RAPIER.World;
  }
}
