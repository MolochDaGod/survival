/**
 * Spline-Based Road System — inspired by the Infinite Lands 0.9 road system.
 *
 * Pipeline (mirrors the article):
 *   1. Settlement positions are used as control points.
 *   2. Each pair of nearby settlements is connected with an A* path on a
 *      coarse height grid, taking slope cost into account.
 *   3. The A* waypoints are smoothed with a CatmullRomCurve3 spline.
 *   4. The spline is sampled at fixed intervals; each sample's Y is set by
 *      worldHeight() so the road hugs the ground.
 *   5. A flat ribbon mesh (PlaneGeometry extruded along the spline) is built
 *      for each road segment and placed just above terrain.
 */

import * as THREE from 'three';
import { worldHeight, getSettlements, SettlementDef } from './WorldGen';
import { LAYERS } from '../Layers';

// ─── A* Grid config ───────────────────────────────────────────────────────────

const GRID_RES   = 48;       // metres per grid cell
const ROAD_WIDTH = 3.8;      // metres (visual)
const MAX_SLOPE  = 0.7;      // max height-delta per cell (steeper = blocked)
const MAX_LINK_DIST = 1800;  // don't connect settlements further apart than this

// ─── Min-heap priority queue ──────────────────────────────────────────────────

class MinHeap<T extends { f: number }> {
  private data: T[] = [];
  push(item: T) {
    this.data.push(item);
    this._siftUp(this.data.length - 1);
  }
  pop(): T | undefined {
    if (this.data.length === 0) return undefined;
    const top = this.data[0];
    const last = this.data.pop()!;
    if (this.data.length > 0) {
      this.data[0] = last;
      this._siftDown(0);
    }
    return top;
  }
  get size() { return this.data.length; }
  private _siftUp(i: number) {
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.data[p].f <= this.data[i].f) break;
      [this.data[p], this.data[i]] = [this.data[i], this.data[p]];
      i = p;
    }
  }
  private _siftDown(i: number) {
    const n = this.data.length;
    while (true) {
      let smallest = i;
      const l = 2 * i + 1, r = 2 * i + 2;
      if (l < n && this.data[l].f < this.data[smallest].f) smallest = l;
      if (r < n && this.data[r].f < this.data[smallest].f) smallest = r;
      if (smallest === i) break;
      [this.data[smallest], this.data[i]] = [this.data[i], this.data[smallest]];
      i = smallest;
    }
  }
}

// ─── A* pathfinding ───────────────────────────────────────────────────────────

interface ANode { ix: number; iz: number; g: number; f: number; parent: ANode | null; }

function aStar(
  sx: number, sz: number,   // start world pos
  ex: number, ez: number,   // end world pos
): THREE.Vector2[] | null {
  // Convert to grid
  const gsx = Math.round(sx / GRID_RES);
  const gsz = Math.round(sz / GRID_RES);
  const gex = Math.round(ex / GRID_RES);
  const gez = Math.round(ez / GRID_RES);

  const key = (ix: number, iz: number) => `${ix}|${iz}`;
  const heuristic = (ix: number, iz: number) =>
    Math.sqrt((ix - gex) ** 2 + (iz - gez) ** 2);

  const open = new MinHeap<ANode>();
  const gScore: Map<string, number> = new Map();
  const closed: Set<string> = new Set();

  open.push({ ix: gsx, iz: gsz, g: 0, f: heuristic(gsx, gsz), parent: null });
  gScore.set(key(gsx, gsz), 0);

  const DIRS: [number, number][] = [
    [1, 0], [-1, 0], [0, 1], [0, -1],
    [1, 1], [1, -1], [-1, 1], [-1, -1],
  ];
  const DIAG_COST = Math.SQRT2;
  let iters = 0;

  while (open.size > 0 && iters++ < 20000) {
    const cur = open.pop()!;
    const ck = key(cur.ix, cur.iz);
    if (closed.has(ck)) continue;
    closed.add(ck);

    if (cur.ix === gex && cur.iz === gez) {
      // Reconstruct path
      const path: THREE.Vector2[] = [];
      let n: ANode | null = cur;
      while (n) {
        path.unshift(new THREE.Vector2(n.ix * GRID_RES, n.iz * GRID_RES));
        n = n.parent;
      }
      return path;
    }

    for (const [dx, dz] of DIRS) {
      const nx = cur.ix + dx;
      const nz = cur.iz + dz;
      const nk = key(nx, nz);
      if (closed.has(nk)) continue;

      const wx = nx * GRID_RES;
      const wz = nz * GRID_RES;
      const curH = worldHeight(cur.ix * GRID_RES, cur.iz * GRID_RES);
      const nxtH = worldHeight(wx, wz);
      const slope = Math.abs(nxtH - curH) / GRID_RES;
      if (slope > MAX_SLOPE) continue;     // too steep — blocked

      const stepCost  = (dx !== 0 && dz !== 0 ? DIAG_COST : 1.0);
      const slopeCost = slope * 4;
      const waterCost = nxtH < 0 ? 8 : 0; // prefer land
      const ng = cur.g + stepCost + slopeCost + waterCost;

      const prevG = gScore.get(nk) ?? Infinity;
      if (ng < prevG) {
        gScore.set(nk, ng);
        open.push({ ix: nx, iz: nz, g: ng, f: ng + heuristic(nx, nz), parent: cur });
      }
    }
  }
  return null;  // no path found
}

