/**
 * GroundDetailSystem — three-layer ground cover that streams with terrain chunks.
 *
 * Inspired by infinite-terrain layering demos (e.g. SimonStorlSchulke threejs-examples
 * terrain scenes): heightfield first, then stacked detail layers that sell scale.
 *
 * Layers (bottom → top conceptually; all sit on worldHeight):
 *   1. Grass      — existing GrassSystem (shader blades, player push)
 *   2. Rocks      — low-poly pebbles / stones (this system)
 *   3. Sticks     — twigs / branches on forest floors (this system)
 *
 * Plus optional:
 *   4. Debris     — leaf-litter / dirt clods (small flat discs)
 *
 * Design mirrors GrassSystem:
 *   • One InstancedMesh set per chunk key
 *   • Biome-filtered placement via WorldGen
 *   • No raycast / no shadows on micro-detail (cheap)
 *   • buildChunk / destroyChunk hooked from WorldChunkManager
 *
 * Textures: materials use solid colours with slight instance tint so we
 * don't need extra GPU maps; terrain splat (grass/sand/stone/snow) stays
 * on BiomeTerrainMaterial.
 */

import * as THREE from 'three';
import { worldHeight, getBiome, Biome } from './WorldGen';

// ── Density (per 512 m chunk) ───────────────────────────────────────────────
const ROCKS_PER_CHUNK = 420;
const STICKS_PER_CHUNK = 380;
const DEBRIS_PER_CHUNK = 520;

// ── Shared geometry / materials (one set for the whole world) ───────────────

let _rockGeo: THREE.BufferGeometry | null = null;
let _stickGeo: THREE.BufferGeometry | null = null;
let _debrisGeo: THREE.BufferGeometry | null = null;
let _rockMat: THREE.MeshStandardMaterial | null = null;
let _stickMat: THREE.MeshStandardMaterial | null = null;
let _debrisMat: THREE.MeshStandardMaterial | null = null;
let _refCount = 0;

function acquireShared() {
  _refCount++;
  if (!_rockGeo) {
    // Faceted low-poly pebble (reads as rock, not smooth marble)
    _rockGeo = new THREE.IcosahedronGeometry(0.18, 0);
    _rockGeo.scale(1.1, 0.55, 0.95);
  }
  if (!_stickGeo) {
    // Thin tapered stick lying on its side (Y-up then rotated in instance)
    _stickGeo = new THREE.CylinderGeometry(0.012, 0.02, 0.55, 4, 1);
  }
  if (!_debrisGeo) {
    _debrisGeo = new THREE.CircleGeometry(0.12, 5);
    // Flatten in XY so it lies as a ground disc after rot.x = -PI/2
  }
  if (!_rockMat) {
    _rockMat = new THREE.MeshStandardMaterial({
      color: 0x6a6560,
      roughness: 0.92,
      metalness: 0.04,
      flatShading: true,
    });
  }
  if (!_stickMat) {
    _stickMat = new THREE.MeshStandardMaterial({
      color: 0x4a3520,
      roughness: 0.95,
      metalness: 0.0,
      flatShading: true,
    });
  }
  if (!_debrisMat) {
    _debrisMat = new THREE.MeshStandardMaterial({
      color: 0x3d4a28,
      roughness: 1.0,
      metalness: 0.0,
      side: THREE.DoubleSide,
    });
  }
}

function releaseShared() {
  _refCount = Math.max(0, _refCount - 1);
  if (_refCount > 0) return;
  _rockGeo?.dispose(); _rockGeo = null;
  _stickGeo?.dispose(); _stickGeo = null;
  _debrisGeo?.dispose(); _debrisGeo = null;
  _rockMat?.dispose(); _rockMat = null;
  _stickMat?.dispose(); _stickMat = null;
  _debrisMat?.dispose(); _debrisMat = null;
}

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface ChunkDetail {
  rocks: THREE.InstancedMesh | null;
  sticks: THREE.InstancedMesh | null;
  debris: THREE.InstancedMesh | null;
}

function noopRaycast() { /* decorative — never block camera / ground */ }

