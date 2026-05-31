/**
 * WorldChunkManager — streams 4-mile terrain around the player.
 *
 * Improvements over TerrainChunkManager:
 *   • worldHeight() replaces simple sine noise
 *   • Vertex colours encode biome (no texture atlas needed)
 *   • Instanced trees spawned per chunk based on forest biome coverage
 *   • BVH built per chunk for fast ground raycasting
 */

import * as THREE from 'three';
import { LAYERS } from '../Layers';
import { worldHeight, getBiome, getBiomeColor, isWater, isForestBiome, Biome } from './WorldGen';
import { createBiomeTerrainMaterial, updateTerrainUniforms } from './BiomeTerrainMaterial';
import { getResourceSystem } from './ResourceSystem';
import { getWinterTreeSystem } from './WinterTreeSystem';
import type { GrassSystem } from './GrassSystem';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import {
  attachChunkHeightfield,
  attachChunkTrunks,
  type ChunkColliderHandle,
} from '../physics/ChunkColliders';

const CHUNK_SIZE  = 256;        // metres per side
const CHUNK_RES   = 64;         // quad segments per side  (4 m vertex spacing)
const KEEP_RADIUS = 3;          // 7×7 = 49 resident chunks  ~896 m view

type WithBVH = THREE.BufferGeometry & { computeBoundsTree?: () => void };

interface ChunkEntry {
  cx: number;
  cz: number;
  terrain: THREE.Mesh;
  trees: THREE.InstancedMesh | null;
  winterTrees?: THREE.InstancedMesh[];
  /** Heightfield rigid body matching `terrain` — null when no physics. */
  physicsTerrain?: ChunkColliderHandle | null;
  /** Static body carrying one cuboid per tree trunk in this chunk. */
  physicsTrunks?: ChunkColliderHandle | null;
}

// ─── Shared materials ─────────────────────────────────────────────────────────

const terrainMat = createBiomeTerrainMaterial();

const trunkMat = new THREE.MeshStandardMaterial({
  color: 0x3d2b1f,
  roughness: 0.95,
  envMapIntensity: 0.3,
});

const foliageMat = new THREE.MeshStandardMaterial({
  color: 0x1a4028,
  roughness: 0.9,
  envMapIntensity: 0.4,
});

// ─── Shared tree geometries ────────────────────────────────────────────────────

const _trunkGeo = new THREE.CylinderGeometry(0.28, 0.46, 7, 6);
const _folGeo   = new THREE.ConeGeometry(4, 9, 7);

// ─── Manager ─────────────────────────────────────────────────────────────────

export class WorldChunkManager {
  private scene: THREE.Scene;
  private chunks: Map<string, ChunkEntry> = new Map();
  private lastCx = Number.POSITIVE_INFINITY;
  private lastCz = Number.POSITIVE_INFINITY;
  // Optional decorative-grass overlay. Receives chunk load/evict events so
  // grass streams in/out alongside the terrain it sits on.
  private grass: GrassSystem | null = null;
  // Optional Rapier physics. When present, every chunk also produces a
  // heightfield collider so the player's kinematic capsule has a real
  // ground to stand on (and trees to bump into). Null skips physics
  // baking entirely — keeps unit-test scenes cheap.
  private physics: PhysicsWorld | null = null;

  constructor(scene: THREE.Scene, physics: PhysicsWorld | null = null) {
    this.scene = scene;
    this.physics = physics;
  }

  /**
   * Hand a physics world to the chunk manager after construction (used when
   * Rapier finishes its async WASM init after the scene has already started
   * streaming). Back-fills heightfield colliders for any chunks that are
   * already resident so the player doesn't need to walk out and back to
   * trigger collider creation.
   */
  setPhysics(physics: PhysicsWorld | null) {
    if (this.physics === physics) return;
    this.physics = physics;
    if (!physics) return;
    for (const entry of this.chunks.values()) {
      if (!entry.physicsTerrain) {
        entry.physicsTerrain = attachChunkHeightfield(
          physics,
          entry.cx * CHUNK_SIZE + CHUNK_SIZE * 0.5,
          entry.cz * CHUNK_SIZE + CHUNK_SIZE * 0.5,
          CHUNK_SIZE,
          CHUNK_RES,
          worldHeight,
        );
      }
    }
  }

  /**
   * Attach a grass overlay. Existing resident chunks are immediately
   * back-filled so grass shows up without needing the player to move
   * across a chunk boundary first.
   */
  setGrassSystem(grass: GrassSystem | null) {
    this.grass = grass;
    if (grass) {
      for (const entry of this.chunks.values()) {
        grass.buildChunk(entry.cx, entry.cz, CHUNK_SIZE);
      }
    }
  }

