/**
 * PinataDebrisField — Valheim-style destructible debris for ability impacts.
 *
 * NOT ConvexObjectBreaker (demos only — skill threejs-helpers-physics-terrain).
 * Pattern matches BreakableWallSystem fragments: pooled cubes, gravity,
 * ground settle via groundY, fade dispose.
 *
 * Used by Linear skillshots (Cinder Fall, snare snap, frost shatter) and any
 * AoE impact that should "break" props/pinata targets in SI metres.
 */

import * as THREE from 'three';
import { groundY } from '../GroundSampler';

export type PinataMaterial = 'wood' | 'ice' | 'stone' | 'scrap' | 'ember';

export interface PinataBurstOpts {
  position: THREE.Vector3;
  /** Chunk count (capped by pool). Default 12. */
  count?: number;
  /** Impulse strength (m/s). Default 6. */
  impulse?: number;
  /** Chunk scale metres. Default 0.18. */
  size?: number;
  material?: PinataMaterial;
  color?: number;
  /** Lifetime seconds before fade. Default 2.2. */
  lifetime?: number;
  /** Upward bias on impulse. Default 0.55. */
  upBias?: number;
}

interface Chunk {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  angular: THREE.Vector3;
  age: number;
  lifetime: number;
  settled: boolean;
}

const POOL = 96;
const GRAVITY = -18; // m/s² SI

const MAT_COLORS: Record<PinataMaterial, number> = {
  wood: 0x8b5a2b,
  ice: 0xa8e6ff,
  stone: 0x888888,
  scrap: 0x6a7a8a,
  ember: 0xff5522,
};

export class PinataDebrisField {
  private scene: THREE.Scene;
  private pool: Chunk[] = [];
  private active: Chunk[] = [];
  private sharedGeo: THREE.BoxGeometry;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.sharedGeo = new THREE.BoxGeometry(1, 1, 1);
    for (let i = 0; i < POOL; i++) {
      const mat = new THREE.MeshStandardMaterial({
        color: 0x888888,
        roughness: 0.85,
        metalness: 0.05,
        transparent: true,
        opacity: 1,
      });
      const mesh = new THREE.Mesh(this.sharedGeo, mat);
      mesh.visible = false;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.frustumCulled = true;
      scene.add(mesh);
      this.pool.push({
        mesh,
        velocity: new THREE.Vector3(),
        angular: new THREE.Vector3(),
        age: 0,
        lifetime: 2,
        settled: false,
      });
    }
  }

  /**
   * Spawn a pinata burst at world position (SI metres).
   * Returns number of chunks actually spawned.
   */
  burst(opts: PinataBurstOpts): number {
    const count = Math.min(opts.count ?? 12, this.pool.length + this.active.length);
    const impulse = opts.impulse ?? 6;
    const size = opts.size ?? 0.18;
    const material = opts.material ?? 'stone';
    const color = opts.color ?? MAT_COLORS[material];
    const lifetime = opts.lifetime ?? 2.2;
    const upBias = opts.upBias ?? 0.55;
    let spawned = 0;

    for (let i = 0; i < count; i++) {
      let chunk = this.pool.pop();
      if (!chunk) {
        // Steal oldest active
        chunk = this.active.shift();
        if (!chunk) break;
        chunk.mesh.visible = false;
      }

      const theta = Math.random() * Math.PI * 2;
      const elev = Math.random() * Math.PI * 0.45 + 0.15;
      const speed = impulse * (0.55 + Math.random() * 0.7);
      chunk.velocity.set(
        Math.cos(theta) * Math.sin(elev) * speed,
        Math.cos(elev) * speed * upBias + impulse * 0.25,
        Math.sin(theta) * Math.sin(elev) * speed,
      );
      chunk.angular.set(
        (Math.random() - 0.5) * 12,
        (Math.random() - 0.5) * 12,
        (Math.random() - 0.5) * 12,
      );
      chunk.age = 0;
      chunk.lifetime = lifetime * (0.75 + Math.random() * 0.4);
      chunk.settled = false;

      const s = size * (0.6 + Math.random() * 0.8);
      chunk.mesh.scale.set(s, s * (0.5 + Math.random()), s);
      chunk.mesh.position.copy(opts.position);
      chunk.mesh.position.y += 0.15 + Math.random() * 0.3;
      chunk.mesh.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      const mat = chunk.mesh.material as THREE.MeshStandardMaterial;
      mat.color.setHex(color);
      mat.opacity = 1;
      mat.emissive?.setHex(material === 'ember' || material === 'ice' ? color : 0x000000);
      if (mat.emissive) mat.emissiveIntensity = material === 'ember' ? 0.6 : material === 'ice' ? 0.15 : 0;
      chunk.mesh.visible = true;
      this.active.push(chunk);
      spawned++;
    }
    return spawned;
  }

  /**
   * Burst along a line (frost path / storm burn) — several mini-pinatas.
   */
  burstAlongLine(
    origin: THREE.Vector3,
    dir: THREE.Vector3,
    distance: number,
    steps: number,
    opts: Omit<PinataBurstOpts, 'position'> = {},
  ): void {
    const d = dir.clone().normalize();
    const n = Math.max(2, steps);
    for (let i = 0; i < n; i++) {
      const t = (i + 1) / n;
      const p = origin.clone().addScaledVector(d, distance * t);
      p.y = groundY(p.x, p.z) + 0.2;
      this.burst({
        ...opts,
        position: p,
        count: opts.count ?? 4,
        impulse: (opts.impulse ?? 4) * (0.6 + t * 0.6),
      });
    }
  }

  update(dt: number): void {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const c = this.active[i];
      c.age += dt;
      if (c.age >= c.lifetime) {
        c.mesh.visible = false;
        this.active.splice(i, 1);
        this.pool.push(c);
        continue;
      }

      if (!c.settled) {
        c.velocity.y += GRAVITY * dt;
        c.mesh.position.addScaledVector(c.velocity, dt);
        c.mesh.rotation.x += c.angular.x * dt;
        c.mesh.rotation.y += c.angular.y * dt;
        c.mesh.rotation.z += c.angular.z * dt;

        const gy = groundY(c.mesh.position.x, c.mesh.position.z);
        const half = Math.max(c.mesh.scale.y, 0.05) * 0.5;
        if (c.mesh.position.y - half <= gy) {
          c.mesh.position.y = gy + half;
          if (Math.abs(c.velocity.y) < 1.2) {
            c.velocity.set(0, 0, 0);
            c.angular.multiplyScalar(0.2);
            c.settled = true;
          } else {
            c.velocity.y *= -0.35;
            c.velocity.x *= 0.55;
            c.velocity.z *= 0.55;
          }
        }
      }

      // Fade last 35% of life
      const fadeStart = c.lifetime * 0.65;
      if (c.age > fadeStart) {
        const u = 1 - (c.age - fadeStart) / (c.lifetime - fadeStart);
        (c.mesh.material as THREE.MeshStandardMaterial).opacity = Math.max(0, u);
      }
    }
  }

  dispose(): void {
    for (const c of [...this.active, ...this.pool]) {
      this.scene.remove(c.mesh);
      (c.mesh.material as THREE.Material).dispose();
    }
    this.active = [];
    this.pool = [];
    this.sharedGeo.dispose();
  }
}
