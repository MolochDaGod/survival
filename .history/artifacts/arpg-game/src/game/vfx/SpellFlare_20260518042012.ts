/**
 * SpellFlare — procedural full-screen lens flare for ability casts.
 *
 * Shader adapted from Shader.lab lensflare.glsl
 * (original by yiwenl on Shadertoy — MIT licence).
 *
 * Rendering approach:
 *   • A 2×2 PlaneGeometry with a clip-space vertex shader fills the whole
 *     screen regardless of depth or camera state.
 *   • AdditiveBlending + depthTest:false means it brightens the scene,
 *     never occludes anything.
 *   • The flare origin (uPos) is computed every frame from a world-space
 *     Vector3 projected through the camera.
 *
 * Usage:
 *   const flare = new SpellFlare(scene);
 *   // in your game loop, call each frame:
 *   flare.update(dt, camera);
 *   // to trigger a flash on ability cast:
 *   flare.trigger(worldPos, spellType);  // 'fire' | 'ice' | 'lightning' | 'arcane' | 'heal'
 */

import * as THREE from 'three';

// ── Color presets (LDR additive – values > 1 are intentional for glow) ───────

export type FlareType = 'fire' | 'ice' | 'lightning' | 'arcane' | 'heal' | 'default';

const FLARE_COLORS: Record<FlareType, THREE.Color> = {
  fire:      new THREE.Color(2.0, 0.6, 0.1),
  ice:       new THREE.Color(0.2, 0.8, 2.0),
  lightning: new THREE.Color(2.5, 2.2, 0.4),
  arcane:    new THREE.Color(0.8, 0.2, 2.0),
  heal:      new THREE.Color(0.2, 2.0, 0.5),
  default:   new THREE.Color(2.0, 1.8, 1.4),
};

// ── Shaders ───────────────────────────────────────────────────────────────────

const VERT = /* glsl */ `
  varying vec2 vNdc;
  void main() {
    // Place quad directly in clip space — fills the entire viewport.
    vNdc = position.xy;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const FRAG = /* glsl */ `
  // Lens-flare fragment shader.
  // Adapted from Shader.lab lensflare.glsl (MIT licence, yiwenl / Shadertoy).

  uniform vec2  uPos;     // flare centre, NDC [-1..1] y-up, already aspect-corrected
  uniform float uAlpha;   // 0..1 fade envelope
  uniform vec3  uColor;   // HDR tint
  uniform float uAspect;  // viewport width / height

  varying vec2 vNdc;      // interpolated NDC position of this pixel

  // ── Simple hash-based "noise" lookup ─────────────────────────────────────
  float hashF(float t) {
    return fract(sin(t * 12345.564) * 7658.76);
  }

  // ── Core flare function (ported verbatim from lensflare.glsl) ────────────
  vec3 lensflare(vec2 uv, vec2 pos) {
    vec2 main = uv - pos;
    vec2 uvd  = uv * length(uv);

    float ang  = atan(main.x, main.y);
    float dist = length(main);
    dist = pow(max(dist, 1e-4), 0.1);

    float f0 = 1.0 / (length(uv - pos) * 16.0 + 1.0);
    f0 = f0 + f0 * (sin(hashF((pos.x + pos.y) * 2.2 + ang * 4.0 + 5.954) * 16.0)
                    * 0.1 + dist * 0.1 + 0.8);

    float f1  = max(0.01 - pow(length(uv  + 1.200 * pos), 1.9), 0.0) * 7.0;

    float f2  = max(1.0 / (1.0 + 32.0 * pow(length(uvd + 0.800 * pos), 2.0)), 0.0) * 0.25;
    float f22 = max(1.0 / (1.0 + 32.0 * pow(length(uvd + 0.850 * pos), 2.0)), 0.0) * 0.23;
    float f23 = max(1.0 / (1.0 + 32.0 * pow(length(uvd + 0.900 * pos), 2.0)), 0.0) * 0.21;

    vec2 uvx = mix(uv, uvd, -0.5);
    float f4  = max(0.01 - pow(length(uvx + 0.400 * pos), 2.4), 0.0) * 6.0;
    float f42 = max(0.01 - pow(length(uvx + 0.450 * pos), 2.4), 0.0) * 5.0;
    float f43 = max(0.01 - pow(length(uvx + 0.500 * pos), 2.4), 0.0) * 3.0;

    uvx = mix(uv, uvd, -0.4);
    float f5  = max(0.01 - pow(length(uvx + 0.200 * pos), 5.5), 0.0) * 2.0;
    float f52 = max(0.01 - pow(length(uvx + 0.400 * pos), 5.5), 0.0) * 2.0;
    float f53 = max(0.01 - pow(length(uvx + 0.600 * pos), 5.5), 0.0) * 2.0;

    uvx = mix(uv, uvd, -0.5);
    float f6  = max(0.01 - pow(length(uvx - 0.300  * pos), 1.6), 0.0) * 6.0;
    float f62 = max(0.01 - pow(length(uvx - 0.3250 * pos), 1.6), 0.0) * 3.0;
    float f63 = max(0.01 - pow(length(uvx - 0.350  * pos), 1.6), 0.0) * 5.0;

    vec3 c  = vec3(0.0);
    c.r += f2  + f4  + f5  + f6;
    c.g += f22 + f42 + f52 + f62;
    c.b += f23 + f43 + f53 + f63;
    c    = c * 1.3 - vec3(length(uvd) * 0.05);
    c   += vec3(f0);
    c   += vec3(f1);
    return max(c, vec3(0.0));
  }

  void main() {
    // Apply aspect ratio so the flare is circular in screen space.
    vec2 uv  = vNdc;
    uv.x    *= uAspect;
    vec2 pos = uPos;
    pos.x   *= uAspect;

    vec3 col   = lensflare(uv, pos) * uColor * uAlpha;
    float lum  = dot(col, vec3(0.299, 0.587, 0.114));
    float alpha = min(lum * 0.8, 1.0);

    gl_FragColor = vec4(col, alpha);
  }
