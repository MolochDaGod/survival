/**
 * VolumetricSky — raymarched ground + volumetric-cloud sky background.
 *
 * Adapted from the Shadertoy flyover fog shader (iChannel0 tex10).
 * The texture channel is replaced with a GLSL procedural value noise so no
 * external texture asset is required.
 *
 * Renders as a full-screen background quad (renderOrder -1000, no depth
 * write/test) so it sits behind all Three.js scene geometry.
 *
 * Usage:
 *   const sky = new VolumetricSky(scene);
 *   // each frame:
 *   sky.update(elapsedSeconds, aspect);
 *   sky.dispose(); // on teardown
 */

import * as THREE from 'three';

// ─── Vertex shader ────────────────────────────────────────────────────────────
// Fullscreen triangle: position goes straight to clip space, vUv passed to frag.
const VERT = /* glsl */`
varying vec2 vUv;
void main() {
  vUv = uv;
  // z = 1.0, w = 1.0  →  depth = 1.0 after perspective divide (far plane)
  gl_Position = vec4(position.xy, 1.0, 1.0);
}
`;

// ─── Fragment shader ──────────────────────────────────────────────────────────
// Original: https://www.shadertoy.com/view/Msf3zX
// Adaptations:
//   • iChannel0 texture2D → procNoise() value noise (no asset dependency)
//   • iGlobalTime          → uTime uniform
//   • iMouse               → vec2(0.0) (no mouse)
//   • iResolution.z        → uAspect  (width / height)
//   • March iterations     → 25  (was 50)  — saves ~1 ms per frame
//   • time formula         → uTime * 4.0   (removed discontinuous jump)
//   • TONE_MAPPING define  → removed
const FRAG = /* glsl */`
precision highp float;
uniform float uTime;
uniform float uAspect;
varying vec2  vUv;

// ── Procedural value noise (replaces iChannel0 texture) ─────────────────────
float hash(vec2 p) {
  p = fract(p * vec2(127.1, 311.7));
  p += dot(p, p + 19.31);
  return fract(p.x * p.y);
}
float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

// ── Original noise functions (texture sampling → valueNoise) ─────────────────
float noise(in vec3 x) {
  float  z    = x.z * 64.0;
  vec2   offz = vec2(0.317, 0.123);
  vec2   uv1  = x.xy + offz * floor(z);
  vec2   uv2  = uv1 + offz;
  return mix(valueNoise(uv1 * 4.0), valueNoise(uv2 * 4.0), fract(z)) - 0.5;
}

float noises(in vec3 p) {
  float a = 0.0;
  for (float i = 1.0; i < 6.0; i++) {
    a += noise(p) / i;
    p  = p * 2.0 + vec3(0.0, a * 0.001 / i, a * 0.0001 / i);
  }
  return a;
}

float base(in vec3 p) {
  return noise(p * 0.00002) * 1200.0;
}

float ground(in vec3 p) {
  return base(p) + noises(p.zxy * 0.00005 + 10.0) * 40.0 * (0.0 - p.y * 0.01) + p.y;
}

float clouds(in vec3 p) {
  float b = base(p);
  p.y += b * 0.5 / abs(p.y) + 100.0;
  return noises(vec3(p.x * 0.3 + (uTime * 4.0) * 30.0, p.y, p.z) * 0.00002)
       - max(p.y, 0.0) * 0.00009;
}

// ── Camera helpers ────────────────────────────────────────────────────────────
vec3 rotateY(vec3 r, float v) {
  return vec3(r.x * cos(v) + r.z * sin(v), r.y, r.z * cos(v) - r.x * sin(v));
}

void main() {
  float time = uTime * 4.0;

  // Clip-space UV → aspect-corrected ray UV
  vec2 uv = (vUv - 0.5) * 2.0 * vec2(uAspect, 1.0);

  // Flying camera — slowly orbits horizontally
  vec3 campos = vec3(30.0, 500.0, time * 8.0);
  campos.y    = 500.0 - base(campos);

  vec3 ray = rotateY(
    normalize(vec3(uv.x, uv.y - sin(time * 0.05) * 0.2 - 0.1, 1.0)),
    time * 0.01
  );

  vec3 sun = vec3(0.0, 0.6, -0.4);

  // ── Raymarch (25 steps — down from 50) ──────────────────────────────────
  float fogAcc = 0.0;
  float dist   = 0.0;
  vec3  p1     = campos + ray;
  for (float i = 1.0; i < 25.0; i++) {
    float test = ground(p1);
    fogAcc += max(test * clouds(p1), fogAcc * 0.02);
    p1   += ray * min(test, i * i * 0.5);
    dist += test;
    if (abs(test) < 10.0 || dist > 40000.0) break;
  }

  // ── Lighting ─────────────────────────────────────────────────────────────
  float l     = sin(dot(ray, sun));
  vec3  light = vec3(l, 0.0, -l) + ray.y * 0.2;

  float amb   = smoothstep(-100.0, 100.0, ground(p1 + vec3(0.0, 30.0, 0.0) + sun * 10.0))
              - smoothstep(1000.0, -0.0, p1.y) * 0.7;

  vec3 groundCol = vec3(0.30, 0.30, 0.25)
                 + sin(p1 * 0.001) * 0.01
                 + noise(vec3(p1 * 0.002)) * 0.1
                 + amb * 0.7
                 + light * 0.01;

  float f       = smoothstep(0.0, 800.0, fogAcc);
  vec3  cloudCol = vec3(0.70, 0.72, 0.70) + light * 0.05 + sin(fogAcc * 0.0002) * 0.2 + noise(p1) * 0.05;

  float h    = smoothstep(10000.0, 40000.0, dist);
  vec3  sky  = cloudCol + ray.y * 0.1 - 0.02;

  vec3 col = sqrt(
    clamp(
      smoothstep(0.2, 1.0, mix(mix(groundCol, sky, h), cloudCol, f) - dot(uv, uv) * 0.1),
      0.0, 1.0
    )
  );

  gl_FragColor = vec4(col, 1.0);
}
`;

// ─── VolumetricSky ────────────────────────────────────────────────────────────

export class VolumetricSky {
  private mesh: THREE.Mesh;
  private mat:  THREE.ShaderMaterial;

  constructor(scene: THREE.Scene) {
    this.mat = new THREE.ShaderMaterial({
      vertexShader:   VERT,
      fragmentShader: FRAG,
      uniforms: {
        uTime:   { value: 0 },
        uAspect: { value: 16 / 9 },
      },
      depthWrite: false,
      depthTest:  false,
      side: THREE.FrontSide,
    });

    const geo  = new THREE.PlaneGeometry(2, 2);
    this.mesh  = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder   = -1000;

    // Put in its own layer so shadow/raycasts never hit it
    this.mesh.layers.set(31);

    scene.add(this.mesh);
  }

  /** Call each frame from GameEngine. aspect = renderer width / height. */
  update(time: number, aspect: number): void {
    this.mat.uniforms.uTime.value   = time;
    this.mat.uniforms.uAspect.value = aspect;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mat.dispose();
    this.mesh.removeFromParent();
  }
}
