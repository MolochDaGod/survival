/**
 * ShockwaveVFX — expanding ring shockwave for AoE abilities.
 *
 * Inspired by annihilate-trainer's Pop.js: an expanding sphere/ring that
 * grows from the cast point and fades out. Used for whirlwind, ground
 * pound, and similar area attacks.
 *
 * Uses a torus geometry (flat ring) with additive blending. The ring
 * starts at scale 0 and expands to `radius` over `duration` seconds,
 * opacity fading from 0.6→0.
 *
 * Usage:
 *   const wave = new ShockwaveVFX(scene);
 *   wave.fire(worldPos, { radius: 4, color: 0x4fc3f7 });
 *   // every frame:
 *   wave.update(dt);
 */

import * as THREE from 'three';

export interface ShockwaveOptions {
  /** Max radius of the ring. Default 4. */
  radius?: number;
  /** Duration in seconds. Default 0.35. */
  duration?: number;
  /** Ring color. Default cyan. */
  color?: THREE.ColorRepresentation;
  /** Starting opacity. Default 0.6. */
  opacity?: number;
}

interface ShockwaveInstance {
  mesh: THREE.Mesh;
  age: number;
  duration: number;
  maxRadius: number;
}

const POOL_SIZE = 4;

export class ShockwaveVFX {
  private scene: THREE.Scene;
  private geometry: THREE.TorusGeometry;
  private pool: ShockwaveInstance[] = [];
  private active: ShockwaveInstance[] = [];

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    // Thin flat ring — major radius 1 (scaled at runtime), tube radius thin
    this.geometry = new THREE.TorusGeometry(1, 0.06, 6, 32);
    // Lay it flat on the XZ plane
    this.geometry.rotateX(Math.PI / 2);

    for (let i = 0; i < POOL_SIZE; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0x4fc3f7,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(this.geometry, mat);
      mesh.visible = false;
      mesh.renderOrder = 998;
      mesh.frustumCulled = false;
      scene.add(mesh);
      this.pool.push({ mesh, age: 0, duration: 0.35, maxRadius: 4 });
    }
  }

  fire(pos: THREE.Vector3, opts: ShockwaveOptions = {}): void {
    const radius   = opts.radius   ?? 4;
    const duration = opts.duration  ?? 0.35;
    const color    = opts.color    ?? 0x4fc3f7;
    const opacity  = opts.opacity  ?? 0.6;

    let inst = this.pool.pop();
    if (!inst) {
      if (this.active.length === 0) return;
      inst = this.active.shift()!;
    }

    const mat = inst.mesh.material as THREE.MeshBasicMaterial;
    mat.color.set(color);
    mat.opacity = opacity;
    inst.mesh.visible = true;
    inst.mesh.position.copy(pos);
    inst.mesh.position.y += 0.1; // slightly above ground
    inst.mesh.scale.setScalar(0.01);
    inst.age = 0;
    inst.duration = duration;
    inst.maxRadius = radius;

    this.active.push(inst);
  }

  update(dt: number): void {
    const toRemove: ShockwaveInstance[] = [];

    for (const inst of this.active) {
      inst.age += dt;
      const t = Math.min(inst.age / inst.duration, 1);

      // Scale: 0 → maxRadius with ease-out
      const scale = inst.maxRadius * (1 - (1 - t) * (1 - t));
      inst.mesh.scale.setScalar(scale);

      // Opacity: full → 0 with ease-out
      const mat = inst.mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.6 * (1 - t);

      if (t >= 1) toRemove.push(inst);
    }

    for (const inst of toRemove) {
      inst.mesh.visible = false;
      const idx = this.active.indexOf(inst);
      if (idx >= 0) this.active.splice(idx, 1);
      this.pool.push(inst);
    }
  }
}
