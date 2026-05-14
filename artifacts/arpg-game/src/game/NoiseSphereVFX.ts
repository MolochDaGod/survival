/**
 * NoiseSphereVFX — GPU raymarched noise sphere shader for abilities,
 * damage hits, and fire effects.
 *
 * Core shader adapted from the provided fire-sphere Shadertoy fragment.
 * Key changes for in-game use:
 *   • Mouse rotation removed — sphere self-rotates over uTime.
 *   • 11-octave noise reduced to 6 for real-time performance.
 *   • March steps reduced 16 → 12; shadow rays removed.
 *   • Misses → discard (transparent sky).
 *   • uColor uniform for per-spawn tinting.
 *   • uAlpha controls additive brightness (fade in/out).
 *   • Rendered on a 2×2 billboard PlaneGeometry (faces camera each frame).
 */

import * as THREE from 'three';

// ── Presets ────────────────────────────────────────────────────────────────────

export type NoiseSpherePreset =
  | 'fire'      // orange fireball / ability
  | 'ice'       // frosty blue
  | 'lightning' // electric yellow-white
  | 'void'      // dark purple
  | 'heal'      // soft green
  | 'damage'    // sharp red flash
  | 'impact';   // white burst

export const PRESET_COLORS: Record<NoiseSpherePreset, THREE.Color> = {
  fire:      new THREE.Color(3.0, 0.45, 0.10),
  ice:       new THREE.Color(0.15, 0.65, 3.0),
  lightning: new THREE.Color(3.0, 2.2, 0.30),
  void:      new THREE.Color(0.9, 0.05, 3.0),
  heal:      new THREE.Color(0.10, 3.0, 0.35),
  damage:    new THREE.Color(3.0, 0.05, 0.05),
  impact:    new THREE.Color(3.0, 3.0, 3.0),
};

// ── Shared geometry (2×2 square billboard) ────────────────────────────────────

const _planeGeo = new THREE.PlaneGeometry(2, 2);

// ── GLSL ─────────────────────────────────────────────────────────────────────

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/**
 * Adapted fire-sphere fragment shader (Shadertoy → Three.js).
 * Raycasts a noise-displaced sphere from UV-space into the billboard plane.
 * Pixels that miss the sphere → discard (transparent).
 * Additive blending → the shader only adds light, never darkens.
 */
const FRAG = /* glsl */ `
  uniform float uTime;
  uniform vec3  uColor;
  uniform float uAlpha;

  varying vec2 vUv;

  // ── Smooth-noise helpers ──────────────────────────────────────────────────

  float hash(vec3 p) {
    float h = dot(p, vec3(127.1, 311.7, 79.1));
    return fract(sin(h) * 43758.5453123);
  }

  float noise(in vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    vec3 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
    float v = mix(
      mix(mix(hash(i),             hash(i + vec3(1,0,0)), u.x),
          mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), u.x), u.y),
      mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), u.x),
          mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), u.x), u.y), u.z);
    v = v * 2.0 - 0.5;
    float cv = abs(cos(v));
    float sv = abs(sin(v));
    return mix(sv, cv, sv);
  }

  // 6 octaves (original had 11 — halved for real-time use)
  float noiseLayer(vec3 p) {
    float freq = 1.2;
    float v = 0.0, sum = 0.0;
    for (int i = 0; i < 6; i++) {
      float w = 1.0 / pow(freq, 1.0);
      v   += noise(p * freq) * w;
      sum += w;
      freq *= 1.8;
    }
    return v / sum;
  }

  // ── Rotation helpers ──────────────────────────────────────────────────────

  vec3 rotX(vec3 v, float t) {
    float c = cos(t), s = sin(t);
    return vec3(v.x, v.y*c - v.z*s, v.y*s + v.z*c);
  }
  vec3 rotY(vec3 v, float t) {
    float c = cos(t), s = sin(t);
    return vec3(v.x*c + v.z*s, v.y, -v.x*s + v.z*c);
  }

  // ── Sphere SDF with noise displacement ───────────────────────────────────

  const float DISP     = 0.70;
  const float DISP_OFF = 0.50;
  const float R0       = 0.60;

  float sdf(vec3 p) {
    float speed = uTime / 7.0;
    p = rotX(p, speed);
    p = rotY(p, speed);
    return noiseLayer(p + uTime / 70.0) - DISP_OFF;
  }

  vec3 calcNormal(vec3 pos, float eps) {
    vec2 e = vec2(eps, 0.0);
    return normalize(vec3(
      sdf(pos + e.xyy) - sdf(pos - e.xyy),
      sdf(pos + e.yxy) - sdf(pos - e.yxy),
      sdf(pos + e.yyx) - sdf(pos - e.yyx)
    ));
  }

  // ── Main ─────────────────────────────────────────────────────────────────

  void main() {
    // Billboard UV → square view-space [-1..1] × [-1..1]
    vec2 uv = (vUv - 0.5) * 2.0;

    const vec3 LD = vec3(1.0, 1.0, 0.5); // key-light direction

    float t = 0.0;
    float minD = 1.0;
    bool  hit  = false;
    vec3  color = vec3(0.0);

    // 12-step raymarch (original was 16; shadow pass removed)
    for (int r = 0; r < 12; r++) {
      vec3 p  = vec3(uv.x, uv.y, -2.0 + t);
      vec3 pp = normalize(p) * R0;
      float sp = R0 + sdf(pp) * DISP;
      float d  = length(p) - sp;
      minD = min(minD, d);

      if (d < 0.01) {
        float rf = float(r) / 12.0;

        vec3  n      = mix(calcNormal(pp, 0.1), calcNormal(pp, 10.0), 0.5);
        float diffuse = max(dot(n, -LD), 0.0) * 1.2;
        diffuse += pow(diffuse, 15.0) / 500.0;

        // Shadowed body (subtle blue-grey)
        color  = vec3(0.35, 0.44, 0.55) * diffuse;
        // Hot-core emissive — tinted by uColor
        color += uColor * pow(max(0.0, -sdf(pp) + 0.2), 3.0) * 9.0 * max(0.0, 1.0 - n.z);
        // Depth scatter glow — tinted by uColor
        color += uColor * pow(rf, 3.0) * 0.9;
        // Ambient fill
        color += max(dot(n, vec3(0.0, 0.5, 1.0)), 0.0) * 0.12 * vec3(0.35, 0.45, 0.65);

        hit = true;
        break;
      }

      if (t > 4.0) break;
      t += d;
    }

    if (!hit) discard;

    // Tone-map + apply fade alpha
    color = color / (color + 1.0) * 2.2;   // soft Reinhard
    gl_FragColor = vec4(color * uAlpha, 1.0);
  }
`;