  /** Call every frame with elapsed time + camera world position. */
  updateShader(time: number, cameraPos: THREE.Vector3) {
    updateTerrainUniforms(time, cameraPos);
  }

  update(playerX: number, playerZ: number) {
    const cx = Math.floor(playerX / CHUNK_SIZE);
    const cz = Math.floor(playerZ / CHUNK_SIZE);
    if (cx === this.lastCx && cz === this.lastCz) return;
    this.lastCx = cx;
    this.lastCz = cz;

    // Load new chunks
    for (let dz = -KEEP_RADIUS; dz <= KEEP_RADIUS; dz++) {
      for (let dx = -KEEP_RADIUS; dx <= KEEP_RADIUS; dx++) {
        const key = `${cx + dx},${cz + dz}`;
        if (!this.chunks.has(key)) this.loadChunk(cx + dx, cz + dz);
      }
    }

    // Evict distant chunks
    for (const [key, entry] of this.chunks) {
      if (Math.abs(entry.cx - cx) > KEEP_RADIUS || Math.abs(entry.cz - cz) > KEEP_RADIUS) {
        this.evictChunk(key, entry);
      }
    }
  }

  private loadChunk(cx: number, cz: number) {
    // World-space centre of this chunk
    const baseX = cx * CHUNK_SIZE + CHUNK_SIZE * 0.5;
    const baseZ = cz * CHUNK_SIZE + CHUNK_SIZE * 0.5;

    // ── Terrain geometry ──────────────────────────────────────────────────────
    const geo = new THREE.PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE, CHUNK_RES, CHUNK_RES);
    const pos    = geo.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);

    // Forest detection for tree placement
    let forestCount = 0;
    const forestSlots: Array<{ lx: number; lz: number; h: number }> = [];
    const winterSlots: Array<{ wx: number; wz: number; h: number }> = [];

    for (let i = 0; i < pos.count; i++) {
      // PlaneGeometry lies in local XY; after rotation.x = -π/2:
      //   local Y  → world –Z    local X → world +X
      const lx = pos.getX(i);
      const ly = pos.getY(i);
      const wx = baseX + lx;
      const wz = baseZ - ly;
      const h  = worldHeight(wx, wz);
      pos.setZ(i, h);

      const biome = getBiome(h);
      const [r, g, b] = getBiomeColor(biome);
      colors[i * 3]     = r;
      colors[i * 3 + 1] = g;
      colors[i * 3 + 2] = b;

      // Collect potential forest sites (every 8th vertex to thin it out)
      if (!isWater(biome) && isForestBiome(biome) && (i % 8 === 0)) {
        forestSlots.push({ lx, lz: -ly, h });
        forestCount++;
      }

      // Collect winter-biome sites for GLB tree placement
      if ((biome === Biome.Mountain || biome === Biome.SnowPeak) && (i % 8 === 0)) {
        winterSlots.push({ wx, wz, h });
      }
    }

    // Determine dominant biome at chunk centre for tree-type selection
    const chunkCentreH     = worldHeight(baseX, baseZ);
    const chunkCentreBiome = getBiome(chunkCentreH);

    pos.needsUpdate = true;
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    (geo as WithBVH).computeBoundsTree?.();

    const terrain = new THREE.Mesh(geo, terrainMat);
    terrain.rotation.x = -Math.PI / 2;
    terrain.position.set(baseX, 0, baseZ);
    terrain.receiveShadow = true;
    terrain.castShadow    = false;
    terrain.layers.enable(LAYERS.WORLD);
    terrain.layers.enable(LAYERS.GROUND);
    this.scene.add(terrain);

    // ── Trees ─────────────────────────────────────────────────────────────────
    let trees: THREE.InstancedMesh | null = null;
    let winterTrees: THREE.InstancedMesh[] | undefined;
    // Per-trunk cuboid data — bagged here so we can hand them to Rapier as
    // a single static body after the visual pass finishes.
    const trunkPhysics: { x: number; y: number; z: number; halfHeight: number; halfWidth: number }[] = [];

    const isWinterChunk =
      chunkCentreBiome === Biome.Mountain || chunkCentreBiome === Biome.SnowPeak;

    if (isWinterChunk) {
      // Use GLB winter trees — procedural trunk/foliage skipped entirely
      winterTrees = getWinterTreeSystem().spawnChunkTrees(cx, cz, CHUNK_SIZE, winterSlots);
    } else {
      const treeCount = Math.min(forestSlots.length, 60);

      if (treeCount > 0) {
        const trunkInst = new THREE.InstancedMesh(_trunkGeo, trunkMat, treeCount);
        const folInst   = new THREE.InstancedMesh(_folGeo,   foliageMat, treeCount);
        trunkInst.castShadow = true;
        folInst.castShadow   = true;

        const dummy = new THREE.Object3D();
        // Subsample forest slots
        const step = Math.max(1, Math.floor(forestSlots.length / treeCount));
        let placed = 0;

        for (let si = 0; si < forestSlots.length && placed < treeCount; si += step) {
          const slot = forestSlots[si];
          const wx = baseX + slot.lx;
          const wz = baseZ + slot.lz;
          const scale = 0.7 + Math.random() * 0.6;
          const h = slot.h;

          dummy.position.set(wx, h + 3.5 * scale, wz);
          dummy.scale.set(scale, scale, scale);
          dummy.rotation.y = Math.random() * Math.PI * 2;
          dummy.updateMatrix();
          trunkInst.setMatrixAt(placed, dummy.matrix);

          dummy.position.set(wx, h + 7 * scale + 4.5 * scale * 0.5, wz);
          dummy.updateMatrix();
          folInst.setMatrixAt(placed, dummy.matrix);
          placed++;

          // Cuboid approximation of the trunk for the player capsule to
          // bump into. The visual trunk is a 7-tall cylinder of radius
          // ~0.4 m; we use a slightly slimmer cuboid (0.35 half-width) so
          // the collider sits inside the bark instead of poking through.
          trunkPhysics.push({
            x: wx,
            y: h + 3.5 * scale,
            z: wz,
            halfHeight: 3.5 * scale,
            halfWidth: 0.35 * scale,
          });
        }

        trunkInst.count = placed;
        folInst.count   = placed;
        trunkInst.instanceMatrix.needsUpdate = true;
        folInst.instanceMatrix.needsUpdate   = true;

        this.scene.add(trunkInst);
        this.scene.add(folInst);

        // Group via userData so we can clean up both later
        (trunkInst as any)._pairFoliage = folInst;
        trees = trunkInst;
      }
    }

    // Seed harvestable resource nodes for this chunk (safe no-op if duplicate).
    try { getResourceSystem().seedChunk(cx, cz, CHUNK_SIZE); } catch { /* scene not ready */ }

    // ── Physics colliders ────────────────────────────────────────────────────
    // Heightfield mirrors `worldHeight()` at the same resolution as the
    // visual mesh, so the kinematic capsule walks on the exact surface
    // it sees. Tree cuboids are attached to one shared static body to keep
    // the broad-phase node count down.
    let physicsTerrain: ChunkColliderHandle | null = null;
    let physicsTrunks: ChunkColliderHandle | null = null;
    if (this.physics) {
      physicsTerrain = attachChunkHeightfield(
        this.physics,
        baseX,
        baseZ,
        CHUNK_SIZE,
        CHUNK_RES,
        worldHeight,
      );
      physicsTrunks = attachChunkTrunks(this.physics, trunkPhysics);
    }

    const key = `${cx},${cz}`;
    this.chunks.set(key, { cx, cz, terrain, trees, winterTrees, physicsTerrain, physicsTrunks });

    // Plant decorative grass on top of this chunk (only on Grass/Forest
    // biomes — the GrassSystem itself filters out water, beach, mountain).
    this.grass?.buildChunk(cx, cz, CHUNK_SIZE);
  }

  private evictChunk(key: string, entry: ChunkEntry) {
    this.scene.remove(entry.terrain);
    entry.terrain.geometry.dispose();
    if (entry.trees) {
      const foliage = (entry.trees as any)._pairFoliage as THREE.InstancedMesh | undefined;
      if (foliage) this.scene.remove(foliage);
      // Don't dispose _trunkGeo / _folGeo — shared across all chunks
      this.scene.remove(entry.trees);
    }
    if (entry.winterTrees) {
      for (const iMesh of entry.winterTrees) {
        this.scene.remove(iMesh);
        // Geometry and material are owned by WinterTreeSystem prefabs — do not dispose here
      }
    }
    // Tear down the grass instance for this chunk so it doesn't leak GPU
    // memory as the player moves across the world.
    this.grass?.destroyChunk(entry.cx, entry.cz);
    // Drop the matching Rapier bodies. Safe to call even if physics was
    // never attached (handle is null in that case).
    entry.physicsTerrain?.dispose();
    entry.physicsTrunks?.dispose();
    this.chunks.delete(key);
  }

  dispose() {
    for (const [key, entry] of this.chunks) this.evictChunk(key, entry);
    terrainMat.dispose();
    trunkMat.dispose();
    foliageMat.dispose();
    _trunkGeo.dispose();
    _folGeo.dispose();
    // Release prefab geometry/materials owned by the winter tree system
    try { getWinterTreeSystem().dispose(); } catch { /* not initialised — safe to skip */ }
  }
}
