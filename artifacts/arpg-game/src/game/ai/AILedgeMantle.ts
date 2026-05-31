/**
 * AILedgeMantle — scripted ledge climb for AI enemies.
 *
 * Why this exists:
 *   The player ledge system uses Rapier raycasts, but enemies don't have
 *   Rapier bodies — they're YUKA vehicles pinned to the visual ground via
 *   GroundSampler. When the player jumps onto a 1 m ledge, the enemy
 *   YUKA path bends straight into the wall and the vehicle velocity
 *   collapses while the brain still wants to chase. Without help the
 *   enemy just buzzes the wall forever.
 *
 *   This module detects that stuck-against-a-rise condition and runs a
 *   short scripted lerp that lifts the enemy onto the ledge top. While
 *   active the enemy's vehicle is parked (maxSpeed=0) and EnemyManager
 *   short-circuits ground-snap, separation, knockback, and the normal
 *   walk/idle crossfade so they don't fight the climb.
 *
 *   Detection uses GroundSampler — no extra raycasts per frame. A WeakMap
 *   keyed by Enemy carries the small amount of per-enemy state, so we
 *   don't have to widen the Enemy interface.
 */
import * as THREE from 'three';
import * as YUKA from 'yuka';
import { Enemy } from '../types';
import { groundY as groundFloor } from '../GroundSampler';

/** Minimum rise we treat as "ledge". Below this the brain can route
 *  around or YUKA's own speed integration carries it up the slope. */
const MIN_RISE = 0.55;
/** Maximum rise the 1 m climb clip can convincingly cover. */
const MAX_RISE = 1.55;
/** Horizontal sample distance for the forward-ground probe. */
const PROBE_AHEAD = 1.1;
/** Climb wall-clock duration. Slightly faster than the player mantle so
 *  enemies can re-engage quickly after closing distance. */
const MANTLE_DURATION = 0.85;
/** Squared velocity below which we consider the vehicle "stuck". */
const STUCK_VEL_SQ = 0.45 * 0.45;
/** How long the vehicle must be stuck before we try to mantle. */
const STUCK_TIME = 0.4;
/** Recovery window after a mantle before we allow another one. */
const POST_MANTLE_COOLDOWN = 0.6;

interface MantleState {
  startX: number; startZ: number; startY: number;
  endX:   number; endZ:   number; endY:   number;
  elapsed: number;
  prevMaxSpeed: number;
}

interface ClimbBook {
  stuckTimer: number;
  cooldown: number;
  mantle: MantleState | null;
}

const book = new WeakMap<Enemy, ClimbBook>();

function bookOf(enemy: Enemy): ClimbBook {
  let b = book.get(enemy);
  if (!b) {
    b = { stuckTimer: 0, cooldown: 0, mantle: null };
    book.set(enemy, b);
  }
  return b;
}

/** True while this enemy is mid-climb — callers should skip normal
 *  position sync, separation, knockback, and anim state writes. */
export function aiMantleIsActive(enemy: Enemy): boolean {
  return book.get(enemy)?.mantle != null;
}

/**
 * Step the climb state for one enemy. Returns true if the enemy is
 * currently mantling and the caller should bypass its normal updates.
 */
export function tickAIMantle(
  enemy: Enemy,
  vehicle: YUKA.Vehicle,
  playerPos: THREE.Vector3,
  isPursuing: boolean,
  dt: number,
): boolean {
  const b = bookOf(enemy);

  // Advance an in-flight mantle.
  if (b.mantle) {
    const m = b.mantle;
    m.elapsed += dt;
    const t = Math.min(1, m.elapsed / MANTLE_DURATION);
    // Y leads XZ so the enemy clears the wall front before sliding in.
    const tY  = easeOutCubic(Math.min(1, t * 1.45));
    const tXZ = easeOutCubic(Math.max(0, t * 1.25 - 0.25));
    const x = THREE.MathUtils.lerp(m.startX, m.endX, tXZ);
    const z = THREE.MathUtils.lerp(m.startZ, m.endZ, tXZ);
    const y = THREE.MathUtils.lerp(m.startY, m.endY, tY);
    enemy.mesh.position.set(x, y, z);
    vehicle.position.set(x, y, z);
    vehicle.velocity.set(0, 0, 0);
    if (t >= 1) {
      vehicle.maxSpeed = m.prevMaxSpeed;
      b.mantle = null;
      b.cooldown = POST_MANTLE_COOLDOWN;
    }
    return true;
  }

  if (b.cooldown > 0) b.cooldown = Math.max(0, b.cooldown - dt);
  if (!isPursuing) { b.stuckTimer = 0; return false; }
  if (b.cooldown > 0) return false;

  // Build up "stuck" time. Velocity is the YUKA-integrated value, so it
  // naturally collapses when the enemy is pushed against a wall.
  const vx = vehicle.velocity.x;
  const vz = vehicle.velocity.z;
  if (vx * vx + vz * vz > STUCK_VEL_SQ) { b.stuckTimer = 0; return false; }
  b.stuckTimer += dt;
  if (b.stuckTimer < STUCK_TIME) return false;

  // Probe the ground ahead toward the player — if it sits MIN_RISE..MAX_RISE
  // above current footing, we treat it as a mantle-able ledge.
  const dx = playerPos.x - enemy.mesh.position.x;
  const dz = playerPos.z - enemy.mesh.position.z;
  const horizLen = Math.hypot(dx, dz);
  if (horizLen < 0.001) return false;
  const fx = dx / horizLen, fz = dz / horizLen;
  const ax = enemy.mesh.position.x + fx * PROBE_AHEAD;
  const az = enemy.mesh.position.z + fz * PROBE_AHEAD;
  const currentY = enemy.mesh.position.y;
  const topY = groundFloor(ax, az);
  const rise = topY - currentY;
  if (rise < MIN_RISE || rise > MAX_RISE) { b.stuckTimer = 0; return false; }

  b.mantle = {
    startX: enemy.mesh.position.x, startZ: enemy.mesh.position.z, startY: currentY,
    endX:   ax,                    endZ:   az,                    endY:   topY,
    elapsed: 0,
    prevMaxSpeed: vehicle.maxSpeed,
  };
  b.stuckTimer = 0;
  vehicle.maxSpeed = 0;
  vehicle.velocity.set(0, 0, 0);
  playClimbClipIfAvailable(enemy);
  return true;
}

/** Drop bookkeeping when an enemy is removed from the world. */
export function clearAIMantle(enemy: Enemy): void {
  book.delete(enemy);
}

function playClimbClipIfAvailable(enemy: Enemy): void {
  const ud = enemy.mesh.userData as {
    mixer?: THREE.AnimationMixer;
    animations?: THREE.AnimationClip[];
    currentClip?: THREE.AnimationAction | null;
  };
  if (!ud.mixer || !ud.animations) return;
  const clip = ud.animations.find(a => /climb/i.test(a.name)) ?? null;
  if (!clip) return;
  const action = ud.mixer.clipAction(clip);
  action.reset();
  action.setLoop(THREE.LoopOnce, 1);
  action.clampWhenFinished = true;
  action.setEffectiveWeight(1);
  action.play();
  const prev = ud.currentClip;
  if (prev && prev !== action) prev.crossFadeTo(action, 0.12, false);
  ud.currentClip = action;
}

function easeOutCubic(t: number): number {
  const u = 1 - t;
  return 1 - u * u * u;
}
