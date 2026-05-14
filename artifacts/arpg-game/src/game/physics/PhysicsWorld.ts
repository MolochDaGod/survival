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
 * Scope (this pass):
 *   - Player capsule = kinematic position-based body.
 *   - Map = static trimesh colliders (see MapColliders.ts).
 *   - Everything else (NPCs, projectiles, doors, building snap, loot)
 *     keeps using the existing BVH paths. The player is the only thing
 *     that moves through Rapier today.
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
  /** Earth-like gravity in m/s². Matches the legacy `GRAVITY = 22` constant
   * we used in the ad-hoc capsule, slightly stronger than 9.81 because
   * it feels better for action games. */
  static readonly GRAVITY_Y = -22;

  /** Fixed simulation step. Rapier's docs strongly recommend a fixed
   * timestep — the engine integrates with substeps when frame `dt`
   * exceeds this. */
  static readonly STEP_DT = 1 / 60;

  world: RAPIER.World;
  readonly RAPIER: typeof RAPIER;
  /** Accumulator for the fixed-timestep stepper. */
  private _accumulator = 0;
  /** Guard so dispose() is safe to call repeatedly — Rapier's `World.free()`
   * is a one-shot WASM destructor and faulting on a freed pointer takes the
   * whole tab down. */
  private _disposed = false;

  constructor() {
    if (!_initialized) {
      throw new Error(
        '[PhysicsWorld] RAPIER not initialised. await initPhysics() before constructing.',
      );
    }
    this.RAPIER = RAPIER;
    this.world = new RAPIER.World({ x: 0, y: PhysicsWorld.GRAVITY_Y, z: 0 });
  }

  /**
   * Advance the simulation by `dt` real seconds, capped to avoid the
   * spiral-of-death after long pauses (alt-tab, debugger break).
   * Uses a fixed-step accumulator so behaviour is deterministic regardless
   * of frame rate.
   */
  step(dt: number): void {
    // Cap the per-call dt at 4 fixed steps' worth (~67 ms). If we've been
    // paused longer than that we just drop the deficit — better than
    // running the world forward 200 sub-steps and freezing the main thread.
    const capped = Math.min(dt, PhysicsWorld.STEP_DT * 4);
    this._accumulator += capped;
    let safety = 8;
    while (this._accumulator >= PhysicsWorld.STEP_DT && safety-- > 0) {
      this.world.step();
      this._accumulator -= PhysicsWorld.STEP_DT;
    }
  }

  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
    this.world.free();
    // Null the reference so any accidental post-dispose access throws a
    // clear TypeError rather than calling into freed WASM memory.
    this.world = null as unknown as RAPIER.World;
  }
}
