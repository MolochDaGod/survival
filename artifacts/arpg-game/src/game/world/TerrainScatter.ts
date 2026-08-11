/**
 * TerrainScatter — biome-aware placement of craftpix low-poly terrain models.
 *
 * Loads FBX assets from public/models/terrain/ (palm trees, desert stones,
 * mountains) and scatters instances across the world based on biome.
 *
 * Placement rules:
 *   Beach / Grassland → palm trees (tropical)
 *   Beach / Highland  → desert stones (scattered rocks)
 *   Mountain          → mountain / hill / plateau meshes at sector boundaries
 *   Forest            → palm trees (sparse) + stones (rare)
 *
 * Models are loaded once then cloned per placement. Each FBX ships with a
 * shared texture atlas (T_Tree_tropical, T_Stones_Desert, T_Mountains_*).
 */

import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { createGLTFLoader } from '../loaders/createGLTFLoader';
import { worldHeight, getBiome, Biome, isWater } from './WorldGen';
import { LAYERS } from '../Layers';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import { GROUPS_PROP } from '../physics/PhysicsGroups';
import type RAPIER from '@dimforge/rapier3d-compat';
import { assetUrl } from '../../lib/assetUrl';

// ─── Asset catalogue ──────────────────────────────────────────────────────────

const TERRAIN = '/models/terrain';

/**
 * Original-game nature GLBs (always available after asset copy).
 * Craftpix FBX packs are preferred when present; these are the reliable fallback.
 */
const ORIG_TREES  = [`${TERRAIN}/tree1.glb`];
const ORIG_BUSHES = [`${TERRAIN}/bush.glb`];
const ORIG_ROCKS  = [`${TERRAIN}/rock1.glb`, `${TERRAIN}/rock2.glb`];
const ORIG_CLIFFS = [`${TERRAIN}/cliff1.glb`, `${TERRAIN}/cliff2.glb`];

/** Palm tree FBX variants (20 models) — optional craftpix pack. */
const PALM_TREES: string[] = Array.from({ length: 20 }, (_, i) =>
  `${TERRAIN}/palm-trees/Fbx/Tree_Tropic_${String(i + 1).padStart(3, '0')}.fbx`,
);

/** Desert stone FBX variants (big, mid, small). */
const STONES_BIG: string[]   = Array.from({ length: 9 }, (_, i) =>
  `${TERRAIN}/desert-stones/Fbx/Stone_desert_big_${String(i + 1).padStart(3, '0')}.fbx`,
);
const STONES_MID: string[]   = Array.from({ length: 14 }, (_, i) =>
  `${TERRAIN}/desert-stones/Fbx/Stone_desert_mid_${String(i + 1).padStart(3, '0')}.fbx`,
);
const STONES_SMALL: string[] = Array.from({ length: 13 }, (_, i) =>
  `${TERRAIN}/desert-stones/Fbx/Stone_desert_small_${String(i + 1).padStart(3, '0')}.fbx`,
);

/** Mountain / hill / plateau FBX variants. */
const MOUNTAINS: string[] = Array.from({ length: 10 }, (_, i) =>
  `${TERRAIN}/mountains/Fbx/Mountains_temperate_climate_${String(i + 1).padStart(3, '0')}.fbx`,
);
const HILLS: string[] = Array.from({ length: 5 }, (_, i) =>
  `${TERRAIN}/mountains/Fbx/Hill_temperate_climate_${String(i + 1).padStart(3, '0')}.fbx`,
);
const PLATEAUS: string[] = Array.from({ length: 5 }, (_, i) =>
  `${TERRAIN}/mountains/Fbx/Plateau_temperate_climate_${String(i + 1).padStart(3, '0')}.fbx`,
);

/** Active catalogs — original GLBs always; craftpix appended if load succeeds later. */
let TREES_ACTIVE  = [...ORIG_TREES];
let BUSHES_ACTIVE = [...ORIG_BUSHES];
let ROCKS_ACTIVE  = [...ORIG_ROCKS];
let CLIFFS_ACTIVE = [...ORIG_CLIFFS];

