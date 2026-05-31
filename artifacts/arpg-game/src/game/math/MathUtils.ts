/**
 * MathUtils.ts — Common game-math helpers.
 *
 * Pure functions; no imports. Everything is intentionally inlinable
 * by the bundler when tree-shaking is enabled.
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

/** Smoother-step (Ken Perlin's quintic variant, 2nd-order smooth). `t` is clamped to [0,1]. */
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
  inLo: number,  inHi: number,
  outLo: number, outHi: number,
): number {
  return outLo + ((v - inLo) / (inHi - inLo)) * (outHi - outLo);
}

/**
 * Remap `v` from range [inLo, inHi] to [outLo, outHi], clamped to the
 * output range.
 */
export function remapClamped(
  v: number,
  inLo: number,  inHi: number,
  outLo: number, outHi: number,
): number {
  return clamp(remap(v, inLo, inHi, outLo, outHi), outLo, outHi);
}

/** Shortest signed angle delta in radians, result in (-π, π]. */
export function angleDelta(from: number, to: number): number {
  const d = ((to - from) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI;
  return d;
}

/** Exponential decay — frame-rate independent smooth follow.
 *  Returns `a + (b - a) * (1 - exp(-lambda * dt))`.
 *  Equivalent to `lerp(a, b, 1 - exp(-lambda * dt))`.
 *  @param lambda Higher = faster convergence. 5 ≈ "arrives in ~0.6 s".
 */
export function expDecay(a: number, b: number, lambda: number, dt: number): number {
  return a + (b - a) * (1 - Math.exp(-lambda * dt));
}

/** Linear approach — move `from` toward `to` by at most `maxDelta`. */
export function moveToward(from: number, to: number, maxDelta: number): number {
  const diff = to - from;
  const absDiff = Math.abs(diff);
  if (absDiff <= maxDelta) return to;
  return from + (diff / absDiff) * maxDelta;
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

/** Degrees → radians. */
export const DEG2RAD = Math.PI / 180;
/** Radians → degrees. */
export const RAD2DEG = 180 / Math.PI;

/** Convert degrees to radians. */
export function toRad(deg: number): number { return deg * DEG2RAD; }
/** Convert radians to degrees. */
export function toDeg(rad: number): number { return rad * RAD2DEG; }

// ──────────────────────────────────────────────────────────────────────────────
// Game-specific
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Diminishing-returns formula used by the stat system:
 *   effective = cap * raw / (raw + halfCap)
 * At raw == halfCap the return is 50 % of cap; approaches cap asymptotically.
 */
export function diminishingReturns(raw: number, cap: number, halfCap: number): number {
  return cap * raw / (raw + halfCap);
}

/**
 * Soft-cap a value so it can never exceed `cap` but approaches it as `raw`
 * grows.  Unlike `clamp` this never flat-lines — each additional raw point
 * still adds a little bit.
 *   result = cap - cap / (1 + raw / cap)
 */
export function softCap(raw: number, cap: number): number {
  return cap - cap / (1 + raw / cap);
}
