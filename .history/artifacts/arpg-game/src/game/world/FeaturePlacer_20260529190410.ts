/**
 * FeaturePlacer — builds settlements, camps, cave entrances, and rock clusters
 * at the seeded positions from WorldGen.getSettlements().
 *
 * All geometry is procedural (no asset loads).  Buildings use MeshStandardMaterial
 * instances derived from shared palette objects to keep draw-calls low.
 */

import * as THREE from 'three';
import { getSettlements, SettlementDef, worldHeight } from './WorldGen';
import { LAYERS } from '../Layers';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import type RAPIER from '@dimforge/rapier3d-compat';

/**
 * Lightweight axis-Y rotation → quaternion helper for collider rotations.
 * Buildings rotate around the world up axis only, so a full Quaternion class
 * import is overkill — this returns the four scalars Rapier wants.
 */
function quatY(ry: number): { x: number; y: number; z: number; w: number } {
  const h = ry * 0.5;
  return { x: 0, y: Math.sin(h), z: 0, w: Math.cos(h) };
}

/**
 * Attach an upright cuboid collider for a box-shaped prop. `hw/hh/hd` are
 * half-extents (Three.js BoxGeometry is full-extent; we halve at call sites).
 */
function addCuboid(
  physics: PhysicsWorld,
  body: RAPIER.RigidBody,
  hw: number,
  hh: number,
  hd: number,
  x: number,
  y: number,
  z: number,
  ry = 0,
): void {
  const desc = physics.RAPIER.ColliderDesc.cuboid(hw, hh, hd)
    .setTranslation(x, y, z)
    .setRotation(quatY(ry));
  physics.world.createCollider(desc, body);
}

/**
 * Attach an upright cylinder collider. Rapier cylinders take `(halfHeight,
 * radius)` and stand along local Y by default — which matches the way
 * Three.js CylinderGeometry orients pillars/towers in FeaturePlacer.
 */
function addCylinder(
  physics: PhysicsWorld,
  body: RAPIER.RigidBody,
  halfHeight: number,
  radius: number,
  x: number,
  y: number,
  z: number,
): void {
  const desc = physics.RAPIER.ColliderDesc.cylinder(halfHeight, radius)
    .setTranslation(x, y, z);
  physics.world.createCollider(desc, body);
}

// ─── Shared material palette ──────────────────────────────────────────────────

const MAT: Record<string, THREE.Material> = {
  stone:    new THREE.MeshStandardMaterial({ color: 0x6a6472, roughness: 0.9, metalness: 0.02 }),
  wood:     new THREE.MeshStandardMaterial({ color: 0x4a3020, roughness: 0.95, metalness: 0.0 }),
  roof:     new THREE.MeshStandardMaterial({ color: 0x7a3825, roughness: 0.88, metalness: 0.0 }),
  tent:     new THREE.MeshStandardMaterial({ color: 0x5a4a30, roughness: 0.85, metalness: 0.0 }),
  fire:     new THREE.MeshBasicMaterial({ color: 0xff6a1a }),
  emissive: new THREE.MeshStandardMaterial({ color: 0xff6a1a, emissive: new THREE.Color(0xff4400), emissiveIntensity: 1.5, roughness: 0.5 }),
  dark:     new THREE.MeshStandardMaterial({ color: 0x1a1216, roughness: 0.95, metalness: 0.0 }),
  rock:     new THREE.MeshStandardMaterial({ color: 0x545060, roughness: 0.92, metalness: 0.03 }),
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function addMesh(
  scene: THREE.Scene,
  geo: THREE.BufferGeometry,
  mat: THREE.Material,
  x: number, y: number, z: number,
  ry = 0,
  sx = 1, sy = 1, sz = 1,
): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.y = ry;
  m.scale.set(sx, sy, sz);
  m.castShadow    = true;
  m.receiveShadow = true;
  m.layers.enable(LAYERS.WORLD);
  scene.add(m);
  return m;
}

// ─── Building primitives ──────────────────────────────────────────────────────

const GEO = {
  box:         (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d),
  roof:        (w: number, h: number, d: number) => new THREE.ConeGeometry(w * 0.72, h, 4),
  cylinder:    (r: number, h: number) => new THREE.CylinderGeometry(r, r, h, 8),
  dodecahedron: (r: number) => new THREE.DodecahedronGeometry(r, 0),
  cone:        (r: number, h: number) => new THREE.ConeGeometry(r, h, 5),
};

