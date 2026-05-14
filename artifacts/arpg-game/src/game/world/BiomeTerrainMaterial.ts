/**
 * BiomeTerrainMaterial
 *
 * Custom ShaderMaterial for the procedural terrain.
 * Uses biome vertex-colors as a base and layers on:
 *   • Directional sun lighting (diffuse + blinn-phong specular)
 *   • Snow/ice biome — icy blue rim-SSS (inspired by IceCube shader)
 *   • Highland/desert biome — warm sun-baked tone with dust specular
 *   • Forest biome — soft subsurface green scatter
 *   • Exponential-squared fog with sun-direction warmth bleed
 *   • Subtle time-animated shimmer on snow and highland faces
 *
 * Uniforms updated every frame by WorldChunkManager.updateUniforms().
 */

import * as THREE from 'three';

// ─── Vertex Shader ────────────────────────────────────────────────────────────

const VERT = /* glsl */`
varying vec3 vColor;
varying vec3 vNormal;
varying vec3 vWorldPos;
varying float vElevation;

void main() {
  vColor = color;

  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorldPos  = worldPos.xyz;
  vElevation = worldPos.y;   // terrain height in world space

  // World-space normal
  vNormal = normalize(mat3(transpose(inverse(modelMatrix))) * normal);

  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

// ─── Fragment Shader ──────────────────────────────────────────────────────────

const FRAG = /* glsl */`
uniform float  uTime;
uniform vec3   uSunDir;      // normalised sun direction (world space)
uniform vec3   uSunColor;    // e.g. vec3(1.0, 0.85, 0.55) for warm noon
uniform vec3   uCameraPos;   // for specular
uniform vec3   uPlayerPos;   // for player-centric radial fog dome
uniform vec3   uFogColor;    // sky/horizon colour
uniform float  uFogNear;
uniform float  uFogFar;
uniform float  uFogGloom;    // 0–1 global gloom intensity (night / storm)

varying vec3  vColor;
varying vec3  vNormal;
varying vec3  vWorldPos;
varying float vElevation;

// ── helpers ──────────────────────────────────────────────────────────────────

// Hash for tiny pseudo-random flicker (stolen concept from IceCube AO hash)
float hash(float n) { return fract(sin(n) * 56753.5454); }

// Smooth remap
float linstep(float a, float b, float t) {
  return clamp((t - a) / (b - a), 0.0, 1.0);
}

// ─── Rolling-hills grass shader (Shadertoy Xsf3zX by David Hoskins) ──────────
// Adapted: iGlobalTime → uTime, globals → local/uniform, g_ prefix avoids
// name collisions, GrassBlades loop reduced 15→12, dist cutoff at 28m.

#define G_MOD2 vec2(3.07965, 7.4235)

float g_Hash(float p) {
  vec2 p2 = fract(vec2(p) / G_MOD2);
  p2 += dot(p2.yx, p2.xy + 19.19);
  return fract(p2.x * p2.y);
}
float g_Hash(vec2 p) {
  p  = fract(p / G_MOD2);
  p += dot(p.xy, p.yx + 19.19);
  return fract(p.x * p.y);
}
float g_Noise(in vec2 x) {
  vec2 p = floor(x);
  vec2 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  float n = p.x + p.y * 57.0;
  return mix(mix(g_Hash(n +  0.0), g_Hash(n +  1.0), f.x),
             mix(g_Hash(n + 57.0), g_Hash(n + 58.0), f.x), f.y);
}

vec2 g_Voronoi(in vec2 x) {
  vec2  p  = floor(x);
  vec2  f  = fract(x);
  float res = 100.0;
  float id  = 0.0;
  for (int j = -1; j <= 1; j++)
  for (int i = -1; i <= 1; i++) {
    vec2  b = vec2(float(i), float(j));
    vec2  r = b - f + g_Hash(p + b);
    float d = dot(r, r);
    if (d < res) { res = d; id = g_Hash(p + b); }
  }
  return vec2(max(0.4 - sqrt(res), 0.0), id);
}

// Terrain height function (mirrors the rolling-hills shader's noise stack)
float g_TerrainH(in vec2 p) {
  vec2 pos = p * 0.003;
  float w  = 50.0;
  float f  = 0.0;
  for (int i = 0; i < 3; i++) {
    f   += g_Noise(pos) * w;
    w   *= 0.62;
    pos *= 2.5;
  }
  return f;
}

