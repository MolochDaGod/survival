# Tundra Terrain Shader Skill

## Purpose
Integrate a frozen tundra / icy wasteland terrain biome shader into the Grudge Nexus
`BiomeTerrainMaterial` (Three.js r183 ShaderMaterial, pnpm monorepo at
`artifacts/arpg-game/`).

## Reference
Original GLSL concept: "Frozen Wasteland" by Dave Hoskins  
https://www.shadertoy.com/view/Xls3D2  
License: CC-BY-NC-SA 3.0

Adapted here for Three.js WebGL1/WebGL2 ShaderMaterial with biome vertex-color weighting.

---

## Key Shader Concepts

### 1. Triangle Noise (`Noise3d`)
The core noise function for tundra detail — sharper edge cracks than value noise:
```glsl
vec3 tri3(vec3 p) {
  return vec3(tri(p.z+tri(p.y)), tri(p.z+tri(p.x)), tri(p.y+tri(p.x)));
}
float tri(float x) { return abs(fract(x) - 0.5); }

float tundraTriNoise(vec3 p) {
  float z = 1.4, rz = 0.0;
  vec3 bp = p;
  for (int i = 0; i < 3; i++) {
    vec3 dg = tri3(bp);
    p += dg;
    bp *= 2.0;
    z  *= 1.5;
    p  *= 1.3;
    rz += tri(p.z + tri(p.x + tri(p.y))) / z;
    bp += 0.14;
  }
  return rz;
}
```

### 2. Ice Surface Diffuse
```glsl
// Ice base — cold blue-white with elevation brightening
vec3 iceColor = vec3(0.78, 0.88, 1.0);
float iceDiff = clamp(dot(vNormal, uSunDir), 0.0, 1.0);
// Fake red-absorption of deep ice
float iceAbsorb = 0.94 - (1.0 - iceDiff) * 0.04;
vec3 iceShading = iceColor * vec3(iceAbsorb, iceAbsorb, 1.0);
```

### 3. Rim SSS (Sub-Surface Scattering Approximation)
```glsl
// Ice edge glow — blue-cyan when backlit
float rimDot = 1.0 - clamp(dot(normalize(uCameraPos - vWorldPos), vNormal), 0.0, 1.0);
float rim = pow(rimDot, 3.0);
vec3 rimColor = vec3(0.3, 0.7, 1.0) * rim * 0.6;
```

### 4. Crystalline Specular
```glsl
vec3 viewDir = normalize(uCameraPos - vWorldPos);
vec3 halfVec = normalize(uSunDir + viewDir);
float spec = pow(clamp(dot(vNormal, halfVec), 0.0, 1.0), 120.0);
vec3 iceSpec = SUN_COLOUR * spec * 2.0;
```

### 5. Frost Crack Bump Detail
Adds micro-crack texture detail using triangle noise evaluated at world position.
```glsl
float crack = tundraTriNoise(vWorldPos * 0.08);
float crackLine = 1.0 - smoothstep(0.0, 0.04, crack - 0.25);
vec3 crackColor = mix(iceShading, vec3(0.4, 0.6, 0.9) * 0.5, crackLine * 0.5);
```

### 6. Animated Ice Storm Fog
```glsl
// Rolling fog / ice storm — moves along -X with time
vec3 stormUV = vWorldPos * 0.005;
stormUV.x -= uTime * 2.0;
float stormNoise = tundraTriNoise(stormUV);
float stormFog = max(stormNoise - 0.1, 0.0) * 0.5;
col = mix(col, uFogColor + vec3(0.15), stormFog);
```

### 7. Vine / Ice Pillar Structures (optional distance object)
```glsl
// Repeating ice column silhouettes for distant visual interest
float iceVine(vec3 p, float repeat, float radius) {
  p.y += sin(p.z * 0.56 + 1.3) * 3.5 - 0.5;
  vec2 q = vec2(mod(p.x, repeat) - repeat * 0.5, p.y);
  return length(q) - radius - sin(p.z * 3.0 + sin(p.x * 7.0) * 0.5) * 0.1;
}
```

---

## Integration with BiomeTerrainMaterial

The tundra biome vertex color is painted by `WorldGen.ts` with a distinct RGB value
(currently: `vec3(0.75, 0.88, 1.0)` — cold pale blue).

In the fragment shader, gate all tundra effects behind biome weight:

```glsl
// vColor.b > 0.82 && vColor.r < 0.5  →  tundra weight
float tundraW = smoothstep(0.65, 0.90, vColor.b) * (1.0 - smoothstep(0.3, 0.6, vColor.r));

vec3 tundraCol = computeTundraColor(vWorldPos, vNormal, iceDiff, rimColor, iceSpec);
col = mix(col, tundraCol, tundraW);
```

