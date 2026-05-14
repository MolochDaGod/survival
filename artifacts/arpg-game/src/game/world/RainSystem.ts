/**
 * RainSystem — GPU-driven rain for Grudge Nexus.
 *
 * Ported from the Three.js WebGPU compute-rain example to standard WebGL.
 * (Original: https://threejs.org/examples/#webgpu_compute_particles_rain)
 *
 * Architecture:
 *  • Rain drops  — N merged billboard quads (thin vertical planes) in a
 *    single draw call. Per-drop phase/offset packed as vertex attributes.
 *    Vertex shader bills-boards in view-space and animates fall via uTime.
 *  • Ground ripples — secondary merged geometry of flat circle-quads that
 *    expand and fade at the player's terrain level.
 *
 * No CPU iteration per-frame — only two uniform writes (uTime, uCameraPos).
 */

import * as THREE from 'three';

// ─── Constants ────────────────────────────────────────────────────────────────

const DROP_COUNT    = 7000;
const RIPPLE_COUNT  = 600;

const RAIN_RANGE    = 28;   // XZ radius around camera
const RAIN_HEIGHT   = 22;   // vertical fall distance
const DROP_W        = 0.035;
const DROP_H        = 0.55;
const RIPPLE_SIZE   = 1.8;
const RIPPLE_CYCLE  = 2.4;  // seconds for one ripple cycle

// ─── Vertex / Fragment shaders — Rain drops ──────────────────────────────────

const RAIN_VERT = /* glsl */ `
  attribute float aPhase;
  attribute float aSpeed;
  attribute float aOffX;
  attribute float aOffZ;
  attribute vec2  aLocal;   // corner offset in local space (x, y)

  uniform float uTime;
  uniform vec3  uCameraPos;
  uniform vec2  uWind;      // (xLean, zLean) per-second drift

  varying float vV;   // 0..1 vertical position within streak (0 = bottom)
  varying float vAlpha;

  const float HEIGHT = ${RAIN_HEIGHT.toFixed(1)};
  const float RANGE  = ${RAIN_RANGE.toFixed(1)};

  void main() {
    // Animate drop falling — phase shifts the starting height per drop
    float t = mod(aPhase + uTime * aSpeed, HEIGHT);

    float worldY = uCameraPos.y + HEIGHT * 0.62 - t;
    float worldX = uCameraPos.x + aOffX + uWind.x * t;
    float worldZ = uCameraPos.z + aOffZ + uWind.y * t;

    // Billboard: transform center to view space, apply local corner offsets there
    vec4 viewCenter = viewMatrix * vec4(worldX, worldY, worldZ, 1.0);
    viewCenter.x += aLocal.x;
    viewCenter.y += aLocal.y;

    vV     = (aLocal.y / (${(DROP_H).toFixed(3)}) + 0.5);
    // alpha: fades in near top (just respawned), slightly brighter mid-fall
    float fallFrac = t / HEIGHT;
    vAlpha = 0.08 + 0.22 * smoothstep(0.0, 0.15, fallFrac)
                         * (1.0 - smoothstep(0.85, 1.0, fallFrac));

    gl_Position = projectionMatrix * viewCenter;
  }
`;

const RAIN_FRAG = /* glsl */ `
  varying float vV;
  varying float vAlpha;

  void main() {
    // Horizontal fade makes the streak a sharp line
    // Vertical fade: bright at center-bottom of the streak
    float yFade  = smoothstep(0.0, 0.18, vV) * smoothstep(1.0, 0.55, vV);
    float alpha  = yFade * vAlpha;
    if (alpha < 0.005) discard;

    // Slightly blue-white rain color
    vec3 col = vec3(0.78, 0.90, 1.00);
    gl_FragColor = vec4(col, alpha);
  }
`;

// ─── Vertex / Fragment shaders — Ripples ─────────────────────────────────────

const RIPPLE_VERT = /* glsl */ `
  attribute float aPhase;
  attribute float aOffX;
  attribute float aOffZ;
  attribute vec2  aLocal;   // corner in local horizontal plane (x, z)

  uniform float uTime;
  uniform vec3  uCameraPos;
  uniform float uGroundY;

  varying float vRadius;  // 0..1 expansion
  varying vec2  vUV;

  const float CYCLE = ${RIPPLE_CYCLE.toFixed(2)};

  void main() {
    float t      = mod(aPhase + uTime, CYCLE) / CYCLE; // 0..1
    vRadius      = t;

    vUV = aLocal / ${(RIPPLE_SIZE * 0.5).toFixed(2)} * 0.5 + 0.5;

    float scale  = t * ${RIPPLE_SIZE.toFixed(2)};
    float worldX = uCameraPos.x + aOffX + aLocal.x * scale;
    float worldY = uGroundY + 0.04;
    float worldZ = uCameraPos.z + aOffZ + aLocal.y * scale;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(worldX, worldY, worldZ, 1.0);
  }
`;