function placeBuilding(
  scene: THREE.Scene,
  bx: number,
  bz: number,
  physics: PhysicsWorld | null,
  body: RAPIER.RigidBody | null,
) {
  const h = worldHeight(bx, bz);
  const w = 5 + Math.random() * 4;
  const bh = 4 + Math.random() * 3;
  const d = 4 + Math.random() * 3;
  const ry = Math.random() * 0.5;

  // Walls
  addMesh(scene, GEO.box(w, bh, d), MAT.stone, bx, h + bh * 0.5, bz, ry);
  // Roof (purely decorative — the cuboid wall collider extends up to bh and
  // the player can't reach the apex on foot anyway).
  const roofH = 2.5 + Math.random();
  addMesh(scene, GEO.roof(w, roofH, d), MAT.roof, bx, h + bh + roofH * 0.5, bz, Math.PI / 4);
  // Door slab (rotation 0 — sits flush against the wall's south face).
  addMesh(scene, GEO.box(1.1, 2.2, 0.15), MAT.wood, bx, h + 1.1, bz + d * 0.5 + 0.05);

  if (physics && body) {
    // One cuboid for the wall block. We use the box half-extents directly;
    // the door slab is too thin to matter for collision (player passes
    // through it visually anyway since there's no door interaction here).
    addCuboid(physics, body, w * 0.5, bh * 0.5, d * 0.5, bx, h + bh * 0.5, bz, ry);
  }
}

function placeTent(scene: THREE.Scene, bx: number, bz: number) {
  const h = worldHeight(bx, bz);
  const ry = Math.random() * Math.PI * 2;
  addMesh(scene, GEO.cone(2.4, 4.0), MAT.tent, bx, h + 2.0, bz, ry);
  // Stake poles
  for (let s = 0; s < 4; s++) {
    const a = (s / 4) * Math.PI * 2 + ry;
    const px = bx + Math.cos(a) * 2.1;
    const pz = bz + Math.sin(a) * 2.1;
    addMesh(scene, GEO.cylinder(0.06, 1.4), MAT.wood, px, h + 0.7, pz);
  }
}

function placeCampfire(scene: THREE.Scene, bx: number, bz: number) {
  const h = worldHeight(bx, bz);
  // Stone ring
  for (let s = 0; s < 8; s++) {
    const a = (s / 8) * Math.PI * 2;
    const rx = bx + Math.cos(a) * 0.85;
    const rz = bz + Math.sin(a) * 0.85;
    addMesh(scene, GEO.dodecahedron(0.32), MAT.rock, rx, h + 0.18, rz);
  }
  // Logs
  for (let l = 0; l < 3; l++) {
    const a = (l / 3) * Math.PI;
    addMesh(scene, GEO.box(1.3, 0.18, 0.18), MAT.wood, bx, h + 0.12, bz, a);
  }
  // Flame
  const flame = addMesh(scene, GEO.cone(0.22, 0.55), MAT.emissive, bx, h + 0.4, bz);
  flame.userData.isCampFire = true;
  flame.userData.baseY = h + 0.4;
  // Light
  const fireLight = new THREE.PointLight(0xff7733, 6.0, 22, 2);
  fireLight.position.set(bx, h + 1.2, bz);
  fireLight.castShadow = false;
  scene.add(fireLight);
}

function placeCaveEntrance(
  scene: THREE.Scene,
  cx: number,
  cz: number,
  physics: PhysicsWorld | null,
  body: RAPIER.RigidBody | null,
) {
  const h = worldHeight(cx, cz);
  // Rock cluster framing the entrance
  const rocks = [
    { dx: -1.5, dz:  0.3, s: 2.4 },
    { dx:  1.5, dz: -0.2, s: 2.2 },
    { dx:  0.0, dz:  0.0, s: 1.4 },
    { dx: -2.5, dz:  0.8, s: 1.6 },
    { dx:  2.5, dz:  0.5, s: 1.8 },
    { dx: -0.8, dz: -1.5, s: 1.2 },
    { dx:  0.9, dz: -1.4, s: 1.3 },
  ];
  for (const r of rocks) {
    addMesh(scene, GEO.dodecahedron(r.s), MAT.rock, cx + r.dx, h + r.s * 0.5, cz + r.dz);
    if (physics && body) {
      // Dodecahedrons are roughly spherical; a cuboid ~85% of the radius
      // approximates the silhouette without poking past the visible hull.
      const hs = r.s * 0.85;
      addCuboid(physics, body, hs, r.s * 0.5, hs, cx + r.dx, h + r.s * 0.5, cz + r.dz);
    }
  }
  // Dark interior
  addMesh(scene, new THREE.PlaneGeometry(3.2, 2.8), MAT.dark, cx, h + 1.4, cz - 0.1);
  // Emit a subtle purple point light for atmosphere
  const caveLight = new THREE.PointLight(0x4400aa, 2.5, 18, 2);
  caveLight.position.set(cx, h + 1.5, cz);
  scene.add(caveLight);
}