// ── Internal sphere instance ───────────────────────────────────────────────────

interface LiveSphere {
  mesh:     THREE.Mesh;
  mat:      THREE.ShaderMaterial;
  age:      number;
  lifetime: number;
  fadeIn:   number;
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface NoiseSphereSpawnOpts {
  preset?:   NoiseSpherePreset;
  color?:    THREE.Color;
  radius?:   number;       // world-space radius, default 1.0
  lifetime?: number;       // seconds, default 1.5
  fadeIn?:   number;       // seconds for alpha fade-in, default 0.12
}

export class NoiseSphereVFX {
  private scene:  THREE.Scene;
  private active: LiveSphere[] = [];

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  /**
   * Spawn a noise sphere at the given position.
   * Returns the Three.js Mesh so callers can move it (e.g. as a projectile).
   */
  spawn(pos: THREE.Vector3, opts: NoiseSphereSpawnOpts = {}): THREE.Mesh {
    const color    = opts.color  ?? PRESET_COLORS[opts.preset ?? 'fire'].clone();
    const radius   = opts.radius   ?? 1.0;
    const lifetime = opts.lifetime ?? 1.5;
    const fadeIn   = opts.fadeIn   ?? 0.12;

    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime:  { value: 0 },
        uColor: { value: color },
        uAlpha: { value: 0 },
      },
      vertexShader:   VERT,
      fragmentShader: FRAG,
      transparent:    true,
      depthWrite:     false,
      blending:       THREE.AdditiveBlending,
    });

    const mesh = new THREE.Mesh(_planeGeo, mat);
    mesh.scale.setScalar(radius);
    mesh.position.copy(pos);
    mesh.renderOrder = 20;
    this.scene.add(mesh);

    this.active.push({ mesh, mat, age: 0, lifetime, fadeIn });
    return mesh;
  }

  /**
   * Quick helper: spawn a brief flash that auto-expires.
   * Useful for damage hits, ability impacts, etc.
   */
  flash(pos: THREE.Vector3, preset: NoiseSpherePreset, radius = 0.8): void {
    this.spawn(pos, { preset, radius, lifetime: 0.55, fadeIn: 0.05 });
  }

  /** Call once per frame. Updates uniforms, billboard rotation, and lifetime. */
  update(dt: number, camera: THREE.Camera): void {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const s = this.active[i];
      s.age += dt;

      const t = s.age / s.lifetime;
      let alpha: number;
      if (s.age < s.fadeIn) {
        alpha = s.age / s.fadeIn;
      } else {
        // Ease out over the last 40 % of lifetime
        const fadeT = Math.max(0, (t - 0.6) / 0.4);
        alpha = 1.0 - fadeT * fadeT * (3 - 2 * fadeT);
      }

      s.mat.uniforms.uTime.value  = s.age;
      s.mat.uniforms.uAlpha.value = Math.max(0, alpha);

      // Face the camera — billboard
      s.mesh.quaternion.copy(camera.quaternion);

      if (s.age >= s.lifetime) {
        this.scene.remove(s.mesh);
        s.mat.dispose();
        this.active.splice(i, 1);
      }
    }
  }

  /**
   * Immediately remove a specific sphere from tracking, freeing GPU resources.
   * Safe to call even if the mesh was already expired or not found.
   */
  kill(mesh: THREE.Mesh): void {
    const idx = this.active.findIndex(s => s.mesh === mesh);
    if (idx === -1) return;
    const s = this.active[idx];
    this.scene.remove(s.mesh);
    s.mat.dispose();
    this.active.splice(idx, 1);
  }

  get count(): number { return this.active.length; }

  dispose(): void {
    for (const s of this.active) {
      this.scene.remove(s.mesh);
      s.mat.dispose();
    }
    this.active = [];
  }
}
