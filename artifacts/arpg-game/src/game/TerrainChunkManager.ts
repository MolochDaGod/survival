import * as THREE from 'three';
import type { AssetManager } from './AssetManager';
import { LAYERS } from './Layers';
import { sampleTerrainHeight } from './TerrainBuilder';

/**
 * Streams terrain chunks around the player so the world can be effectively
 * unbounded (the official extent is ±8 km, but only the chunks within
 * KEEP_RADIUS_CHUNKS exist at any one time).
 *
 * Chunks share a single material and texture set — only geometry is
 * allocated per chunk, so the GPU memory cost is small even with 25 chunks
 * resident.
 */

const CHUNK_SIZE = 256;        // metres per chunk side
const CHUNK_RES = 32;          // segments per chunk side (~8 m vertex spacing)
const KEEP_RADIUS_CHUNKS = 2;  // 5×5 grid → ~640 m radius coverage

interface Chunk {
  cx: number;
  cz: number;
  mesh: THREE.Mesh;
}

export class TerrainChunkManager {
  private scene: THREE.Scene;
  private mat: THREE.MeshStandardMaterial;
  private chunks: Map<string, Chunk> = new Map();
  private lastCx = Number.POSITIVE_INFINITY;
  private lastCz = Number.POSITIVE_INFINITY;

  constructor(scene: THREE.Scene, assets: AssetManager) {
    this.scene = scene;
    this.mat = new THREE.MeshStandardMaterial({
      map: assets.getTexture('floor_albedo') ?? undefined,
      normalMap: assets.getTexture('floor_normal') ?? undefined,
      roughnessMap: assets.getTexture('floor_roughness') ?? undefined,
      color: 0x6a7a55,
      roughness: 1.0,
      metalness: 0.0,
      envMapIntensity: 0.4,
    });
    // Tile the floor texture per chunk so the 256m chunk doesn't look like
    // a single stretched bitmap.
    if (this.mat.map) {
      this.mat.map.wrapS = this.mat.map.wrapT = THREE.RepeatWrapping;
      this.mat.map.repeat.set(CHUNK_SIZE / 8, CHUNK_SIZE / 8);
    }
  }

  /** Per-frame: load any newly-needed chunks, dispose any out of range. */
  update(playerX: number, playerZ: number) {
    const cx = Math.floor(playerX / CHUNK_SIZE);
    const cz = Math.floor(playerZ / CHUNK_SIZE);
    if (cx === this.lastCx && cz === this.lastCz) return;
    this.lastCx = cx;
    this.lastCz = cz;

    for (let dz = -KEEP_RADIUS_CHUNKS; dz <= KEEP_RADIUS_CHUNKS; dz++) {
      for (let dx = -KEEP_RADIUS_CHUNKS; dx <= KEEP_RADIUS_CHUNKS; dx++) {
        const ix = cx + dx;
        const iz = cz + dz;
        const key = `${ix},${iz}`;
        if (!this.chunks.has(key)) this.loadChunk(ix, iz);
      }
    }

    for (const [key, chunk] of this.chunks) {
      const dx = Math.abs(chunk.cx - cx);
      const dz = Math.abs(chunk.cz - cz);
      if (dx > KEEP_RADIUS_CHUNKS || dz > KEEP_RADIUS_CHUNKS) {
        this.scene.remove(chunk.mesh);
        chunk.mesh.geometry.dispose();
        this.chunks.delete(key);
      }
    }
  }

  private loadChunk(cx: number, cz: number) {
    const geo = new THREE.PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE, CHUNK_RES, CHUNK_RES);
    const positions = geo.attributes.position;

    // Chunk centre in world space.
    const baseX = cx * CHUNK_SIZE + CHUNK_SIZE * 0.5;
    const baseZ = cz * CHUNK_SIZE + CHUNK_SIZE * 0.5;

    // The plane lies on local XY. After we apply rotation.x = -π/2, the
    // local Y axis maps to world -Z. So a vertex at local (lx, ly) will be
    // at world (baseX + lx, *, baseZ - ly). We sample height at that world
    // (x, z) so adjacent chunks stitch seamlessly without cracks.
    for (let i = 0; i < positions.count; i++) {
      const lx = positions.getX(i);
      const ly = positions.getY(i);
      const wx = baseX + lx;
      const wz = baseZ - ly;
      positions.setZ(i, sampleTerrainHeight(wx, wz));
    }
    positions.needsUpdate = true;
    geo.computeVertexNormals();

    const mesh = new THREE.Mesh(geo, this.mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(baseX, 0, baseZ);
    mesh.receiveShadow = true;
    mesh.layers.enable(LAYERS.WORLD);
    // Walkable surface — GroundSampler downward-raycasts on this layer.
    mesh.layers.enable(LAYERS.GROUND);
    // Build the BVH once per chunk so per-frame ground queries stay
    // O(log n) instead of O(n triangles). `buildBVHsForScene()` runs
    // once at startup and won't see chunks streamed in later, so we do
    // it inline here. `computeBoundsTree` is a prototype patch installed
    // by `installBVH()` in BVHRaycast.ts.
    type WithBVH = THREE.BufferGeometry & { computeBoundsTree?: () => void };
    (geo as WithBVH).computeBoundsTree?.();
    this.scene.add(mesh);
    this.chunks.set(`${cx},${cz}`, { cx, cz, mesh });
  }

  dispose() {
    for (const c of this.chunks.values()) {
      this.scene.remove(c.mesh);
      c.mesh.geometry.dispose();
    }
    this.chunks.clear();
    this.mat.dispose();
  }
}
