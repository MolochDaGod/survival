/**
 * WinterTreeSystem — replaces procedural cone trees in the Mountain and
 * SnowPeak biomes with instanced models extracted from the winter tree pack GLB.
 *
 * Each direct child of gltf.scene is treated as one distinct tree "prefab".
 * If the child is a Group, its descendant Meshes are baked (world transforms
 * applied) and merged into a single BufferGeometry per prefab using useGroups=true
 * so that multi-material trees (trunk + foliage) retain their per-face material
 * indices.  A material array is built from the collected mesh materials and
 * passed alongside the geometry to THREE.InstancedMesh.
 *
 * Usage:
 *   1. Call `getWinterTreeSystem(scene).init()` once during scene setup.
 *   2. Call `getWinterTreeSystem().spawnChunkTrees(...)` from WorldChunkManager
 *      when loading a Mountain/SnowPeak chunk. Returns [] until ready.
 */

import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createGLTFLoader } from '@/game/loaders/createGLTFLoader';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TreePrefab {
  geometry: THREE.BufferGeometry;
  material: THREE.Material | THREE.Material[];
  heightMetres: number;
}

// ─── Singleton ────────────────────────────────────────────────────────────────

let _instance: WinterTreeSystem | null = null;

export function getWinterTreeSystem(scene?: THREE.Scene): WinterTreeSystem {
  if (!_instance) {
    if (!scene) throw new Error('[WinterTreeSystem] scene required on first call');
    _instance = new WinterTreeSystem(scene);
  }
  return _instance;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function cloneSingleMaterial(src: THREE.Material): THREE.Material {
  const c = src.clone();
  // Apply defensively to any material type that exposes envMapIntensity
  if ('envMapIntensity' in c) {
    (c as THREE.MeshStandardMaterial).envMapIntensity = 0.5;
  }
  return c;
}

/** Extract the "primary" material from a mesh (first element for arrays). */
function primaryMaterial(mesh: THREE.Mesh): THREE.Material {
  return Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
}

function makeSeededRng(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = Math.imul(s ^ (s >>> 16), 0x45d9f3b);
    s = Math.imul(s ^ (s >>> 16), 0x45d9f3b);
    s ^= s >>> 16;
    return (s >>> 0) / 0xffffffff;
  };
}

// ─── Class ────────────────────────────────────────────────────────────────────

export class WinterTreeSystem {
  private prefabs: TreePrefab[] = [];
  private ready = false;

  constructor(private scene: THREE.Scene) {}