// ─── Seeded PRNG for deterministic placement ──────────────────────────────────

function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── Loader cache ─────────────────────────────────────────────────────────────

const _fbxLoader = new FBXLoader();
const _gltfLoader = createGLTFLoader();
const _templateCache = new Map<string, THREE.Group>();
const _pendingLoads = new Map<string, Promise<THREE.Group>>();

function normalizeNatureRoot(group: THREE.Group): void {
  group.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.castShadow = true;
      child.receiveShadow = true;
      child.layers.enable(LAYERS.WORLD);
      if (child.material instanceof THREE.MeshPhongMaterial) {
        const old = child.material;
        child.material = new THREE.MeshStandardMaterial({
          map: old.map,
          color: old.color,
          roughness: 0.85,
          metalness: 0.02,
        });
      }
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      for (const mat of mats) {
        const std = mat as THREE.MeshStandardMaterial;
        if (std?.map) {
          std.map.colorSpace = THREE.SRGBColorSpace;
          std.map.anisotropy = Math.min(8, std.map.anisotropy || 4);
        }
      }
    }
  });
  // Plant feet on y=0 for consistent placement
  group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(group);
  if (Number.isFinite(box.min.y)) group.position.y -= box.min.y;
}

function loadNatureTemplate(path: string): Promise<THREE.Group> {
  if (_templateCache.has(path)) return Promise.resolve(_templateCache.get(path)!);
  if (_pendingLoads.has(path)) return _pendingLoads.get(path)!;

  const isGlb = /\.glb$/i.test(path) || /\.gltf$/i.test(path);
  const url = assetUrl(path);

  const p = new Promise<THREE.Group>((resolve, reject) => {
    if (isGlb) {
      _gltfLoader.load(
        url,
        (gltf) => {
          const group = gltf.scene as THREE.Group;
          normalizeNatureRoot(group);
          _templateCache.set(path, group);
          _pendingLoads.delete(path);
          resolve(group);
        },
        undefined,
        (err) => {
          _pendingLoads.delete(path);
          reject(err);
        },
      );
      return;
    }

    _fbxLoader.load(url, (group) => {
      normalizeNatureRoot(group);
      _templateCache.set(path, group);
      _pendingLoads.delete(path);
      resolve(group);
    }, undefined, (err) => {
      console.warn(`[TerrainScatter] Failed to load: ${path}`, err);
      _pendingLoads.delete(path);
      reject(err);
    });
  });
  _pendingLoads.set(path, p);
  return p;
}

function cloneTemplate(template: THREE.Group): THREE.Group {
  return template.clone(true) as THREE.Group;
}

// ─── Placement helpers ────────────────────────────────────────────────────────

function pick<T>(arr: T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)];
}

