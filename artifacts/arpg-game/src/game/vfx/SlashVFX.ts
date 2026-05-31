/**
 * SlashVFX — procedural melee impact slash flash.
 *
 * Inspired by annihilate-trainer's SwordBlink.js: a screen-facing billboard
 * arc that flashes at the weapon impact point and fades out over ~150ms.
 * No textures required — geometry is a thin curved plane with an additive
 * material whose opacity animates from 0.9→0 via manual tick().
 *
 * Usage:
 *   const slash = new SlashVFX(scene);
 *   // on melee hit:
 *   slash.fire(hitWorldPos, slashColor);
 *   // every frame:
 *   slash.update(dt, camera);
 */

import * as THREE from 'three';

interface SlashInstance {
  mesh: THREE.Mesh;
  age: number;
  lifetime: number;
}

const LIFETIME = 0.15; // seconds
const ARC_SEGMENTS = 12;
const ARC_RADIUS = 1.2;
const ARC_THICKNESS = 0.15;
const POOL_SIZE = 6;

function buildArcGeometry(): THREE.BufferGeometry {
  // Build a thin arc from -60° to +60° (120° sweep) in the XY plane.
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i <= ARC_SEGMENTS; i++) {
    const t = i / ARC_SEGMENTS;
    const angle = (-Math.PI / 3) + t * (2 * Math.PI / 3); // -60° to +60°
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    // Inner edge
    const ri = ARC_RADIUS - ARC_THICKNESS;
    positions.push(cos * ri, sin * ri, 0);
    uvs.push(t, 0);

    // Outer edge
    const ro = ARC_RADIUS + ARC_THICKNESS;
    positions.push(cos * ro, sin * ro, 0);
    uvs.push(t, 1);

    if (i < ARC_SEGMENTS) {
      const base = i * 2;
      indices.push(base, base + 1, base + 2);
      indices.push(base + 1, base + 3, base + 2);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

export class SlashVFX {
  private scene: THREE.Scene;
  private geometry: THREE.BufferGeometry;
  private pool: SlashInstance[] = [];
  private active: SlashInstance[] = [];

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.geometry = buildArcGeometry();

    // Pre-allocate a small pool of meshes
    for (let i = 0; i < POOL_SIZE; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(this.geometry, mat);
      mesh.visible = false;
      mesh.renderOrder = 999;
      mesh.frustumCulled = false;
      scene.add(mesh);
      this.pool.push({ mesh, age: 0, lifetime: LIFETIME });
    }
  }

  /**
   * Spawn a slash flash at a world position.
   * @param pos      World-space hit point
   * @param color    Slash tint (default white)
   * @param scale    Size multiplier (default 1)
   */
  fire(pos: THREE.Vector3, color: THREE.ColorRepresentation = 0xffffff, scale = 1.0): void {
    let inst = this.pool.pop();
    if (!inst) {
      // Pool exhausted — steal the oldest active one
      if (this.active.length === 0) return;
      inst = this.active.shift()!;
    }

    const mat = inst.mesh.material as THREE.MeshBasicMaterial;
    mat.color.set(color);
    mat.opacity = 0.9;
    inst.mesh.visible = true;
    inst.mesh.position.copy(pos);
    inst.mesh.position.y += 1.0; // chest height
    inst.mesh.scale.setScalar(scale);
    // Random rotation around Z for visual variety
    inst.mesh.rotation.z = Math.random() * Math.PI * 2;
    inst.age = 0;
    inst.lifetime = LIFETIME;

    this.active.push(inst);
  }

  /** Call every frame. Billboards active slashes toward the camera and fades them. */
  update(dt: number, camera: THREE.Camera): void {
    const toRemove: SlashInstance[] = [];

    for (const inst of this.active) {
      inst.age += dt;
      const t = Math.min(inst.age / inst.lifetime, 1);

      // Fade opacity: 0.9 → 0 with ease-out
      const mat = inst.mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.9 * (1 - t * t);

      // Scale grows slightly during the flash
      const s = inst.mesh.scale.x * (1 + t * 0.3);
      inst.mesh.scale.setScalar(s);

      // Billboard: face the camera
      inst.mesh.quaternion.copy(camera.quaternion);

      if (t >= 1) {
        toRemove.push(inst);
      }
    }

    for (const inst of toRemove) {
      inst.mesh.visible = false;
      const idx = this.active.indexOf(inst);
      if (idx >= 0) this.active.splice(idx, 1);
      this.pool.push(inst);
    }
  }
}