  async init(): Promise<void> {
    const baseUrl = (import.meta.env.BASE_URL as string) || '/';
    const glbUrl  = baseUrl + 'models/environment/winter_trees.glb';

    const loader = createGLTFLoader();
    const gltf   = await new Promise<GLTF>((resolve, reject) => {
      loader.load(glbUrl, resolve, undefined, reject);
    });

    // Flush all world matrices before reading them
    gltf.scene.updateMatrixWorld(true);

    // Invert the scene-root transform so child world-matrices become relative
    // to the scene root (handles exporters that bake a units-conversion scale).
    const sceneInv = new THREE.Matrix4().copy(gltf.scene.matrixWorld).invert();

    // ── Collect prefab roots ────────────────────────────────────────────────
    // Each top-level child of gltf.scene is one distinct tree type.
    const prefabRoots: THREE.Object3D[] = gltf.scene.children.length > 0
      ? gltf.scene.children.slice()
      : [];

    if (prefabRoots.length === 0) {
      gltf.scene.traverse(node => {
        if (node instanceof THREE.Mesh) prefabRoots.push(node);
      });
    }

    interface RawPrefab {
      geometry: THREE.BufferGeometry;
      material: THREE.Material | THREE.Material[];
      bboxH: number;
    }
    const rawPrefabs: RawPrefab[] = [];

    for (const root of prefabRoots) {
      // Collect all Mesh descendants (or the root itself)
      const meshes: THREE.Mesh[] = [];
      if (root instanceof THREE.Mesh) {
        meshes.push(root);
      } else {
        root.traverse(child => {
          if (child instanceof THREE.Mesh) meshes.push(child);
        });
      }
      if (meshes.length === 0) continue;

      // Bake each mesh's world transform (relative to scene root) into a
      // cloned geometry so instancing works from the origin.
      const bakedGeos: THREE.BufferGeometry[] = [];
      for (const mesh of meshes) {
        const geo    = mesh.geometry.clone();
        const relMat = new THREE.Matrix4().copy(mesh.matrixWorld).premultiply(sceneInv);
        geo.applyMatrix4(relMat);
        bakedGeos.push(geo);
      }

      // Merge into a single geometry preserving per-mesh material groups
      // (useGroups=true means each original geometry becomes a DrawRange group
      // with its own materialIndex, so trunk and foliage faces stay separate).
      let mergedGeo: THREE.BufferGeometry;
      let material:  THREE.Material | THREE.Material[];

      if (bakedGeos.length === 1) {
        mergedGeo = bakedGeos[0];
        material  = cloneSingleMaterial(primaryMaterial(meshes[0]));
      } else {
        const merged = mergeGeometries(bakedGeos, true);
        // Dispose intermediate per-mesh geometries
        for (const g of bakedGeos) g.dispose();
        if (!merged) continue;
        mergedGeo = merged;
        // Build a material array that maps each group's materialIndex to the
        // corresponding mesh's primary material.
        material = meshes.map(m => cloneSingleMaterial(primaryMaterial(m)));
      }

      // Compute height from the merged geometry's bounding box
      mergedGeo.computeBoundingBox();
      const bbox = mergedGeo.boundingBox;
      if (!bbox) { mergedGeo.dispose(); continue; }
      const bboxH = bbox.max.y - bbox.min.y;
      if (bboxH < 0.01) { mergedGeo.dispose(); continue; }

      // Normalize pivot: shift so trunk base sits at y=0 and the footprint
      // is centered on x/z=0.  This ensures `dummy.position.y = slot.h` in
      // spawnChunkTrees places the tree base exactly on the terrain surface
      // regardless of any authoring-scene offsets baked into the prefab.
      const cx = (bbox.min.x + bbox.max.x) / 2;
      const cz = (bbox.min.z + bbox.max.z) / 2;
      mergedGeo.translate(-cx, -bbox.min.y, -cz);

      rawPrefabs.push({ geometry: mergedGeo, material, bboxH });
    }

    if (rawPrefabs.length === 0) {
      console.warn('[WinterTreeSystem] No valid prefabs extracted from winter tree GLB.');
      this.ready = true;
      return;
    }

    // ── Normalise heights to 7–14 m ────────────────────────────────────────
    const bboxHeights = rawPrefabs.map(p => p.bboxH);
    const srcMaxH     = Math.max(...bboxHeights);
    const srcMinH     = Math.min(...bboxHeights);
    const srcRange    = srcMaxH - srcMinH || 1;
    const TARGET_MIN  = 7;
    const TARGET_MAX  = 14;

    for (const raw of rawPrefabs) {
      const t        = (raw.bboxH - srcMinH) / srcRange;
      const targetH  = TARGET_MIN + t * (TARGET_MAX - TARGET_MIN);
      const scaleFac = targetH / raw.bboxH;
      raw.geometry.scale(scaleFac, scaleFac, scaleFac);
      this.prefabs.push({ geometry: raw.geometry, material: raw.material, heightMetres: targetH });
    }

    this.ready = true;
  }

  /**
   * Called by WorldChunkManager for Mountain/SnowPeak chunks.
   * Returns instanced meshes already added to the scene. Keep references for
   * later eviction. Returns [] safely if the GLB is still loading.
   */
  spawnChunkTrees(
    cx: number,
    cz: number,
    _chunkSize: number,
    slots: Array<{ wx: number; wz: number; h: number }>,
  ): THREE.InstancedMesh[] {
    if (!this.ready || this.prefabs.length === 0 || slots.length === 0) return [];

    const MAX_PER_CHUNK = 40;
    const capped        = slots.slice(0, MAX_PER_CHUNK);
    const prefabCount   = this.prefabs.length;
    const rng           = makeSeededRng(cx * 73856093 ^ cz * 19349663);

    // Group slot indices by round-robin prefab assignment
    const buckets = new Map<number, number[]>();
    for (let i = 0; i < capped.length; i++) {
      const pi = i % prefabCount;
      if (!buckets.has(pi)) buckets.set(pi, []);
      buckets.get(pi)!.push(i);
    }

    const result: THREE.InstancedMesh[] = [];
    const dummy = new THREE.Object3D();

    for (const [prefabIdx, slotIdxs] of buckets) {
      const prefab = this.prefabs[prefabIdx];
      const iMesh  = new THREE.InstancedMesh(prefab.geometry, prefab.material, slotIdxs.length);
      iMesh.castShadow    = true;
      iMesh.receiveShadow = false;

      for (let k = 0; k < slotIdxs.length; k++) {
        const slot   = capped[slotIdxs[k]];
        const scaleV = 0.85 + rng() * 0.3;   // ±15% variance
        const rotY   = rng() * Math.PI * 2;

        dummy.position.set(slot.wx, slot.h, slot.wz);
        dummy.scale.setScalar(scaleV);
        dummy.rotation.set(0, rotY, 0);
        dummy.updateMatrix();
        iMesh.setMatrixAt(k, dummy.matrix);
      }

      iMesh.instanceMatrix.needsUpdate = true;
      this.scene.add(iMesh);
      result.push(iMesh);
    }

    return result;
  }

  dispose(): void {
    for (const p of this.prefabs) {
      p.geometry.dispose();
      if (Array.isArray(p.material)) {
        p.material.forEach(m => m.dispose());
      } else {
        p.material.dispose();
      }
    }
    this.prefabs = [];
    this.ready   = false;
    _instance    = null;
  }
}