// ─── Road mesh builder ────────────────────────────────────────────────────────

const roadMat = new THREE.MeshStandardMaterial({
  color:     0x4a3a28,
  roughness: 0.95,
  metalness: 0.0,
  envMapIntensity: 0.2,
});

/**
 * Given a CatmullRomCurve3, sample it and build a flat ribbon mesh
 * that follows the terrain surface.
 */
function buildRoadMesh(spline: THREE.CatmullRomCurve3): THREE.Mesh | null {
  const SAMPLES = 200;
  const pts = spline.getPoints(SAMPLES);
  if (pts.length < 2) return null;

  // For each sample, compute tangent + perpendicular for ribbon vertices
  const positions: number[] = [];
  const uvs:       number[] = [];
  const indices:   number[] = [];

  for (let i = 0; i < pts.length; i++) {
    const p    = pts[i];
    const next = pts[Math.min(i + 1, pts.length - 1)];
    const prev = pts[Math.max(i - 1, 0)];
    const tangent = new THREE.Vector3().subVectors(next, prev).normalize();
    const up      = new THREE.Vector3(0, 1, 0);
    const right   = new THREE.Vector3().crossVectors(tangent, up).normalize();

    const half = ROAD_WIDTH * 0.5;
    const yOff = 0.12;  // float slightly above terrain

    positions.push(
      p.x - right.x * half, p.y + yOff, p.z - right.z * half,
      p.x + right.x * half, p.y + yOff, p.z + right.z * half,
    );
    const uvV = i / (pts.length - 1);
    uvs.push(0, uvV, 1, uvV);

    if (i < pts.length - 1) {
      const base = i * 2;
      indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  geo.setAttribute('uv',       new THREE.BufferAttribute(new Float32Array(uvs),       2));
  geo.setIndex(indices);
  geo.computeVertexNormals();

  const mesh = new THREE.Mesh(geo, roadMat);
  mesh.receiveShadow = true;
  mesh.layers.enable(LAYERS.WORLD);
  return mesh;
}

// ─── RoadSystem public class ──────────────────────────────────────────────────

export class RoadSystem {
  private scene: THREE.Scene;
  private roadMeshes: THREE.Mesh[] = [];

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  /**
   * Generate all roads at startup.  Called once after terrain is ready.
   * Runs synchronously; A* on a 48 m grid is fast enough (< 100 ms total).
   */
  buildAll() {
    const settlements = getSettlements();

    // Connect each settlement to its 2-3 nearest neighbours
    for (let i = 0; i < settlements.length; i++) {
      const a = settlements[i];

      // Collect sorted neighbours
      const neighbours = settlements
        .map((b, j) => ({
          b, j,
          dist: Math.hypot(b.x - a.x, b.z - a.z),
        }))
        .filter(n => n.j !== i && n.dist < MAX_LINK_DIST)
        .sort((p, q) => p.dist - q.dist)
        .slice(0, 3);

      for (const { b, j } of neighbours) {
        if (j < i) continue;  // already built from the other direction
        this.buildRoad(a, b);
      }
    }
  }

  private buildRoad(a: SettlementDef, b: SettlementDef) {
    const path = aStar(a.x, a.z, b.x, b.z);
    if (!path || path.length < 2) return;

    // Convert 2D grid path to 3D spline control points, sampling terrain Y
    const ctrlPts: THREE.Vector3[] = path.map(
      p => new THREE.Vector3(p.x, worldHeight(p.x, p.y) + 0.05, p.y),
    );

    // Simplify: keep every Nth point to reduce spline nodes
    const simplified: THREE.Vector3[] = [ctrlPts[0]];
    const SKIP = Math.max(1, Math.floor(ctrlPts.length / 40));
    for (let i = SKIP; i < ctrlPts.length - 1; i += SKIP) simplified.push(ctrlPts[i]);
    simplified.push(ctrlPts[ctrlPts.length - 1]);

    const spline = new THREE.CatmullRomCurve3(simplified, false, 'catmullrom', 0.5);
    const mesh   = buildRoadMesh(spline);
    if (!mesh) return;

    this.scene.add(mesh);
    this.roadMeshes.push(mesh);
  }

  dispose() {
    for (const m of this.roadMeshes) {
      this.scene.remove(m);
      m.geometry.dispose();
    }
    this.roadMeshes = [];
    roadMat.dispose();
  }
}