// Distance estimator for a single grass blade cluster
vec3 g_DE(vec3 p) {
  float base   = g_TerrainH(p.xz) - 1.9;
  float height = g_Noise(p.xz * 2.0) * 0.75
               + g_Noise(p.xz)       * 0.35
               + g_Noise(p.xz * 0.5) * 0.20;
  float y = p.y - base - height;
  y = y * y;
  vec2 ret = g_Voronoi(
    p.xz * 2.5
    + sin(y * 4.0 + p.zx * 12.3) * 0.12
    + vec2(sin(uTime * 2.3 + 1.5 * p.z),
           sin(uTime * 3.6 + 1.5 * p.x)) * y * 0.5
  );
  float f = ret.x * 0.6 + y * 0.58;
  return vec3(y - f * 1.4, clamp(f * 1.5, 0.0, 1.0), ret.y);
}

// Circle of confusion (depth-of-field aperture size for blurred marching)
float g_CoC(float t) {
  // Original: max(t*.04, (2/iResolution.y)*(1+t)) — substitute 720 for height
  return max(t * 0.04, 0.00278 * (1.0 + t));
}

// Volumetric grass blade accumulator
// rO = ray origin (terrain surface), rD = view ray dir, mat = base colour, dist = cam distance
vec3 g_GrassBlades(in vec3 rO, in vec3 rD, in vec3 mat, in float dist) {
  float d    = 0.0;
  float rCoC = g_CoC(dist * 0.3);
  vec4  col  = vec4(mat * 0.15, 0.0);

  for (int i = 0; i < 12; i++) {           // 12 steps (was 15)
    if (col.w > 0.99) break;
    vec3  p   = rO + rD * d;
    vec3  ret = g_DE(p);
    ret.x    += 0.5 * rCoC;

    if (ret.x < rCoC) {
      float alpha = (1.0 - col.w) * linstep(-rCoC, rCoC, -ret.x);
      // Grass tip: white tips mixed in at the top of each blade
      vec3 gra = mix(mat,
                     vec3(0.35, 0.35, min(pow(abs(ret.z), 4.0) * 35.0, 0.35)),
                     pow(abs(ret.y), 9.0) * 0.7) * ret.y;
      col += vec4(gra * alpha, alpha);
    }
    d += max(ret.x * 0.7, 0.1);
  }
  if (col.w < 0.2) col.xyz = vec3(0.1, 0.15, 0.05);
  return col.xyz;
}

// Simple noise for shimmer
float noise1(float x) {
  float i = floor(x);
  float f = fract(x);
  float u = f * f * (3.0 - 2.0 * f);
  return mix(hash(i), hash(i + 1.0), u);
}

// Biome detection via elevation (mirrors WorldGen thresholds)
// -20 deep ocean | -8 ocean | -0.5 shallowsea | 1.5 beach | 12 grass | 28 forest | 45 highland | 65 mountain | 65+ snow

// IQ-style anti-aliased snow line.
// Blends elevation, slope (N.y), and noise into a single mask, then uses
// fwidth() to pick the smoothstep width per-pixel — this gives a crisp
// snow edge without shimmer at any view distance.
//
// Adapted from Inigo Quilez' "Mountain & Tubes" Shadertoy fragment:
//   https://www.shadertoy.com/view/4sjXzG
float snowLineIQ(float ny, float h, vec2 worldXZ) {
  float s  = ny + 0.008 * h - 0.18
           + 0.20 * (g_Noise(worldXZ * 0.012) - 0.5);
  float sf = fwidth(s) * 1.5;
  return smoothstep(0.84 - sf, 0.84 + sf, s);
}

float isSnow(float h)     { return linstep(58.0, 68.0, h); }
float isMountain(float h) { return linstep(40.0, 55.0, h) * (1.0 - linstep(60.0, 72.0, h)); }
float isHighland(float h) { return linstep(22.0, 35.0, h) * (1.0 - linstep(42.0, 55.0, h)); }
float isForest(float h)   { return linstep(10.0, 18.0, h) * (1.0 - linstep(26.0, 36.0, h)); }
float isBeach(float h)    { return linstep(-1.0, 2.0, h)  * (1.0 - linstep(4.0, 12.0, h)); }
float isOcean(float h)    { return linstep(-1.5, -0.5, -h); } // below sea level

