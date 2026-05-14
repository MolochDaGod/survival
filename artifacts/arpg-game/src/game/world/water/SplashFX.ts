/**
 * SplashFX — pooled expanding-ring + droplet bursts triggered when an
 * entity crosses the water surface.
 *
 * No texture, no GLB, no allocation per call after warm-up. A fixed pool
 * of `MAX_RINGS` ring meshes is created up front; calling `splash(pos)`
 * grabs the oldest free slot, resets its scale + alpha, and animates it
 * outward over `LIFETIME` seconds.
 *
 * Designed to be ticked from `SceneBuilder.update()` alongside the water
 * surface so ring time and water time stay coherent.
 */

import * as THREE from 'three';
import { LAYERS, setLayerRecursive } from '../../Layers';

const MAX_RINGS = 16;
const LIFETIME  = 0.6;       // seconds
const MAX_RADIUS = 4.0;      // metres at end of life
const RING_INNER = 0.5;
const RING_OUTER = 0.7;

interface RingSlot {
  mesh:   THREE.Mesh;
  mat:    THREE.MeshBasicMaterial;
  age:    number;     // 0..LIFETIME, or > LIFETIME = inactive
  scale0: number;
}

export class SplashFX {
  private scene: THREE.Scene;
  private rings: RingSlot[] = [];
  private group: THREE.Group;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'SplashFX';
    scene.add(this.group);
    // Render-only — keep splash rings off camera-occlusion / minimap
    // raycasts. Every ring spawned later inherits this from the group
    // when added, but we also enforce it on each ring on creation below.
    setLayerRecursive(this.group, LAYERS.VFX);

    const geo = new THREE.RingGeometry(RING_INNER, RING_OUTER, 32);
    geo.rotateX(-Math.PI / 2); // lie flat on the water plane

    for (let i = 0; i < MAX_RINGS; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xdde9f3,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.layers.set(LAYERS.VFX);
      mesh.visible = false;
      mesh.renderOrder = 2;
      this.group.add(mesh);
      this.rings.push({ mesh, mat, age: LIFETIME + 1, scale0: 1 });
    }
  }

  /** Trigger a splash ring at world position. Intensity scales the final
   *  radius — call with > 1 for boats / heavy entities. */
  splash(pos: THREE.Vector3, intensity: number = 1): void {
    const slot = this.acquire();
    if (!slot) return;
    slot.mesh.position.copy(pos);
    slot.mesh.position.y += 0.02; // slight lift so it doesn't z-fight the water
    slot.scale0 = Math.max(0.6, Math.min(2.5, intensity));
    slot.mesh.scale.set(slot.scale0, slot.scale0, slot.scale0);
    slot.mat.opacity = 0.85;
    slot.age = 0;
    slot.mesh.visible = true;
  }

  update(dt: number): void {
    for (const r of this.rings) {
      if (r.age > LIFETIME) continue;
      r.age += dt;
      const t = Math.min(1, r.age / LIFETIME);
      const radius = THREE.MathUtils.lerp(r.scale0, MAX_RADIUS * r.scale0, t);
      r.mesh.scale.set(radius, radius, radius);
      r.mat.opacity = 0.85 * (1 - t);
      if (r.age >= LIFETIME) {
        r.mesh.visible = false;
      }
    }
  }

  private acquire(): RingSlot | null {
    // Free slot first
    for (const r of this.rings) {
      if (r.age > LIFETIME) return r;
    }
    // Else recycle the oldest
    let oldest = this.rings[0]!;
    for (const r of this.rings) {
      if (r.age > oldest.age) oldest = r;
    }
    return oldest;
  }

  dispose(): void {
    this.scene.remove(this.group);
    for (const r of this.rings) {
      r.mesh.geometry.dispose();
      r.mat.dispose();
    }
    this.rings = [];
  }
}