const RIPPLE_FRAG = /* glsl */ `
  varying float vRadius;
  varying vec2  vUV;

  void main() {
    // Expanding ring SDF
    float d    = length(vUV - 0.5) * 2.0;   // 0 center, 1 edge
    float ring = 1.0 - abs(d - 0.7) * 8.0;  // thin ring at r=0.7
    ring       = max(0.0, ring);

    float fade = (1.0 - vRadius) * (1.0 - smoothstep(0.0, 0.25, vRadius));
    float a    = ring * fade * 0.35;
    if (a < 0.01) discard;

    gl_FragColor = vec4(0.7, 0.85, 1.0, a);
  }
`;

// ─── Geometry builders ────────────────────────────────────────────────────────

function buildRainGeometry(): THREE.BufferGeometry {
  const verts    = new Float32Array(DROP_COUNT * 4 * 3);
  const phases   = new Float32Array(DROP_COUNT * 4);
  const speeds   = new Float32Array(DROP_COUNT * 4);
  const offXs    = new Float32Array(DROP_COUNT * 4);
  const offZs    = new Float32Array(DROP_COUNT * 4);
  const locals   = new Float32Array(DROP_COUNT * 4 * 2);
  const idxArr   = new Uint32Array(DROP_COUNT * 6);

  // Pre-baked corners in local (view) space
  const corners = [
    [-DROP_W * 0.5, -DROP_H * 0.5],
    [ DROP_W * 0.5, -DROP_H * 0.5],
    [-DROP_W * 0.5,  DROP_H * 0.5],
    [ DROP_W * 0.5,  DROP_H * 0.5],
  ] as const;

  for (let i = 0; i < DROP_COUNT; i++) {
    const phase = Math.random() * RAIN_HEIGHT;
    const speed = 9 + Math.random() * 5;
    const ox    = (Math.random() - 0.5) * RAIN_RANGE * 2;
    const oz    = (Math.random() - 0.5) * RAIN_RANGE * 2;

    const vi = i * 4;
    for (let c = 0; c < 4; c++) {
      const idx = (vi + c) * 3;
      verts[idx]     = 0; verts[idx+1] = 0; verts[idx+2] = 0;
      phases[vi + c] = phase;
      speeds[vi + c] = speed;
      offXs[vi + c]  = ox;
      offZs[vi + c]  = oz;
      locals[(vi + c) * 2]     = corners[c][0];
      locals[(vi + c) * 2 + 1] = corners[c][1];
    }

    const ii = i * 6;
    idxArr[ii]   = vi;     idxArr[ii+1] = vi + 1; idxArr[ii+2] = vi + 2;
    idxArr[ii+3] = vi + 1; idxArr[ii+4] = vi + 3; idxArr[ii+5] = vi + 2;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
  geo.setAttribute('aPhase',   new THREE.BufferAttribute(phases, 1));
  geo.setAttribute('aSpeed',   new THREE.BufferAttribute(speeds, 1));
  geo.setAttribute('aOffX',    new THREE.BufferAttribute(offXs, 1));
  geo.setAttribute('aOffZ',    new THREE.BufferAttribute(offZs, 1));
  geo.setAttribute('aLocal',   new THREE.BufferAttribute(locals, 2));
  geo.setIndex(new THREE.BufferAttribute(idxArr, 1));
  return geo;
}

function buildRippleGeometry(): THREE.BufferGeometry {
  // Each ripple is a flat horizontal quad
  const corners = [
    [-1, -1], [1, -1], [-1, 1], [1, 1],
  ] as const;

  const verts    = new Float32Array(RIPPLE_COUNT * 4 * 3);
  const phases   = new Float32Array(RIPPLE_COUNT * 4);
  const offXs    = new Float32Array(RIPPLE_COUNT * 4);
  const offZs    = new Float32Array(RIPPLE_COUNT * 4);
  const locals   = new Float32Array(RIPPLE_COUNT * 4 * 2);
  const idxArr   = new Uint32Array(RIPPLE_COUNT * 6);

  for (let i = 0; i < RIPPLE_COUNT; i++) {
    const phase = Math.random() * RIPPLE_CYCLE;
    const ox    = (Math.random() - 0.5) * RAIN_RANGE * 2;
    const oz    = (Math.random() - 0.5) * RAIN_RANGE * 2;

    const vi = i * 4;
    for (let c = 0; c < 4; c++) {
      const idx = (vi + c) * 3;
      verts[idx] = 0; verts[idx+1] = 0; verts[idx+2] = 0;
      phases[vi + c] = phase;
      offXs[vi + c]  = ox;
      offZs[vi + c]  = oz;
      locals[(vi + c) * 2]     = corners[c][0];
      locals[(vi + c) * 2 + 1] = corners[c][1];
    }

    const ii = i * 6;
    idxArr[ii]   = vi;     idxArr[ii+1] = vi + 1; idxArr[ii+2] = vi + 2;
    idxArr[ii+3] = vi + 1; idxArr[ii+4] = vi + 3; idxArr[ii+5] = vi + 2;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
  geo.setAttribute('aPhase',   new THREE.BufferAttribute(phases, 1));
  geo.setAttribute('aOffX',    new THREE.BufferAttribute(offXs, 1));
  geo.setAttribute('aOffZ',    new THREE.BufferAttribute(offZs, 1));
  geo.setAttribute('aLocal',   new THREE.BufferAttribute(locals, 2));
  geo.setIndex(new THREE.BufferAttribute(idxArr, 1));
  return geo;
}

// ─── RainSystem ───────────────────────────────────────────────────────────────

export class RainSystem {
  private scene:      THREE.Scene;
  private dropMesh:   THREE.Mesh;
  private rippleMesh: THREE.Mesh;
  private dropMat:    THREE.ShaderMaterial;
  private rippleMat:  THREE.ShaderMaterial;

  private _time     = Math.random() * 100; // random start so multiple instances differ
  private _enabled  = true;

  /** Wind direction (units/second lateral drift applied to drops). */
  wind = new THREE.Vector2(0.4, 0.15);

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    // ── Rain drops ──────────────────────────────────────────────────────────
    this.dropMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime:      { value: 0 },
        uCameraPos: { value: new THREE.Vector3() },
        uWind:      { value: this.wind },
      },
      vertexShader:   RAIN_VERT,
      fragmentShader: RAIN_FRAG,
      transparent: true,
      depthWrite:  false,
      depthTest:   true,
      side:        THREE.DoubleSide,
      blending:    THREE.AdditiveBlending,
    });

    this.dropMesh = new THREE.Mesh(buildRainGeometry(), this.dropMat);
    this.dropMesh.frustumCulled = false;
    this.dropMesh.renderOrder   = 900;
    scene.add(this.dropMesh);

    // ── Ground ripples ──────────────────────────────────────────────────────
    this.rippleMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime:      { value: 0 },
        uCameraPos: { value: new THREE.Vector3() },
        uGroundY:   { value: 0 },
      },
      vertexShader:   RIPPLE_VERT,
      fragmentShader: RIPPLE_FRAG,
      transparent: true,
      depthWrite:  false,
      depthTest:   true,
      side:        THREE.DoubleSide,
      blending:    THREE.AdditiveBlending,
    });

    this.rippleMesh = new THREE.Mesh(buildRippleGeometry(), this.rippleMat);
    this.rippleMesh.frustumCulled = false;
    this.rippleMesh.renderOrder   = 901;
    scene.add(this.rippleMesh);
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  get enabled(): boolean { return this._enabled; }
  set enabled(v: boolean) {
    this._enabled            = v;
    this.dropMesh.visible    = v;
    this.rippleMesh.visible  = v;
  }

  /**
   * Call each frame.
   * @param dt        delta-time in seconds
   * @param cameraPos current camera world position
   * @param groundY   terrain Y at camera XZ (used for ripple placement)
   */
  update(dt: number, cameraPos: THREE.Vector3, groundY: number): void {
    if (!this._enabled) return;

    this._time += dt;

    const du = this.dropMat.uniforms;
    du.uTime.value = this._time;
    du.uCameraPos.value.copy(cameraPos);

    const ru = this.rippleMat.uniforms;
    ru.uTime.value = this._time;
    ru.uCameraPos.value.copy(cameraPos);
    ru.uGroundY.value = groundY;
  }

  dispose(): void {
    this.scene.remove(this.dropMesh);
    this.scene.remove(this.rippleMesh);
    this.dropMesh.geometry.dispose();
    this.rippleMesh.geometry.dispose();
    this.dropMat.dispose();
    this.rippleMat.dispose();
  }
}