export class GroundDetailSystem {
  private scene: THREE.Scene;
  private chunks = new Map<string, ChunkDetail>();
  private dummy = new THREE.Object3D();
  private tint = new THREE.Color();

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    acquireShared();
  }

  /**
   * Plant rock / stick / debris layers for one streamed terrain chunk.
   * Deterministic seed from chunk coords so revisiting looks stable.
   */
  buildChunk(cx: number, cz: number, chunkSize: number): void {
    const key = `${cx},${cz}`;
    if (this.chunks.has(key)) return;

    const seed = ((cx * 73856093) ^ (cz * 19349663)) >>> 0;
    const rand = mulberry32(seed || 1);
    const originX = cx * chunkSize;
    const originZ = cz * chunkSize;

    const rockSlots: Array<{ x: number; y: number; z: number; ry: number; s: number; t: number }> = [];
    const stickSlots: typeof rockSlots = [];
    const debrisSlots: typeof rockSlots = [];

    const tryPlace = (
      target: typeof rockSlots,
      n: number,
      allow: (biome: Biome) => boolean,
      yLift: number,
    ) => {
      for (let i = 0; i < n; i++) {
        const x = originX + rand() * chunkSize;
        const z = originZ + rand() * chunkSize;
        const y = worldHeight(x, z);
        const biome = getBiome(y);
        if (!allow(biome)) continue;
        // Skip underwater / thin beach clutter
        if (biome <= Biome.ShallowSea) continue;
        if (biome === Biome.Beach && rand() > 0.28) continue;
        target.push({
          x,
          y: y + yLift,
          z,
          ry: rand() * Math.PI * 2,
          s: 0.55 + rand() * 1.1,
          t: 0.75 + rand() * 0.35,
        });
      }
    };

    tryPlace(
      rockSlots,
      ROCKS_PER_CHUNK,
      (b) =>
        b === Biome.Grassland ||
        b === Biome.Forest ||
        b === Biome.Highland ||
        b === Biome.Mountain ||
        b === Biome.Beach,
      0.02,
    );
    tryPlace(
      stickSlots,
      STICKS_PER_CHUNK,
      (b) => b === Biome.Forest || b === Biome.Grassland,
      0.015,
    );
    tryPlace(
      debrisSlots,
      DEBRIS_PER_CHUNK,
      (b) => b === Biome.Grassland || b === Biome.Forest,
      0.01,
    );

    const rocks = this.makeInstanced(_rockGeo!, _rockMat!, rockSlots, 'rock');
    const sticks = this.makeInstanced(_stickGeo!, _stickMat!, stickSlots, 'stick');
    const debris = this.makeInstanced(_debrisGeo!, _debrisMat!, debrisSlots, 'debris');

    if (rocks) this.scene.add(rocks);
    if (sticks) this.scene.add(sticks);
    if (debris) this.scene.add(debris);

    this.chunks.set(key, { rocks, sticks, debris });
  }

  private makeInstanced(
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    slots: Array<{ x: number; y: number; z: number; ry: number; s: number; t: number }>,
    kind: 'rock' | 'stick' | 'debris',
  ): THREE.InstancedMesh | null {
    if (slots.length === 0) return null;
    const mesh = new THREE.InstancedMesh(geo, mat, slots.length);
    mesh.frustumCulled = true;
    mesh.castShadow = false;
    mesh.receiveShadow = kind === 'debris';
    mesh.raycast = noopRaycast;
    mesh.name = `ground-detail-${kind}`;

    for (let i = 0; i < slots.length; i++) {
      const s = slots[i];
      this.dummy.position.set(s.x, s.y, s.z);
      if (kind === 'stick') {
        // Lie on ground: roll onto side + random yaw
        this.dummy.rotation.set(Math.PI / 2, s.ry, (Math.random() - 0.5) * 0.4);
        this.dummy.scale.set(s.s * 0.7, s.s, s.s * 0.7);
      } else if (kind === 'debris') {
        this.dummy.rotation.set(-Math.PI / 2, 0, s.ry);
        this.dummy.scale.setScalar(s.s * 0.9);
      } else {
        this.dummy.rotation.set(0, s.ry, 0);
        this.dummy.scale.set(s.s, s.s * (0.7 + Math.random() * 0.5), s.s);
      }
      this.dummy.updateMatrix();
      mesh.setMatrixAt(i, this.dummy.matrix);
      this.tint.setRGB(s.t, s.t * 0.98, s.t * 0.95);
      mesh.setColorAt(i, this.tint);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    return mesh;
  }

  destroyChunk(cx: number, cz: number): void {
    const key = `${cx},${cz}`;
    const entry = this.chunks.get(key);
    if (!entry) return;
    for (const m of [entry.rocks, entry.sticks, entry.debris]) {
      if (!m) continue;
      if (m.parent) this.scene.remove(m);
      m.dispose();
    }
    this.chunks.delete(key);
  }

  dispose(): void {
    for (const key of [...this.chunks.keys()]) {
      const [cx, cz] = key.split(',').map(Number);
      this.destroyChunk(cx, cz);
    }
    releaseShared();
  }
}
