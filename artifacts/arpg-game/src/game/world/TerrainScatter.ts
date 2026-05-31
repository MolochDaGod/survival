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
import { worldHeight, getBiome, Biome, isWater } from './WorldGen';
import { LAYERS } from '../Layers';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import { GROUPS_PROP } from '../physics/PhysicsGroups';
import type RAPIER from '@dimforge/rapier3d-compat';

// ─── Asset catalogue ──────────────────────────────────────────────────────────

const TERRAIN = '/models/terrain';

/** Palm tree FBX variants (20 models). */
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
const _templateCache = new Map<string, THREE.Group>();
const _pendingLoads = new Map<string, Promise<THREE.Group>>();

function loadFBXTemplate(path: string): Promise<THREE.Group> {
  if (_templateCache.has(path)) return Promise.resolve(_templateCache.get(path)!);
  if (_pendingLoads.has(path)) return _pendingLoads.get(path)!;

  const p = new Promise<THREE.Group>((resolve, reject) => {
    _fbxLoader.load(path, (group) => {
      // Normalize: set shadows, enable world layer
      group.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.castShadow = true;
          child.receiveShadow = true;
          child.layers.enable(LAYERS.WORLD);
          // Ensure materials are standard
          if (child.material instanceof THREE.MeshPhongMaterial) {
            const old = child.material;
            child.material = new THREE.MeshStandardMaterial({
              map: old.map,
              color: old.color,
              roughness: 0.85,
              metalness: 0.02,
            });
          }
        }
      });
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

        switch (biome) {
          case Biome.Beach:
            // Palm trees (60% chance) + small stones (20%)
            if (roll < 0.60) {
              placements.push({
                path: pick(PALM_TREES, rng),
                wx: jx, wz: jz,
                scale: 0.008 + rng() * 0.004, // FBX palms are huge, scale down
                ry: rng() * Math.PI * 2,
                yOffset: 0,
              });
            } else if (roll < 0.80) {
              placements.push({
                path: pick(STONES_SMALL, rng),
                wx: jx, wz: jz,
                scale: 0.01 + rng() * 0.008,
                ry: rng() * Math.PI * 2,
                yOffset: -0.2,
              });
            }
            break;

          case Biome.Grassland:
            // Sparse palm trees (30%) + occasional stones (15%)
            if (roll < 0.30) {
              placements.push({
                path: pick(PALM_TREES, rng),
                wx: jx, wz: jz,
                scale: 0.009 + rng() * 0.005,
                ry: rng() * Math.PI * 2,
                yOffset: 0,
              });
            } else if (roll < 0.45) {
              placements.push({
                path: pick(STONES_MID, rng),
                wx: jx, wz: jz,
                scale: 0.01 + rng() * 0.006,
                ry: rng() * Math.PI * 2,
                yOffset: -0.3,
              });
            }
            break;

          case Biome.Forest:
            // Dense palm trees (55%) + scattered stones (10%)
            if (roll < 0.55) {
              placements.push({
                path: pick(PALM_TREES, rng),
                wx: jx, wz: jz,
                scale: 0.010 + rng() * 0.006,
                ry: rng() * Math.PI * 2,
                yOffset: 0,
              });
            } else if (roll < 0.65) {
              placements.push({
                path: pick(STONES_MID, rng),
                wx: jx, wz: jz,
                scale: 0.008 + rng() * 0.006,
                ry: rng() * Math.PI * 2,
                yOffset: -0.3,
              });
            }
            break;

          case Biome.Highland:
            // Big stones (40%) + hills (15%)
            if (roll < 0.40) {
              placements.push({
                path: pick([...STONES_BIG, ...STONES_MID], rng),
                wx: jx, wz: jz,
                scale: 0.012 + rng() * 0.008,
                ry: rng() * Math.PI * 2,
                yOffset: -0.5,
              });
            } else if (roll < 0.55) {
              placements.push({
                path: pick(HILLS, rng),
                wx: jx, wz: jz,
                scale: 0.015 + rng() * 0.01,
                ry: rng() * Math.PI * 2,
                yOffset: -2,
              });
            }
            break;

          case Biome.Mountain:
            // Mountains (35%) + big stones (25%) + plateaus (10%)
            if (roll < 0.35) {
              placements.push({
                path: pick(MOUNTAINS, rng),
                wx: jx, wz: jz,
                scale: 0.02 + rng() * 0.015,
                ry: rng() * Math.PI * 2,
                yOffset: -3,
              });
            } else if (roll < 0.60) {
              placements.push({
                path: pick(STONES_BIG, rng),
                wx: jx, wz: jz,
                scale: 0.015 + rng() * 0.01,
                ry: rng() * Math.PI * 2,
                yOffset: -1,
              });
            } else if (roll < 0.70) {
              placements.push({
                path: pick(PLATEAUS, rng),
                wx: jx, wz: jz,
                scale: 0.02 + rng() * 0.012,
                ry: rng() * Math.PI * 2,
                yOffset: -2,
              });
            }
            break;

          case Biome.SnowPeak:
            // Mountain peaks (25%) + big stones (15%)
            if (roll < 0.25) {
              placements.push({
                path: pick(MOUNTAINS, rng),
                wx: jx, wz: jz,
                scale: 0.025 + rng() * 0.02,
                ry: rng() * Math.PI * 2,
                yOffset: -4,
              });
            } else if (roll < 0.40) {
              placements.push({
                path: pick(STONES_BIG, rng),
                wx: jx, wz: jz,
                scale: 0.018 + rng() * 0.012,
                ry: rng() * Math.PI * 2,
                yOffset: -1.5,
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
      await Promise.allSettled(batch.map(p => loadFBXTemplate(p)));
    }

    // Place all queued items
    let placedCount = 0;
    for (const spec of placements) {
      const template = _templateCache.get(spec.path);
      if (!template) continue;

      const clone = cloneTemplate(template);
      const wy = worldHeight(spec.wx, spec.wz) + spec.yOffset;
      clone.position.set(spec.wx, wy, spec.wz);
      clone.rotation.y = spec.ry;
      clone.scale.setScalar(spec.scale);
      this.scene.add(clone);

      // Add simple cuboid collider for large props
      if (this.physics && this.body && spec.scale > 0.012) {
        const box = new THREE.Box3().setFromObject(clone);
        const size = new THREE.Vector3();
        box.getSize(size);
        if (size.x > 0.5 && size.y > 0.5) {
          const desc = this.physics.RAPIER.ColliderDesc.cuboid(
            size.x * 0.4, size.y * 0.4, size.z * 0.4,
          ).setTranslation(spec.wx, wy + size.y * 0.4, spec.wz)
           .setCollisionGroups(GROUPS_PROP);
          this.physics.world.createCollider(desc, this.body);
        }
      }

      placedCount++;
    }

    console.log(`[TerrainScatter] ${placedCount} terrain features placed`);
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
