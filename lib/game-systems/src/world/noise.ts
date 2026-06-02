/**
 * Deterministic noise primitives — pure TypeScript, no runtime deps.
 *
 * Mirrors `arpg-game/src/game/world/Noise.ts` API surface so the client can
 * migrate to this module without touching call sites. Lives in
 * `@workspace/game-systems/world` so both the Railway server (collision
 * height sampling, NPC pathing, server-authoritative spawn placement) and
 * the Three.js client (terrain mesh generation, height-aware rendering)
 * compute the exact same value for the same `(seed, x, z)` triple.
 *
 * Implementation: Ken Perlin's improved noise (2002) plus fBm/ridged-fBm
 * helpers. The permutation table is shuffled with a fixed LCG so a given
 * seed reproduces the same world every time the module is imported.
 */

const PERM = new Uint8Array(512);
const GRAD3 = new Int8Array([
  1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1, 0,
  1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, -1,
  0, 1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1,
]);

/**
 * Reseed the permutation table. Idempotent — calling twice with the same
 * seed yields identical noise output. Default seed `12345` matches the
 * legacy client implementation so visuals are stable until a world reseeds.
 */
export function seedNoise(seed = 12345): void {
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  let s = (seed | 0) >>> 0;
  if (s === 0) s = 0x9e3779b9; // any non-zero fallback
  for (let i = 255; i > 0; i--) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const j = s % (i + 1);
    const tmp = p[i]!;
    p[i] = p[j]!;
    p[j] = tmp;
  }
  for (let i = 0; i < 512; i++) PERM[i] = p[i & 255]!;
}

// Seed at module load with the legacy default so import-only consumers get
// the same output as `arpg-game/src/game/world/Noise.ts`.
seedNoise(12345);

function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function lerp(a: number, b: number, t: number): number {
  return a + t * (b - a);
}

function grad2(hash: number, x: number, y: number): number {
  const h = (hash & 7) * 2;
  return GRAD3[h]! * x + GRAD3[h + 1]! * y;
}

/**
 * 2D Perlin noise — returns roughly [-1, +1].
 * `x`, `y` are world coordinates multiplied by the desired frequency.
 */
export function noise2D(x: number, y: number): number {
  const X = Math.floor(x) & 255;
  const Y = Math.floor(y) & 255;
  const xf = x - Math.floor(x);
  const yf = y - Math.floor(y);
  const u = fade(xf);
  const v = fade(yf);

  const aa = PERM[PERM[X]! + Y]!;
  const ab = PERM[PERM[X]! + Y + 1]!;
  const ba = PERM[PERM[X + 1]! + Y]!;
  const bb = PERM[PERM[X + 1]! + Y + 1]!;

  return lerp(
    lerp(grad2(aa, xf, yf), grad2(ba, xf - 1, yf), u),
    lerp(grad2(ab, xf, yf - 1), grad2(bb, xf - 1, yf - 1), u),
    v,
  );
}

/**
 * Fractal Brownian Motion — sum of `octaves` Perlin layers with geometric
 * frequency growth (lacunarity) and amplitude decay (gain). Returns roughly
 * [-1, +1] after normalisation.
 */
export function fbm(
  x: number,
  y: number,
  octaves = 6,
  lacunarity = 2.0,
  gain = 0.5,
): number {
  let val = 0;
  let amp = 1;
  let freq = 1;
  let maxAmp = 0;
  for (let i = 0; i < octaves; i++) {
    val += noise2D(x * freq, y * freq) * amp;
    maxAmp += amp;
    freq *= lacunarity;
    amp *= gain;
  }
  return val / maxAmp;
}

/**
 * Ridged fBm — `1 - |noise|` per octave, biased toward sharp ridge peaks.
 * Returns [0, 1] where 1 is the top of a ridge.
 */
export function ridgedFbm(x: number, y: number, octaves = 4): number {
  let val = 0;
  let amp = 1;
  let freq = 1;
  let maxAmp = 0;
  for (let i = 0; i < octaves; i++) {
    val += (1 - Math.abs(noise2D(x * freq, y * freq))) * amp;
    maxAmp += amp;
    freq *= 2;
    amp *= 0.5;
  }
  return val / maxAmp;
}

/**
 * Hermite smoothstep — used by `worldHeight` to blend biome influences at
 * sector boundaries and by callers building falloff masks.
 */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Deterministic per-coordinate 32-bit hash. Used by spawn-point placement
 * and POI offset jitter so identical inputs always produce identical
 * outputs across server and client.
 */
export function hash2D(x: number, z: number, seed = 0): number {
  let h = (seed ^ Math.imul(x | 0, 374761393) ^ Math.imul(z | 0, 668265263)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}
