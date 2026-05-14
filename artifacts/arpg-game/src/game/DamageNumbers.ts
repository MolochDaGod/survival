import * as THREE from 'three';
import { Text } from 'troika-three-text';

/**
 * Floating damage numbers — spawn at a world position, rise + fade out.
 * Uses troika-three-text for SDF-rendered text that stays crisp at all
 * camera distances. Pool-bounded so we never leak.
 *
 * GameEngine should call:
 *   damageNumbers.spawn(position, amount, isCrit)  on damage events
 *   damageNumbers.update(dt, camera)               every frame
 */

interface FloatingNum {
  text: InstanceType<typeof Text>;
  velocity: THREE.Vector3;
  age: number;
  lifetime: number;
}

const MAX_NUMBERS = 40;

export class DamageNumbers {
  private scene: THREE.Scene;
  private active: FloatingNum[] = [];
  /** Tmp vec reused in update() to avoid per-frame allocations. */
  private _tmp = new THREE.Vector3();

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  spawn(position: THREE.Vector3, amount: number, opts: { crit?: boolean; color?: number } = {}) {
    if (amount <= 0) return;
    // Pool cap: drop the oldest if we're at capacity.
    if (this.active.length >= MAX_NUMBERS) {
      const oldest = this.active.shift();
      if (oldest) this.disposeOne(oldest);
    }

    const t = new Text();
    t.text = opts.crit ? `${Math.round(amount)}!` : `${Math.round(amount)}`;
    t.fontSize = opts.crit ? 0.85 : 0.55;
    t.color = opts.color ?? (opts.crit ? 0xffeb3b : 0xff5252);
    t.outlineWidth = 0.04;
    t.outlineColor = 0x000000;
    t.anchorX = 'center';
    t.anchorY = 'middle';
    t.material.depthTest = false;
    t.material.depthWrite = false;
    t.renderOrder = 999;

    // Spawn slightly above and offset horizontally so multi-hits don't stack.
    t.position.set(
      position.x + (Math.random() - 0.5) * 0.6,
      position.y + 1.8,
      position.z + (Math.random() - 0.5) * 0.6,
    );
    t.sync();
    this.scene.add(t);

    this.active.push({
      text: t,
      velocity: new THREE.Vector3((Math.random() - 0.5) * 0.6, 1.8, (Math.random() - 0.5) * 0.6),
      age: 0,
      lifetime: opts.crit ? 1.4 : 1.0,
    });
  }

  /** Per-frame: integrate motion, billboard toward camera, fade out. */
  update(dt: number, camera: THREE.Camera) {
    const camPos = camera.getWorldPosition(this._tmp);
    for (let i = this.active.length - 1; i >= 0; i--) {
      const n = this.active[i];
      n.age += dt;
      const t = n.age / n.lifetime;

      n.text.position.addScaledVector(n.velocity, dt);
      // Slight gravity-like decel so the number "arcs".
      n.velocity.y -= 1.5 * dt;

      // Fade out via material opacity (troika exposes the underlying material).
      const mat = n.text.material as THREE.Material & { opacity?: number; transparent?: boolean };
      mat.transparent = true;
      mat.opacity = 1 - t * t;

      // Billboard so text always faces the camera.
      n.text.lookAt(camPos);

      if (t >= 1) {
        this.disposeOne(n);
        this.active.splice(i, 1);
      }
    }
  }

  private disposeOne(n: FloatingNum) {
    this.scene.remove(n.text);
    n.text.dispose();
  }

  dispose() {
    for (const n of this.active) this.disposeOne(n);
    this.active = [];
  }
}