`;

// ── Flare instance state ──────────────────────────────────────────────────────

interface FlareInstance {
  worldPos: THREE.Vector3;
  age: number;
  lifetime: number;
  color: THREE.Color;
}

// ── Class ─────────────────────────────────────────────────────────────────────

export class SpellFlare {
  private mesh:    THREE.Mesh;
  private mat:     THREE.ShaderMaterial;
  private active:  FlareInstance[] = [];
  private _ndc = new THREE.Vector3();

  constructor(scene: THREE.Scene) {
    // Full-screen 2×2 quad — geometry is in clip space, vertex shader bypasses MVP.
    const geo = new THREE.PlaneGeometry(2, 2);

    this.mat = new THREE.ShaderMaterial({
      vertexShader:   VERT,
      fragmentShader: FRAG,
      uniforms: {
        uPos:    { value: new THREE.Vector2(0, 0) },
        uAlpha:  { value: 0.0 },
        uColor:  { value: new THREE.Color(2.0, 1.8, 1.4) },
        uAspect: { value: 1.0 },
      },
      transparent:  true,
      depthTest:    false,
      depthWrite:   false,
      blending:     THREE.AdditiveBlending,
    });

    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder   = 9999;
    this.mesh.visible       = false;
    scene.add(this.mesh);
  }

  /**
   * Trigger a lens flare burst at a world-space position.
   * The flare auto-fades over `lifetime` seconds.
   */
  trigger(worldPos: THREE.Vector3, type: FlareType = 'default', lifetime = 0.45) {
    this.active.push({
      worldPos: worldPos.clone(),
      age:      0,
      lifetime,
      color:    FLARE_COLORS[type].clone(),
    });
  }

  /**
   * Call once per frame.  Camera is used to project the flare world-pos
   * to NDC for the shader uniform.
   */
  update(dt: number, camera: THREE.Camera) {
    if (this.active.length === 0) {
      this.mesh.visible = false;
      return;
    }

    // Advance ages and cull dead instances
    this.active = this.active.filter(inst => {
      inst.age += dt;
      return inst.age < inst.lifetime;
    });

    if (this.active.length === 0) {
      this.mesh.visible = false;
      return;
    }

    // Use the most-recently triggered flare for rendering
    const inst = this.active[this.active.length - 1];

    // Project world position to NDC
    this._ndc.copy(inst.worldPos);
    this._ndc.project(camera);

    const t      = inst.age / inst.lifetime;
    // Quick ramp-in (0→0.1 normalised) then smooth fade-out
    const fadeIn  = Math.min(t / 0.1, 1.0);
    const fadeOut = 1.0 - t;
    const alpha   = fadeIn * fadeOut * 1.6;  // >1 allowed — clamped in shader

    const aspect = (camera as THREE.PerspectiveCamera).aspect ?? 1.0;

    this.mat.uniforms['uPos'].value.set(this._ndc.x, this._ndc.y);
    this.mat.uniforms['uAlpha'].value  = Math.max(0, alpha);
    this.mat.uniforms['uColor'].value.copy(inst.color);
    this.mat.uniforms['uAspect'].value = aspect;

    this.mesh.visible = true;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mat.dispose();
  }
}
