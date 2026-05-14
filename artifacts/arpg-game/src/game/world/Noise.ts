/**
 * Classic gradient Perlin noise + fBm helpers.
 * Pure TypeScript, no external dependencies.
 * Based on Ken Perlin's improved noise (2002).
 */

// Permutation table – doubled to avoid index wrapping
const _p = new Uint8Array(256);
for (let i = 0; i < 256; i++) _p[i] = i;
// Fisher-Yates shuffle with a fixed seed so terrain is deterministic
let _seed = 12345;
for (let i = 255; i > 0; i--) {
  _seed = (_seed * 1664525 + 1013904223) >>> 0;
  const j = _seed % (i + 1);
  const tmp = _p[i]; _p[i] = _p[j]; _p[j] = tmp;
}
const PERM = new Uint8Array(512);
for (let i = 0; i < 512; i++) PERM[i] = _p[i & 255];

// Gradient vectors (12 edges of a cube, gives -1/0/1 components)
const GRAD3 = new Int8Array([
  1,1,0,-1,1,0,1,-1,0,-1,-1,0,
  1,0,1,-1,0,1,1,0,-1,-1,0,-1,
  0,1,1,0,-1,1,0,1,-1,0,-1,-1,
]);

function fade(t: number): number { return t * t * t * (t * (t * 6 - 15) + 10); }
function lerp(a: number, b: number, t: number): number { return a + t * (b - a); }

function grad2(hash: number, x: number, y: number): number {
  const h = (hash & 7) * 2;
  return GRAD3[h] * x + GRAD3[h + 1] * y;
}

/**
 * 2D Perlin noise. Returns roughly –1 to +1.
 * @param x World X * frequency
 * @param y World Z * frequency
 */
export function noise2D(x: number, y: number): number {
  const X = Math.floor(x) & 255;
  const Y = Math.floor(y) & 255;
  const xf = x - Math.floor(x);
  const yf = y - Math.floor(y);
  const u = fade(xf);
  const v = fade(yf);

  const aa = PERM[PERM[X    ] + Y    ];
  const ab = PERM[PERM[X    ] + Y + 1];
  const ba = PERM[PERM[X + 1] + Y    ];
  const bb = PERM[PERM[X + 1] + Y + 1];

  return lerp(
    lerp(grad2(aa, xf,     yf    ), grad2(ba, xf - 1, yf    ), u),
    lerp(grad2(ab, xf,     yf - 1), grad2(bb, xf - 1, yf - 1), u),
    v,
  );
}

/**
 * Fractal Brownian Motion – sums `octaves` noise layers.
 * Returns roughly –1 to +1.
 */
export function fbm(
  x: number, y: number,
  octaves = 6,
  lacunarity = 2.0,
  gain = 0.5,
): number {
  let val = 0, amp = 1, freq = 1, maxAmp = 0;
  for (let i = 0; i < octaves; i++) {
    val += noise2D(x * freq, y * freq) * amp;
    maxAmp += amp;
    freq *= lacunarity;
    amp  *= gain;
  }
  return val / maxAmp;
}

/**
 * Ridged fBm – inverts absolute noise to create sharp ridges.
 * Returns 0 (valley) to 1 (ridge peak).
 */
export function ridgedFbm(x: number, y: number, octaves = 4): number {
  let val = 0, amp = 1, freq = 1, maxAmp = 0;
  for (let i = 0; i < octaves; i++) {
    val += (1 - Math.abs(noise2D(x * freq, y * freq))) * amp;
    maxAmp += amp;
    freq *= 2;
    amp  *= 0.5;
  }
  return val / maxAmp;
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