function placeOutpost(
  scene: THREE.Scene,
  bx: number,
  bz: number,
  physics: PhysicsWorld | null,
  body: RAPIER.RigidBody | null,
) {
  const h = worldHeight(bx, bz);
  // Watch tower
  addMesh(scene, GEO.cylinder(1.8, 10), MAT.stone, bx, h + 5, bz);
  addMesh(scene, GEO.box(5, 1.2, 5), MAT.stone, bx, h + 10.6, bz);
  addMesh(scene, GEO.roof(5, 3, 5), MAT.roof, bx, h + 12.6, bz, Math.PI / 4);
  // Torch on top
  addMesh(scene, GEO.cylinder(0.07, 2), MAT.wood, bx + 2.2, h + 11.8, bz);
  const flame = addMesh(scene, GEO.cone(0.14, 0.38), MAT.emissive, bx + 2.2, h + 13.0, bz);
  flame.userData.isCampFire = true;
  flame.userData.baseY = h + 13.0;
  const tlight = new THREE.PointLight(0xff7733, 4.0, 16, 2);
  tlight.position.set(bx + 2.2, h + 13.5, bz);
  scene.add(tlight);

  if (physics && body) {
    // Tower trunk (10 m tall, radius 1.8 — matches the cylinder mesh).
    addCylinder(physics, body, 5, 1.8, bx, h + 5, bz);
    // Lookout platform (5×1.2×5 cuboid at the top). The torch + flame are
    // decorative and don't need collision.
    addCuboid(physics, body, 2.5, 0.6, 2.5, bx, h + 10.6, bz);
  }
}

// ─── Settlement builder ───────────────────────────────────────────────────────

function buildTown(
  scene: THREE.Scene,
  def: SettlementDef,
  physics: PhysicsWorld | null,
  body: RAPIER.RigidBody | null,
) {
  const { x, z } = def;
  const bCount = 5 + Math.floor(Math.random() * 4);

  // Central campfire (no collider — walkable scenery).
  placeCampfire(scene, x, z);

  // Buildings spread around the fire
  for (let i = 0; i < bCount; i++) {
    const angle  = (i / bCount) * Math.PI * 2 + 0.4;
    const radius = 10 + Math.random() * 12;
    const bx     = x + Math.cos(angle) * radius;
    const bz     = z + Math.sin(angle) * radius;
    placeBuilding(scene, bx, bz, physics, body);
  }

  // A couple extra tents (also walkable — canvas, not collision).
  for (let i = 0; i < 3; i++) {
    const angle  = Math.random() * Math.PI * 2;
    const radius = 16 + Math.random() * 8;
    placeTent(scene, x + Math.cos(angle) * radius, z + Math.sin(angle) * radius);
  }
}

function buildCamp(scene: THREE.Scene, def: SettlementDef) {
  const { x, z } = def;
  placeCampfire(scene, x, z);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const r = 6 + Math.random() * 4;
    placeTent(scene, x + Math.cos(a) * r, z + Math.sin(a) * r);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export class FeaturePlacer {
  private physics: PhysicsWorld | null;
  /** One shared static body holding every settlement collider. Single
   *  broad-phase node keeps overhead trivial even with hundreds of
   *  procedural buildings + rock clusters. */
  private body: RAPIER.RigidBody | null = null;

  constructor(private scene: THREE.Scene, physics: PhysicsWorld | null = null) {
    this.physics = physics;
  }

  buildAll() {
    if (this.physics && !this.body) {
      this.body = this.physics.world.createRigidBody(
        this.physics.RAPIER.RigidBodyDesc.fixed(),
      );
    }
    const settlements = getSettlements();
    for (const def of settlements) {
      switch (def.type) {
        case 'town': buildTown(this.scene, def, this.physics, this.body); break;
        case 'camp': buildCamp(this.scene, def); break;
        case 'cave': placeCaveEntrance(this.scene, def.x, def.z, this.physics, this.body); break;
        case 'outpost': placeOutpost(this.scene, def.x, def.z, this.physics, this.body); break;
      }
    }
  }

  /** Call each frame for animated campfire flames. */
  animateFlames(time: number) {
    this.scene.traverse((obj) => {
      if (obj.userData.isCampFire) {
        obj.position.y = obj.userData.baseY + Math.sin(time * 9 + obj.position.x) * 0.06;
        obj.scale.y = 0.75 + Math.sin(time * 12 + obj.position.z) * 0.25;
        obj.rotation.y = time * 4;
      }
    });
  }

  dispose() {
    for (const mat of Object.values(MAT)) mat.dispose();
  }
}