interface PlacementSpec {
  path: string;
  wx: number;
  wz: number;
  scale: number;
  ry: number;
  yOffset: number;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export class TerrainScatter {
  private scene: THREE.Scene;
  private physics: PhysicsWorld | null;
  private body: RAPIER.RigidBody | null = null;
  private placed = new Set<string>(); // dedup key = "x_z"

  constructor(scene: THREE.Scene, physics: PhysicsWorld | null = null) {
    this.scene = scene;
    this.physics = physics;
  }

  /**
   * Scatter terrain features across the world. Call once after terrain chunks
   * are built. Uses a seeded PRNG so placement is deterministic.
   *
   * @param worldRadius  Half-extent of the world to scatter across.
   * @param spacing      Grid spacing between sample points (metres).
   */
  async scatter(worldRadius = 2400, spacing = 40): Promise<void> {
    if (this.physics && !this.body) {
      this.body = this.physics.world.createRigidBody(
        this.physics.RAPIER.RigidBodyDesc.fixed(),
      );
    }

    const rng = mulberry32(42069);
    const placements: PlacementSpec[] = [];

    // Sample grid
    for (let x = -worldRadius; x <= worldRadius; x += spacing) {
      for (let z = -worldRadius; z <= worldRadius; z += spacing) {
        // Jitter within the cell
        const jx = x + (rng() - 0.5) * spacing * 0.8;
        const jz = z + (rng() - 0.5) * spacing * 0.8;
        const h = worldHeight(jx, jz);
        const biome = getBiome(h);

        if (isWater(biome)) continue;

        // Skip the starter arena area
        const dist = Math.sqrt(jx * jx + jz * jz);
        if (dist < 120) continue;

        const key = `${Math.round(jx)}_${Math.round(jz)}`;
        if (this.placed.has(key)) continue;

        const roll = rng();

        // Prefer original-game GLBs (metres, textured). Craftpix FBX paths are
        // still listed for optional packs — loader failures just skip those.
        const treeScale  = 0.85 + rng() * 0.45;   // ~5–8 m after plant
        const bushScale  = 0.7 + rng() * 0.5;
        const rockScale  = 0.6 + rng() * 0.8;
        const cliffScale = 1.2 + rng() * 1.4;

        switch (biome) {
          case Biome.Beach:
            if (roll < 0.45) {
              placements.push({
                path: pick(TREES_ACTIVE, rng),
                wx: jx, wz: jz,
                scale: treeScale * 0.85,
                ry: rng() * Math.PI * 2,
                yOffset: 0,
              });
            } else if (roll < 0.70) {
              placements.push({
                path: pick(BUSHES_ACTIVE, rng),
                wx: jx, wz: jz,
                scale: bushScale,
                ry: rng() * Math.PI * 2,
                yOffset: 0,
              });
            } else if (roll < 0.90) {
              placements.push({
                path: pick(ROCKS_ACTIVE, rng),
                wx: jx, wz: jz,
                scale: rockScale * 0.7,
                ry: rng() * Math.PI * 2,
                yOffset: 0,
              });
            }
            break;

          case Biome.Grassland:
            if (roll < 0.28) {
              placements.push({
                path: pick(TREES_ACTIVE, rng),
                wx: jx, wz: jz,
                scale: treeScale,
                ry: rng() * Math.PI * 2,
                yOffset: 0,
              });
            } else if (roll < 0.50) {
              placements.push({
                path: pick(BUSHES_ACTIVE, rng),
                wx: jx, wz: jz,
                scale: bushScale,
                ry: rng() * Math.PI * 2,
                yOffset: 0,
              });
            } else if (roll < 0.65) {
              placements.push({
                path: pick(ROCKS_ACTIVE, rng),
                wx: jx, wz: jz,
                scale: rockScale,
                ry: rng() * Math.PI * 2,
                yOffset: 0,
              });
            }
            break;

          case Biome.Forest:
            if (roll < 0.55) {
              placements.push({
                path: pick(TREES_ACTIVE, rng),
                wx: jx, wz: jz,
                scale: treeScale * 1.15,
                ry: rng() * Math.PI * 2,
                yOffset: 0,
              });
            } else if (roll < 0.72) {
              placements.push({
                path: pick(BUSHES_ACTIVE, rng),
                wx: jx, wz: jz,
                scale: bushScale,
                ry: rng() * Math.PI * 2,
                yOffset: 0,
              });
            } else if (roll < 0.82) {
              placements.push({
                path: pick(ROCKS_ACTIVE, rng),
                wx: jx, wz: jz,
                scale: rockScale,
                ry: rng() * Math.PI * 2,
                yOffset: 0,
              });
            }
            break;

          case Biome.Highland:
            if (roll < 0.40) {
              placements.push({
                path: pick(ROCKS_ACTIVE, rng),
                wx: jx, wz: jz,
                scale: rockScale * 1.4,
                ry: rng() * Math.PI * 2,
                yOffset: 0,
              });
            } else if (roll < 0.55) {
              placements.push({
                path: pick(CLIFFS_ACTIVE, rng),
                wx: jx, wz: jz,
                scale: cliffScale * 0.7,
                ry: rng() * Math.PI * 2,
                yOffset: 0,
              });
            } else if (roll < 0.65) {
              placements.push({
                path: pick(TREES_ACTIVE, rng),
                wx: jx, wz: jz,
                scale: treeScale * 0.75,
                ry: rng() * Math.PI * 2,
                yOffset: 0,
              });
            }
            break;

          case Biome.Mountain:
            if (roll < 0.35) {
              placements.push({
                path: pick(CLIFFS_ACTIVE, rng),
                wx: jx, wz: jz,
                scale: cliffScale,
                ry: rng() * Math.PI * 2,
                yOffset: 0,
              });
            } else if (roll < 0.65) {
              placements.push({
                path: pick(ROCKS_ACTIVE, rng),
                wx: jx, wz: jz,
                scale: rockScale * 1.6,
                ry: rng() * Math.PI * 2,
                yOffset: 0,
              });
            }
            break;

          case Biome.SnowPeak:
            if (roll < 0.30) {
              placements.push({
                path: pick(CLIFFS_ACTIVE, rng),
                wx: jx, wz: jz,
                scale: cliffScale * 1.2,
                ry: rng() * Math.PI * 2,
                yOffset: 0,
              });
            } else if (roll < 0.50) {
              placements.push({
                path: pick(ROCKS_ACTIVE, rng),
                wx: jx, wz: jz,
                scale: rockScale * 1.8,
                ry: rng() * Math.PI * 2,
                yOffset: 0,
              });
            }
            break;
        }

        this.placed.add(key);
      }
    }

    console.log(`[TerrainScatter] ${placements.length} terrain features queued`);

    // Batch-load unique paths, then place clones
    const uniquePaths = [...new Set(placements.map(p => p.path))];

    // Load in batches to avoid overwhelming the browser
    const BATCH_SIZE = 8;
    for (let i = 0; i < uniquePaths.length; i += BATCH_SIZE) {
      const batch = uniquePaths.slice(i, i + BATCH_SIZE);
      await Promise.allSettled(batch.map(p => loadNatureTemplate(p)));
    }

    // Place all queued items
    let placedCount = 0;
    for (const spec of placements) {
      const template = _templateCache.get(spec.path);
      if (!template) continue;

      const clone = cloneTemplate(template);
      clone.scale.setScalar(spec.scale);
      clone.updateMatrixWorld(true);
      // Re-plant after scale so soles sit on terrain
      const localBox = new THREE.Box3().setFromObject(clone);
      const footY = Number.isFinite(localBox.min.y) ? -localBox.min.y : 0;
      const wy = worldHeight(spec.wx, spec.wz) + spec.yOffset + footY;
      clone.position.set(spec.wx, wy, spec.wz);
      clone.rotation.y = spec.ry;
      this.scene.add(clone);

      // Collider for solid nature props (trees, rocks, cliffs)
      if (this.physics && this.body && (spec.scale > 0.5 || /cliff|rock|tree/i.test(spec.path))) {
        const box = new THREE.Box3().setFromObject(clone);
        const size = new THREE.Vector3();
        box.getSize(size);
        if (size.x > 0.4 && size.y > 0.4) {
          const desc = this.physics.RAPIER.ColliderDesc.cuboid(
            size.x * 0.35, size.y * 0.4, size.z * 0.35,
          ).setTranslation(spec.wx, wy + size.y * 0.4, spec.wz)
           .setCollisionGroups(GROUPS_PROP);
          this.physics.world.createCollider(desc, this.body);
        }
      }

      placedCount++;
    }

    console.log(`[TerrainScatter] ${placedCount} terrain features placed (textured nature GLBs)`);
  }

  dispose(): void {
    if (this.physics && this.body) {
      try { this.physics.world.removeRigidBody(this.body); } catch { /* already gone */ }
      this.body = null;
    }
    _templateCache.clear();
    this.placed.clear();
  }
}