### Required Uniforms
Add these to the `uniforms` object in `BiomeTerrainMaterial.ts`:
```typescript
uIceStormIntensity: { value: 0.0 },   // 0–1 driven by weather system
uIceCrackScale:     { value: 1.0 },   // detail scale
```

### WorldGen Biome Assignment
In `WorldGen.ts`, paint tundra vertex color for:
- Elevation > 55 m AND temperature < –5 °C (latitude * –0.3 + noise)
- High-latitude zones (|z| > 2400 m from centre)

```typescript
if (elevation > 55 && temperature < -5) {
  return new THREE.Color(0.75, 0.88, 1.0); // tundra/permafrost
}
if (Math.abs(z) > 2400) {
  return new THREE.Color(0.68, 0.82, 0.99); // polar fringe
}
```

---

## Full Fragment Include Block

Place this in a `/* glsl */` template literal in `BiomeTerrainMaterial.ts`:

```glsl
// ══════════════════════════════════════════════════════════
// TUNDRA BIOME — frozen wasteland terrain shading
// Adapted from "Frozen Wasteland" by Dave Hoskins (CC-BY-NC-SA)
// ══════════════════════════════════════════════════════════

#define SUN_COLOUR vec3(1.0, 0.95, 0.85)
#define TUNDRA_ICE vec3(0.78, 0.88, 1.0)

float _tri(float x) { return abs(fract(x) - 0.5); }
vec3  _tri3(vec3 p) { return vec3(_tri(p.z+_tri(p.y)),_tri(p.z+_tri(p.x)),_tri(p.y+_tri(p.x))); }

float tundraTriNoise(vec3 p) {
  float z = 1.4, rz = 0.0;
  vec3 bp = p;
  for (int i = 0; i < 3; i++) {
    vec3 dg = _tri3(bp);
    p  += dg;
    bp *= 2.0;
    z  *= 1.5;
    p  *= 1.3;
    rz += _tri(p.z + _tri(p.x + _tri(p.y))) / z;
    bp += 0.14;
  }
  return rz;
}

vec3 computeTundraColor(
  vec3  worldPos,
  vec3  N,
  float diff,
  vec3  viewDir,
  float shadow
) {
  // Ice absorption
  float absorp = 0.94 - (1.0 - diff) * 0.04;
  vec3  col    = TUNDRA_ICE * vec3(absorp, absorp, 1.0);

  // Frost cracks
  float crack    = tundraTriNoise(worldPos * 0.08 * uIceCrackScale);
  float crackMask= 1.0 - smoothstep(0.0, 0.04, crack - 0.25);
  col = mix(col, vec3(0.38, 0.58, 0.88) * 0.5, crackMask * 0.5);

  // Diffuse + shadow
  col *= (diff * shadow * 0.85 + 0.15);
  col += abs(N.y) * vec3(0.08, 0.12, 0.18);

  // Rim SSS
  float rimDot = 1.0 - clamp(dot(viewDir, N), 0.0, 1.0);
  float rim    = pow(rimDot, 3.0);
  col += vec3(0.25, 0.65, 1.0) * rim * 0.55 * shadow;

  // Crystalline specular
  vec3  H    = normalize(uSunDir + viewDir);
  float spec = pow(clamp(dot(N, H), 0.0, 1.0), 120.0);
  col += SUN_COLOUR * spec * 2.0 * shadow;

  // Ice storm fog
  vec3  stormUV = worldPos * 0.005;
  stormUV.x   -= uTime * 2.0;
  float storm   = max(tundraTriNoise(stormUV) - 0.1, 0.0) * uIceStormIntensity;
  col = mix(col, vec3(0.82, 0.88, 0.95), storm * 0.7);

  return col;
}
```

---

## Performance Notes
- Triangle noise is 3-octave loop — ~8 instructions per octave, safe for mobile.
- Gate the storm fog branch behind `uIceStormIntensity > 0.01` to avoid branching cost on non-tundra terrain.
- All uniforms are frame-updated by `WorldChunkManager.updateUniforms()`.

---

## Files to Edit
| File | Change |
|------|--------|
| `src/game/world/BiomeTerrainMaterial.ts` | Add tundra GLSL block + uniforms |
| `src/game/world/WorldGen.ts` | Paint tundra vertex color for high-elevation cold zones |
| `src/game/world/WorldChunkManager.ts` | Update `uIceStormIntensity` uniform each frame |