// ── main ─────────────────────────────────────────────────────────────────────

void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(uCameraPos - vWorldPos);  // view direction
  vec3 L = normalize(uSunDir);

  float h = vElevation;

  // ── Base biome colour from vertex attribute ────────────────────────────────
  vec3 albedo = vColor;

  // ── Diffuse lighting ──────────────────────────────────────────────────────
  float NdotL    = max(dot(N, L), 0.0);
  float ambient  = 0.18 + 0.08 * max(N.y, 0.0);   // sky ambient (stronger on flat tops)
  vec3  diffuse  = uSunColor * NdotL;

  // Slope-based shadow softening: steep faces lose direct light faster
  float slopeFade = smoothstep(0.0, 0.35, N.y);
  diffuse *= 0.6 + 0.4 * slopeFade;

  // ── Specular — Blinn-Phong base ───────────────────────────────────────────
  vec3  H         = normalize(L + V);
  float NdotH     = max(dot(N, H), 0.0);

  // ── Snow / Ice biome  (from IceCube SSS idea) ─────────────────────────────
  // IceCube used thickness() to simulate light through thin ice; here we
  // approximate with a view-based rim driven by sun backlight.
  //
  // Snow mask = elevation gate × IQ slope-AA edge. The elevation term keeps
  // snow off lowland, the slope+noise+fwidth term gives a sharp natural
  // snow line on the higher peaks.
  float snowElev = isSnow(h);
  float snowEdge = snowLineIQ(N.y, h, vWorldPos.xz);
  float snowT    = clamp(snowElev * (0.4 + 0.7 * snowEdge), 0.0, 1.0);
  float iceShin = 80.0 + 40.0 * noise1(vWorldPos.x * 0.04 + uTime * 0.3);  // shimmering facets
  float iceSpec = pow(NdotH, iceShin) * snowT;

  // SSS-like inner glow: light coming through from behind the slope
  float sss      = pow(clamp(dot(-V, L), 0.0, 1.0), 2.5) * 0.4;
  float iceSss   = snowT * sss;
  vec3  iceGlow  = vec3(0.35, 0.55, 1.0) * iceSss;             // blue inner SSS
  vec3  iceEdge  = vec3(0.55, 0.80, 1.0) * pow(1.0 - max(dot(N, V), 0.0), 3.0) * snowT * 0.7; // fresnel rim

  // Snow shimmer — tiny specular flicker (IceCube used 6 AO point lights in a ring)
  float shimmerAngle = uTime * 0.6 + vWorldPos.x * 0.03;
  float shimmer = 0.0;
  for (int i = 0; i < 4; i++) {
    float a = shimmerAngle + float(i) * 1.5708;  // π/2 apart
    vec3 sL = normalize(vec3(cos(a) * 0.6, 0.6, sin(a) * 0.6));
    shimmer += pow(max(dot(N, sL), 0.0), 18.0) * 0.12;
  }
  shimmer *= snowT;

  albedo += iceGlow + iceEdge;
  albedo = mix(albedo, albedo * vec3(0.88, 0.93, 1.0), snowT * 0.5);   // cool the albedo

  // ── Highland / Desert biome  (from Desert terrain: warm slope colouring) ──
  // Desert shader used mix(vec3(.45,.4,.3), vec3(.2,.05,.0), normal.y) for rocky warmth.
  // We apply a slope-based warm sun-baked tone on highland/mountain faces.
  float highT     = isMountain(h) + isHighland(h) * 0.6;
  float slopeFace = clamp(1.0 - N.y, 0.0, 1.0);  // 0 on flat, 1 on vertical
  vec3  desertTint = mix(vec3(1.0), vec3(1.35, 1.1, 0.70), slopeFace * highT * 0.55);
  float rockSpec  = pow(NdotH, 22.0) * highT * 0.12 * NdotL;
  albedo *= desertTint;

  // ── Forest biome — soft under-canopy scatter ──────────────────────────────
  float forestT   = isForest(h);
  // Desert shader used a translucency term; forests get a soft warm-light scatter
  // that brightens shadowed undersides slightly (like light through leaves)
  float forestScatter = clamp(0.35 - NdotL * 0.3, 0.0, 0.35) * forestT;
  vec3  leafLight = vec3(0.45, 0.70, 0.25) * forestScatter * 0.8;
  albedo += leafLight;

  // ── Beach biome — slightly warm the sand ─────────────────────────────────
  float beachT   = isBeach(h);
  albedo = mix(albedo, albedo * vec3(1.12, 1.08, 0.88), beachT * 0.4);

  // ── Grassland biome — volumetric grass blades (Rolling Hills, Shadertoy Xsf3zX) ──
  // Grassland = roughly elevation 1.5 to 12 (between beach and forest).
  // Grass blade tracing is only run within 28m of camera for performance;
  // it fades out gracefully between 20m and 28m.
  float grassT = linstep(1.5, 5.0, h) * (1.0 - linstep(10.0, 13.0, h));
  float camDist = length(vWorldPos - uCameraPos);
  float nearGrass = 1.0 - smoothstep(20.0, 28.0, camDist);
  float grassBlend = grassT * nearGrass;

  if (grassBlend > 0.001) {
    // Base grass colour: mix dark-green to olive, varied by noise for clumps
    vec3 grassBase = mix(vec3(0.0, 0.30, 0.0), vec3(0.20, 0.30, 0.0),
                         g_Noise(vWorldPos.xz * 0.025));

    // Fractal-noise shadow term (light patches between blades)
    float noiseShadow = g_Noise(vWorldPos.xz * 0.1) * 0.7
                      + g_Noise(vWorldPos.xz * 0.2) * 0.3 * 0.6;
    float shadowT = noiseShadow + 0.5;   // ~0.5–1.2, mirrors FractalNoise usage

    // Ray marches from surface in the view direction (camera → surface)
    vec3 viewRay = normalize(vWorldPos - uCameraPos);
    vec3 grassCol = g_GrassBlades(vWorldPos, viewRay, grassBase, camDist) * shadowT;

    // Sun lighting on grass (DoLighting equivalent)
    grassCol *= (max(NdotL, 0.0) + 0.2) * uSunColor;

    albedo = mix(albedo, grassCol, grassBlend);
  }

  // ── Final lighting combination ────────────────────────────────────────────
  vec3 col = albedo * (ambient + diffuse)
           + vec3(1.0) * (iceSpec + shimmer)
           + vec3(1.0, 0.88, 0.55) * rockSpec;

  // ── Player-centric radial fog dome ──────────────────────────────────────────
  // Distance on the XZ plane from the player — creates a fog "aura" bubble.
  // Starts at uFogNear (≈80 m) and fully opaque at uFogFar (≈100 m).
  float horzDist  = length(vWorldPos.xz - uPlayerPos.xz);
  float fogT      = smoothstep(uFogNear, uFogFar, horzDist);

  // IQ-style exponential-squared distance fog. Adds a soft horizon haze that
  // doesn't fight the player bubble — they're combined via max() below.
  // Coefficient picked so haze becomes visible past ~250 m and is dense at ~600 m.
  float distFog = 1.0 - exp(-0.0000020 * camDist * camDist);

  float fogFactor = max(fogT, distFog);

  // Sun-direction view dot (used for both warm bleed and IQ sun scatter)
  vec3  viewDir   = normalize(vWorldPos - uCameraPos);
  float sundotc   = max(dot(viewDir, L), 0.0);

  // Warm bleed in the fog colour toward the sun
  float sunBleed  = pow(sundotc, 6.0) * 0.35;
  vec3  fogTinted = mix(uFogColor, uFogColor * vec3(1.4, 1.1, 0.65), sunBleed);
  // Gloom: darken the fog color toward midnight blue for atmosphere
  fogTinted = mix(fogTinted, fogTinted * vec3(0.25, 0.28, 0.45) + vec3(0.02, 0.02, 0.06), uFogGloom);

  col = mix(col, fogTinted, fogFactor);

  // IQ-style additive sun scatter — warm halo around the sun direction that
  // strengthens with distance through the haze. Adapted from "Mountain & Tubes"
  // (https://www.shadertoy.com/view/4sjXzG):
  //   col += 0.15 * vec3(1.0,0.8,0.3) * pow(sundotc, 8.0) * (1.0-exp(-0.003*t));
  // Suppressed under heavy gloom (storms / night) so it doesn't fight the mood.
  col += 0.15 * vec3(1.0, 0.8, 0.3)
       * pow(sundotc, 8.0)
       * (1.0 - exp(-0.003 * camDist))
       * (1.0 - uFogGloom * 0.85);

  // ── Ocean below sea level — darken + tint to not fight WaterPlane ─────────
  float oceanT   = isOcean(h);
  col = mix(col, col * 0.15, oceanT);  // nearly black — water plane renders on top

  // ── Tone mapping (subtle, contrast/sat from Desert's PostEffects) ─────────
  // Desert used pow(rgb, 0.45) gamma + contrast 1.4/sat 1.4.
  // We do a gentle version so it doesn't fight Three.js tonemapping.
  col = pow(max(col, vec3(0.0)), vec3(0.95));     // mild gamma lift
  float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(lum), col, 1.25);                // sat +25 %
  col = mix(vec3(0.5),  col, 1.15);               // contrast +15 %

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);

  // Three.js tone-mapping / output encoding hooks
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

