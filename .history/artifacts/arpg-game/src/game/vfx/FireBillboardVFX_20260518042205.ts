/**
 * FireBillboardVFX — animated FBM fire billboard for the fireball projectile
 * and area burning effects.
 *
 * Shader adapted from Shader.lab fire.glsl
 * (remix by BigWings / iq / others — originally from Shadertoy, MIT licence).
 *
 * The shader uses layered fractional Brownian motion (fBm) to produce a
 * convincingly animated flame that scrolls upward.  It renders on a
 * PlaneGeometry billboard that always faces the camera.
 *
 * Two modes:
 *
 *   1. `attachTo(mesh, scene, camera)` — returns a FireBillboard instance
 *      that follows a given mesh (e.g. a fireball projectile).
 *
 *   2. `burstAt(pos, scene, opts)` — spawns a one-shot fire burst at a
 *      fixed world position (e.g. ground impact).
 *
 * Call `update(dt, camera)` every frame on the FireBillboardVFX instance.
 *
 * Colour presets let callers reuse the same shader for
 * fire (orange), lava (deep red), plasma (cyan-violet), soul (white-blue).
 */

import * as THREE from 'three';

// ── Colour presets ────────────────────────────────────────────────────────────

export type FireColour = 'fire' | 'lava' | 'plasma' | 'soul' | 'venom';

const FIRE_TINT: Record<FireColour, THREE.Color> = {
  fire:   new THREE.Color(2.0, 0.45, 0.05),
  lava:   new THREE.Color(1.8, 0.15, 0.02),
  plasma: new THREE.Color(0.20, 1.20, 2.00),
  soul:   new THREE.Color(0.30, 0.70, 2.00),
  venom:  new THREE.Color(0.40, 2.00, 0.15),
};

// ── Shaders ───────────────────────────────────────────────────────────────────

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAG = /* glsl */ `
  // FBM fire billboard fragment shader.
  // Adapted from Shader.lab fire.glsl (MIT licence, BigWings / iq remixes).

  uniform float uTime;
  uniform float uAlpha;   // 0..1 overall opacity/fade
  uniform vec3  uColor;   // fire tint (HDR — values > 1 allowed)

  varying vec2 vUv;

  // ── Pseudo-random + noise helpers ─────────────────────────────────────────

  float rand2(vec2 n) {
    return fract(sin(cos(dot(n, vec2(12.9898, 12.1414)))) * 83758.5453);
  }

  float noise2(vec2 n) {
    const vec2 d = vec2(0.0, 1.0);
    vec2 b = floor(n);
    vec2 f = smoothstep(vec2(0.0), vec2(1.0), fract(n));
    return mix(
      mix(rand2(b),          rand2(b + d.yx), f.x),
      mix(rand2(b + d.xy),   rand2(b + d.yy), f.x),
      f.y
    );
  }

  // 5-octave fBm — original had 5 octaves, kept for real-time budget.
  float fbm(vec2 n) {
    float total = 0.0, amp = 1.0;
    for (int i = 0; i < 5; i++) {
      total += noise2(n) * amp;
      n      = n * 1.7 + n;
      amp   *= 0.47;
    }
    return total;
  }

  // ── Main ──────────────────────────────────────────────────────────────────

  void main() {
    vec2 uv = vUv;

    // Bias upward — flame is taller at the top of the quad.
    vec2 p = uv * 2.5;
    p += sin(p.yx * 4.0 + vec2( 0.2, -0.3) * uTime) * 0.04;
    p += sin(p.yx * 8.0 + vec2( 0.6,  0.1) * uTime) * 0.01;
    p.x -= uTime / 1.1;   // horizontal drift (scrolls the noise)

    // Layered fbm samples at different time offsets (matches fire.glsl)
    float q  = fbm(p - uTime * 0.30 + 1.00 * sin(uTime + 0.50) * 0.50);
    float qb = fbm(p - uTime * 0.40 + 0.10 * cos(uTime)        * 0.50);
    float q2 = fbm(p - uTime * 0.44 - 5.00 * cos(uTime)        * 0.50) - 6.0;
    float q3 = fbm(p - uTime * 0.90 - 10.0 * cos(uTime)        * 0.067) - 4.0;
    float q4 = fbm(p - uTime * 1.40 - 20.0 * sin(uTime)        * 0.071) + 2.0;
    q = (q + qb - 0.4 * q2 - 2.0 * q3 + 0.6 * q4) / 3.8;

    vec2 r = vec2(
      fbm(p + q * 0.5 + uTime * 0.10 - p.x - p.y),
      fbm(p + q       - uTime * 0.20)
    );

    // Fire intensity — inverse-fourth-power falloff (hot core, cool rim)
    float fireCore = 1.0 / (pow((r.y + r.y) * max(0.0, p.y) + 0.1, 4.0));

    // Shape mask: narrow X, gradient Y
    float mX = 1.0 - smoothstep(0.0, 0.25, abs(uv.x - 0.5) * 2.0);
    float mY = smoothstep(0.0, 0.12, uv.y) * (1.0 - smoothstep(0.65, 1.0, uv.y));
    float mask = mX * mY;

    vec3 col   = uColor * fireCore * mask;
    float lum  = dot(col, vec3(0.299, 0.587, 0.114));
    float alpha = clamp(lum * 0.9, 0.0, 1.0) * uAlpha;

    gl_FragColor = vec4(col, alpha);
  }
`;

