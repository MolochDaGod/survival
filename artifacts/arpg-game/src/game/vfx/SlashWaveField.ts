import * as THREE from 'three';

/**
 * Traveling slash / shockwave projectiles — Albion-weighty crescents along XZ.
 * Scale is tuned for human-height characters (~1.8m) in the 20 km world.
 */

export interface SlashWave {
  mesh: THREE.Mesh;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
  damage: number;
  radius: number;
  color: number;
  hitIds: Set<string>;
}

export class SlashWaveField {
  private scene: THREE.Scene;
  private waves: SlashWave[] = [];
  private geo: THREE.PlaneGeometry;
  private disposed = false;
  private onTrail?: (pos: THREE.Vector3, color: number, scale: number) => void;

  constructor(scene: THREE.Scene, onTrail?: (pos: THREE.Vector3, color: number, scale: number) => void) {
    this.scene = scene;
    this.onTrail = onTrail;
    this.geo = new THREE.PlaneGeometry(1.8, 0.55);
  }

  spawn(
    origin: THREE.Vector3,
    dir: THREE.Vector3,
    opts: {
      damage: number;
      range?: number;
      color?: number;
      radius?: number;
      speed?: number;
      /** World scale multiplier (1 = default human scale). */
      scale?: number;
    },
  ) {
    if (this.disposed) return;
    const color = opts.color ?? 0xffcc66;
    const range = opts.range ?? 12;
    const speed = opts.speed ?? 28;
    const scaleMul = opts.scale ?? 1;
    const d = dir.clone().setY(0);
    if (d.lengthSq() < 1e-6) d.set(0, 0, 1);
    d.normalize();

    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.92,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const mesh = new THREE.Mesh(this.geo, mat);
    const yLift = 1.15 * scaleMul;
    mesh.position.copy(origin).setY(yLift);
    mesh.rotation.y = Math.atan2(d.x, d.z);
    mesh.rotation.x = -0.35;
    mesh.scale.set(1.4 * scaleMul, 1.1 * scaleMul, 1);
    mesh.renderOrder = 5;
    this.scene.add(mesh);

    this.onTrail?.(origin.clone().setY(yLift), color, 0.6 * scaleMul);

    this.waves.push({
      mesh,
      pos: origin.clone().setY(yLift),
      vel: d.multiplyScalar(speed),
      life: 0,
      maxLife: range / speed,
      damage: opts.damage,
      radius: (opts.radius ?? 1.35) * scaleMul,
      color,
      hitIds: new Set(),
    });
  }

  update(
    delta: number,
    enemies: Array<{ id: string; position: THREE.Vector3; alive: boolean }>,
  ): Array<{ enemyId: string; damage: number; color: number }> {
    const hits: Array<{ enemyId: string; damage: number; color: number }> = [];
    for (let i = this.waves.length - 1; i >= 0; i--) {
      const w = this.waves[i]!;
      w.life += delta;
      w.pos.addScaledVector(w.vel, delta);
      w.mesh.position.copy(w.pos);
      const pulse = 1 + Math.sin(w.life * 28) * 0.08;
      const s = w.mesh.scale.x / 1.4;
      w.mesh.scale.set(1.4 * pulse * s, 1.1 * pulse * s, 1);
      const mat = w.mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.92 * Math.max(0, 1 - w.life / w.maxLife);

      if (Math.floor(w.life * 25) !== Math.floor((w.life - delta) * 25)) {
        this.onTrail?.(w.pos.clone(), w.color, 0.28);
      }

      for (const en of enemies) {
        if (!en.alive || w.hitIds.has(en.id)) continue;
        const d = Math.hypot(en.position.x - w.pos.x, en.position.z - w.pos.z);
        if (d <= w.radius + 0.6) {
          w.hitIds.add(en.id);
          hits.push({ enemyId: en.id, damage: w.damage, color: w.color });
        }
      }

      if (w.life >= w.maxLife) {
        this.scene.remove(w.mesh);
        mat.dispose();
        this.waves.splice(i, 1);
      }
    }
    return hits;
  }

  dispose() {
    this.disposed = true;
    for (const w of this.waves) {
      this.scene.remove(w.mesh);
      (w.mesh.material as THREE.Material).dispose();
    }
    this.waves = [];
    this.geo.dispose();
  }
}