// ─── Material factory ─────────────────────────────────────────────────────────

const DEFAULT_SUN_DIR  = new THREE.Vector3(0.45, 0.65, 0.60).normalize();
const DEFAULT_SUN_COL  = new THREE.Color(1.0, 0.88, 0.62);
const DEFAULT_FOG_COL  = new THREE.Color(0.52, 0.60, 0.72);

export interface TerrainUniforms {
  uTime:       { value: number };
  uSunDir:     { value: THREE.Vector3 };
  uSunColor:   { value: THREE.Color };
  uCameraPos:  { value: THREE.Vector3 };
  uPlayerPos:  { value: THREE.Vector3 };
  uFogColor:   { value: THREE.Color };
  uFogNear:    { value: number };
  uFogFar:     { value: number };
  uFogGloom:   { value: number };
  [key: string]: { value: unknown };
}

let _sharedUniforms: TerrainUniforms | null = null;

export function getTerrainUniforms(): TerrainUniforms {
  if (!_sharedUniforms) {
    _sharedUniforms = {
      uTime:       { value: 0 },
      uSunDir:     { value: DEFAULT_SUN_DIR.clone() },
      uSunColor:   { value: DEFAULT_SUN_COL.clone() },
      uCameraPos:  { value: new THREE.Vector3() },
      uPlayerPos:  { value: new THREE.Vector3() },
      uFogColor:   { value: DEFAULT_FOG_COL.clone() },
      uFogNear:    { value: 80 },   // fog begins 80 m from player
      uFogFar:     { value: 100 },  // fully opaque at 100 m
      uFogGloom:   { value: 0.0 },
    };
  }
  return _sharedUniforms;
}

