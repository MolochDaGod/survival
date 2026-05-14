import * as THREE from 'three';

/**
 * GPU-friendly explosion system.
 *
 * Each explosion spawns:
 *   - one expanding shockwave shell (Mesh w/ shader)
 *   - one bright PointLight that fades in 0.4s
 *   - N debris particles (single Points object, additive, fades in 1.0s)
 *   - one ground scorch decal (transparent disc, fades in 2.0s)
 *
 * All buffers are reused per-burst (no allocations on the hot path beyond the
 * Points/Light/Mesh handles that the GC reclaims after dispose). One burst is
 * roughly 3 draw calls and ~256 verts.
 */

export interface ExplosionOpts {
  position: THREE.Vector3;
  /** World-space radius the shockwave expands to. */
  radius?: number;
  /** Tint hex. */
  color?: number;
  /** Particle count for the debris cloud. */
  particles?: number;
  /** Total lifetime in seconds. Per-effect components have their own decay curves. */
  lifetime?: number;
}

interface LiveExplosion {
  age: number;
  lifetime: number;
  shockwave: THREE.Mesh;
  shockwaveMat: THREE.ShaderMaterial;
  light: THREE.PointLight;
  points: THREE.Points;
  pointsMat: THREE.PointsMaterial;
  velocities: Float32Array;
  scorch: THREE.Mesh;
  scorchMat: THREE.MeshBasicMaterial;
  baseRadius: number;
}

export class ExplosionVFX {
  private scene: THREE.Scene;
  private active: LiveExplosion[] = [];

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  burst(opts: ExplosionOpts) {
    const radius = opts.radius ?? 3;
    const color = new THREE.Color(opts.color ?? 0xff7a22);
    const particleCount = opts.particles ?? 90;
    const lifetime = opts.lifetime ?? 1.4;

    // ---------- Shockwave (expanding hollow sphere shader) ----------
    const shellGeo = new THREE.SphereGeometry(0.3, 24, 16);
    const shellMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: color },
      },
      vertexShader: /* glsl */ `
        varying vec3 vNormal;
        varying vec3 vViewDir;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vViewDir = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform vec3 uColor;
        varying vec3 vNormal;
        varying vec3 vViewDir;
        void main() {
          // Fresnel rim — brightest at grazing angles
          float fres = 1.0 - max(dot(vNormal, vViewDir), 0.0);
          fres = pow(fres, 1.6);
          float pulse = 1.0 - smoothstep(0.0, 1.0, uTime);
          vec3 col = uColor * (1.5 + fres * 2.0) * pulse;
          gl_FragColor = vec4(col, fres * pulse * 0.85);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const shockwave = new THREE.Mesh(shellGeo, shellMat);
    shockwave.position.copy(opts.position);
    this.scene.add(shockwave);

    // ---------- Burst light ----------
    const light = new THREE.PointLight(color, 8, radius * 4, 2);
    light.position.copy(opts.position).add(new THREE.Vector3(0, 0.5, 0));
    this.scene.add(light);

    // ---------- Debris particles ----------
    const positions = new Float32Array(particleCount * 3);
    const velocities = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
      // Hemispherical distribution biased upward
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(1 - Math.random() * 1.4);
      const speed = 4 + Math.random() * 8;
      const dx = Math.sin(phi) * Math.cos(theta);
      const dy = Math.cos(phi);
      const dz = Math.sin(phi) * Math.sin(theta);

      positions[i * 3]     = opts.position.x;
      positions[i * 3 + 1] = opts.position.y + 0.2;
      positions[i * 3 + 2] = opts.position.z;

      velocities[i * 3]     = dx * speed;
      velocities[i * 3 + 1] = dy * speed + 2;
      velocities[i * 3 + 2] = dz * speed;
    }
    const ptsGeo = new THREE.BufferGeometry();
    ptsGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const pointsMat = new THREE.PointsMaterial({
      color,
      size: 0.22,
      transparent: true,
      opacity: 1.0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });
    const points = new THREE.Points(ptsGeo, pointsMat);
    this.scene.add(points);

    // ---------- Ground scorch ----------
    const scorchGeo = new THREE.CircleGeometry(radius * 0.9, 24);
    const scorchMat = new THREE.MeshBasicMaterial({
      color: 0x110806,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
    });
    const scorch = new THREE.Mesh(scorchGeo, scorchMat);
    scorch.rotation.x = -Math.PI / 2;
    scorch.position.set(opts.position.x, 0.04, opts.position.z);
    scorch.renderOrder = 1;
    this.scene.add(scorch);

    this.active.push({
      age: 0,
      lifetime,
      shockwave,
      shockwaveMat: shellMat,
      light,
      points,
      pointsMat,
      velocities,
      scorch,
      scorchMat,
      baseRadius: radius,
    });
  }

  update(dt: number) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const ex = this.active[i];
      ex.age += dt;
      const t = ex.age / ex.lifetime;

      // Shockwave: expand to baseRadius over first 60% of life, fade
      const shockT = Math.min(ex.age / (ex.lifetime * 0.6), 1.0);
      const scale = 0.3 + shockT * (ex.baseRadius - 0.3);
      ex.shockwave.scale.setScalar(scale);
      ex.shockwaveMat.uniforms.uTime.value = shockT;

      // Light decays sharply
      ex.light.intensity = Math.max(0, 8 * (1 - t * 2.5));

      // Particles physics + fade
      const pos = (ex.points.geometry.attributes.position as THREE.BufferAttribute);
      const arr = pos.array as Float32Array;
      const vel = ex.velocities;
      for (let p = 0; p < arr.length; p += 3) {
        arr[p]     += vel[p]     * dt;
        arr[p + 1] += vel[p + 1] * dt;
        arr[p + 2] += vel[p + 2] * dt;
        vel[p + 1] -= 14 * dt;            // gravity
        vel[p]     *= 1 - 0.6 * dt;       // air drag
        vel[p + 2] *= 1 - 0.6 * dt;
      }
      pos.needsUpdate = true;
      ex.pointsMat.opacity = Math.max(0, 1 - t * 1.2);
      ex.pointsMat.size = 0.22 * (1 - t * 0.4);

      // Scorch: settle, then slow fade
      ex.scorchMat.opacity = Math.max(0, 0.7 * (1 - t * 0.7));

      if (ex.age >= ex.lifetime) {
        this.scene.remove(ex.shockwave);
        this.scene.remove(ex.light);
        this.scene.remove(ex.points);
        this.scene.remove(ex.scorch);
        ex.shockwave.geometry.dispose();
        ex.shockwaveMat.dispose();
        ex.points.geometry.dispose();
        ex.pointsMat.dispose();
        ex.scorch.geometry.dispose();
        ex.scorchMat.dispose();
        this.active.splice(i, 1);
      }
    }
  }

  dispose() {
    for (const ex of this.active) {
      this.scene.remove(ex.shockwave);
      this.scene.remove(ex.light);
      this.scene.remove(ex.points);
      this.scene.remove(ex.scorch);
      ex.shockwaveMat.dispose();
      ex.pointsMat.dispose();
      ex.scorchMat.dispose();
    }
    this.active = [];
  }
}
