/**
 * MathUtils.ts — Shared game-math helpers (metres / radians, pure functions).
 *
 * Prefer these over ad-hoc `1 - Math.exp(-k * dt)` copies so damping feels
 * consistent across camera, locomotion, and rigid-body integration.
 */

// ──────────────────────────────────────────────────────────────────────────────
// Scalar utilities
// ──────────────────────────────────────────────────────────────────────────────

/** Clamp `v` to the closed interval [min, max]. */
export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

/** Linear interpolation from `a` to `b` by unclamped factor `t`. */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Smooth-step (cubic Hermite). `t` is clamped to [0,1]. */
export function smoothstep(edge0: number, edge1: number, t: number): number {
  const x = clamp((t - edge0) / (edge1 - edge0), 0, 1);
  return x * x * (3 - 2 * x);
}

/** Smoother-step (Ken Perlin's quintic variant, 2nd-order smooth). */
export function smootherstep(edge0: number, edge1: number, t: number): number {
  const x = clamp((t - edge0) / (edge1 - edge0), 0, 1);
  return x * x * x * (x * (x * 6 - 15) + 10);
}

/**
 * Remap `v` from range [inLo, inHi] to [outLo, outHi].
 * Does NOT clamp — values outside the input range will be extrapolated.
 */
export function remap(
  v: number,
  inLo: number, inHi: number,
  outLo: number, outHi: number,
): number {
  return outLo + ((v - inLo) / (inHi - inLo)) * (outHi - outLo);
}

/** Remap clamped to the output range. */
export function remapClamped(
  v: number,
  inLo: number, inHi: number,
  outLo: number, outHi: number,
): number {
  return clamp(remap(v, inLo, inHi, outLo, outHi), outLo, outHi);
}

/** Shortest signed angle delta in radians, result in (-π, π]. */
export function angleDelta(from: number, to: number): number {
  return ((to - from) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI;
}

/**
 * Exponential decay toward `b` — frame-rate independent smooth follow.
 * Equivalent to `lerp(a, b, 1 - exp(-lambda * dt))`.
 * @param lambda Higher = faster. 5 ≈ arrives in ~0.6 s.
 */
export function expDecay(a: number, b: number, lambda: number, dt: number): number {
  return a + (b - a) * (1 - Math.exp(-lambda * dt));
}

/**
 * Blend factor for exponential smoothing: `1 - exp(-lambda * dt)`.
 * Use with Vector3.lerp / Quaternion.slerp for FR-independent damping.
 */
export function expFactor(lambda: number, dt: number): number {
  return 1 - Math.exp(-lambda * dt);
}

/** Multiply-by-exp decay for velocities / recoils: `v * exp(-lambda * dt)`. */
export function expScale(lambda: number, dt: number): number {
  return Math.exp(-lambda * dt);
}

/** Linear approach — move `from` toward `to` by at most `maxDelta`. */
export function moveToward(from: number, to: number, maxDelta: number): number {
  const diff = to - from;
  const absDiff = Math.abs(diff);
  if (absDiff <= maxDelta) return to;
  return from + (diff / absDiff) * maxDelta;
}

/** Rotate angle toward target by at most maxDelta (radians), shortest path. */
export function rotateToward(from: number, to: number, maxDelta: number): number {
  return moveToward(from, from + angleDelta(from, to), maxDelta);
}

// ──────────────────────────────────────────────────────────────────────────────
// Random
// ──────────────────────────────────────────────────────────────────────────────

/** Uniform random float in [min, max). */
export function randRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/** Uniform random integer in [min, max] (inclusive). */
export function randInt(min: number, max: number): number {
  return Math.floor(randRange(min, max + 1));
}

/** Pick a random element from an array. Returns `undefined` for empty arrays. */
export function randElement<T>(arr: readonly T[]): T | undefined {
  return arr.length === 0 ? undefined : arr[Math.floor(Math.random() * arr.length)];
}

// ──────────────────────────────────────────────────────────────────────────────
// Angle / direction
// ──────────────────────────────────────────────────────────────────────────────

export const DEG2RAD = Math.PI / 180;
export const RAD2DEG = 180 / Math.PI;

export function toRad(deg: number): number { return deg * DEG2RAD; }
export function toDeg(rad: number): number { return rad * RAD2DEG; }

// ──────────────────────────────────────────────────────────────────────────────
// Game-specific
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Diminishing-returns: effective = cap * raw / (raw + halfCap)
 * At raw == halfCap the return is 50 % of cap.
 */
export function diminishingReturns(raw: number, cap: number, halfCap: number): number {
  return (cap * raw) / (raw + halfCap);
}

/**
 * Soft-cap so values approach `cap` asymptotically without hard-clamping.
 * result = cap - cap / (1 + raw / cap)
 */
export function softCap(raw: number, cap: number): number {
  return cap - cap / (1 + raw / cap);
}

/**
 * Critically-damped spring step (Unity SmoothDamp style, scalar).
 * Mutates velocity ref-like via return object for tree-shake friendliness.
 */
export function smoothDamp(
  current: number,
  target: number,
  currentVelocity: number,
  smoothTime: number,
  dt: number,
  maxSpeed = Infinity,
): { value: number; velocity: number } {
  const st = Math.max(0.0001, smoothTime);
  const omega = 2 / st;
  const x = omega * dt;
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  let change = current - target;
  const maxChange = maxSpeed * st;
  change = clamp(change, -maxChange, maxChange);
  const temp = (currentVelocity + omega * change) * dt;
  let velocity = (currentVelocity - omega * temp) * exp;
  let value = target + (change + temp) * exp;
  // Prevent overshoot
  if ((target - current > 0) === (value > target)) {
    value = target;
    velocity = 0;
  }
  return { value, velocity };
}