// ── Per-billboard instance ────────────────────────────────────────────────────

export interface FireBillboardOpts {
  colour?:    FireColour;
  width?:     number;   // world units (default 1.5)
  height?:    number;   // world units (default 2.0)
  lifetime?:  number;   // seconds; 0 = persistent (default 0 = persistent)
  /** offset from the followed mesh's position */
  offset?:    THREE.Vector3;
}

interface BillboardInst {
  mesh:      THREE.Mesh;
  mat:       THREE.ShaderMaterial;
  age:       number;
  lifetime:  number;  // 0 = persistent
  follow?:   THREE.Object3D;
  offset:    THREE.Vector3;
}

// ── Main class ────────────────────────────────────────────────────────────────

export class FireBillboardVFX {
  private scene:   THREE.Scene;
  private active:  BillboardInst[] = [];

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  /**
   * Attach a persistent fire billboard to an object (e.g. a fireball mesh).
   * Returns the billboard mesh — store it to call `detach()` later.
   */
  attachTo(
    target:  THREE.Object3D,
    opts:    FireBillboardOpts = {},
  ): THREE.Mesh {
    return this._spawn(opts, target);
  }

  /**
   * Spawn a transient fire burst at a fixed world position.
   * Lifetime defaults to 1.2 s.
   */
  burstAt(
    pos:     THREE.Vector3,
    opts:    FireBillboardOpts = {},
  ): THREE.Mesh {
    const lifetime = opts.lifetime ?? 1.2;
    const mesh = this._spawn({ ...opts, lifetime }, undefined);
    mesh.position.copy(pos);
    return mesh;
  }

  /**
   * Detach and remove a billboard that was attached via `attachTo()`.
   * Call when the fireball projectile is destroyed before its natural end.
   */
  detach(mesh: THREE.Mesh) {
    const idx = this.active.findIndex(b => b.mesh === mesh);
    if (idx !== -1) {
      const b = this.active[idx];
      this.scene.remove(b.mesh);
      b.mesh.geometry.dispose();
      b.mat.dispose();
      this.active.splice(idx, 1);
    }
  }

  /** Call every frame. Camera is used for billboard orientation. */
  update(dt: number, camera: THREE.Camera) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const b = this.active[i];
      b.age += dt;

      // Track followed object
      if (b.follow) {
        b.mesh.position.copy(b.follow.position).add(b.offset);
      }

      // Always face camera (billboard)
      b.mesh.quaternion.copy(camera.quaternion);

      // Update time uniform
      b.mat.uniforms['uTime'].value = b.age;

      // Fade
      if (b.lifetime > 0) {
        const t     = b.age / b.lifetime;
        const fadeIn  = Math.min(t / 0.08, 1.0);
        const fadeOut = t > 0.75 ? 1.0 - (t - 0.75) / 0.25 : 1.0;
        b.mat.uniforms['uAlpha'].value = fadeIn * fadeOut;

        if (b.age >= b.lifetime) {
          this.scene.remove(b.mesh);
          b.mesh.geometry.dispose();
          b.mat.dispose();
          this.active.splice(i, 1);
        }
      }
    }
  }

  dispose() {
    for (const b of this.active) {
      this.scene.remove(b.mesh);
      b.mesh.geometry.dispose();
      b.mat.dispose();
    }
    this.active = [];
  }

  // ── Private ─────────────────────────────────────────────────────────────

  private _spawn(opts: FireBillboardOpts, follow: THREE.Object3D | undefined): THREE.Mesh {
    const colour   = opts.colour   ?? 'fire';
    const width    = opts.width    ?? 1.5;
    const height   = opts.height   ?? 2.0;
    const lifetime = opts.lifetime ?? 0;
    const offset   = opts.offset   ?? new THREE.Vector3(0, height * 0.5, 0);

    const mat = new THREE.ShaderMaterial({
      vertexShader:   VERT,
      fragmentShader: FRAG,
      uniforms: {
        uTime:  { value: 0 },
        uAlpha: { value: lifetime > 0 ? 0 : 1 },
        uColor: { value: FIRE_TINT[colour].clone() },
      },
      transparent: true,
      depthWrite:  false,
      blending:    THREE.AdditiveBlending,
      side:        THREE.DoubleSide,
    });

    const geo  = new THREE.PlaneGeometry(width, height, 1, 1);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;

    if (follow) {
      mesh.position.copy(follow.position).add(offset);
    }

    this.scene.add(mesh);
    this.active.push({ mesh, mat, age: 0, lifetime, follow, offset });
    return mesh;
  }
}