export function updateTerrainUniforms(
  time: number,
  cameraPos: THREE.Vector3,
  sunDir?: THREE.Vector3,
  sunColor?: THREE.Color,
  fogColor?: THREE.Color,
  playerPos?: THREE.Vector3,
  gloom?: number,
) {
  const u = getTerrainUniforms();
  u.uTime.value = time;
  u.uCameraPos.value.copy(cameraPos);
  if (sunDir)    u.uSunDir.value.copy(sunDir);
  if (sunColor)  u.uSunColor.value.copy(sunColor);
  if (fogColor)  u.uFogColor.value.copy(fogColor);
  if (playerPos) u.uPlayerPos.value.copy(playerPos);
  if (gloom !== undefined) u.uFogGloom.value = gloom;
}

export function createBiomeTerrainMaterial(): THREE.ShaderMaterial {
  // The fragment shader uses fwidth() inside snowLineIQ(). This is built
  // into GLSL ES 3.0, which Three.js r163+ uses unconditionally — WebGL1
  // support (and the old `extensions.derivatives` opt-in) was removed.
  return new THREE.ShaderMaterial({
    vertexShader:  VERT,
    fragmentShader: FRAG,
    uniforms:      getTerrainUniforms(),
    vertexColors:  true,
    side:          THREE.FrontSide,
  });
}
