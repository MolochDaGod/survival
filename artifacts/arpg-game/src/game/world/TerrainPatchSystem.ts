/**
 * TerrainPatchSystem — drops `terrain_patch` GLBs into the world and blends
 * the procedural heightfield smoothly into the patch's perimeter.
 *
 * The math (single source of truth for "what Y is the ground at (x, z)?"):
 *
 *   r = distance from the patch centre to the sample point
 *
 *      r <= R_core      → use the patch's perimeter-edge height verbatim
 *                          (rendered + collided by the GLB itself; the
 *                          procedural chunk mesh sinks underneath)
 *
 *      R_core < r < R_outer
 *                       → smoothstep(t) between the patch edge height at
 *                         the nearest perimeter ring sample and
 *                         worldHeight(x, z), where
 *                            t = (r - R_core) / (R_outer - R_core)
 *
 *      r >= R_outer     → pure procedural worldHeight(x, z)
 *
 * Perimeter heights are sampled ONCE at registration time by raycasting
 * downward at N evenly-spaced angles around the patch AABB — that ring is
 * what the surrounding procedural mesh is asked to feather into.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createGLTFLoader } from '../loaders/createGLTFLoader';
import { LAYERS } from '../Layers';
import { worldHeight } from './WorldGen';
import { assetUrl } from '../../lib/assetUrl';
import { getPrefab, prefabPath, type PrefabDef } from '../../data/prefabs';

const RING_SAMPLES = 64;          // perimeter samples per patch
const RAY_START_Y  = 1000;
const RAY_LENGTH   = 2000;

interface ActivePatch {
  def:         PrefabDef;
  group:       THREE.Group;
  cx:          number;
  cz:          number;
  rCore:       number;            // inner radius (m)
  rOuter:      number;            // outer radius (m) = rCore + blendRing
  ringHeights: Float32Array;      // length = RING_SAMPLES
  centreY:     number;            // height of patch centre (for interior fallback)
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

const _origin = new THREE.Vector3();
const _down   = new THREE.Vector3(0, -1, 0);

export class TerrainPatchSystem {
  private loader: GLTFLoader;
  private patches: ActivePatch[] = [];
  /** Subscribers (e.g. WorldChunkManager) notified when a patch registers
   *  so they can rebuild affected chunks. */
  private listeners = new Set<(p: { cx: number; cz: number; rOuter: number }) => void>();

  constructor(private scene: THREE.Scene, loadingManager?: THREE.LoadingManager) {
    this.loader = createGLTFLoader(loadingManager);
  }

  /** Register a callback fired with each newly-loaded patch's footprint. */
  onPatchAdded(cb: (p: { cx: number; cz: number; rOuter: number }) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  /** All currently active patches (read-only view). */
  getPatches(): ReadonlyArray<ActivePatch> { return this.patches; }

  /** Load + place a terrain patch by prefab id at world (cx, cz). */
  async place(prefabId: string, cx: number, cz: number, opts: { ry?: number; scale?: number } = {}): Promise<ActivePatch | null> {
    const def = getPrefab(prefabId);
    if (!def || def.kind !== 'terrain_patch') {
      console.warn(`[TerrainPatchSystem] "${prefabId}" is not a terrain_patch prefab.`);
      return null;
    }
    const group = await this.loadGLB(def);
    if (!group) return null;

    const scale = opts.scale ?? def.scale;
    group.position.set(cx, 0, cz);
    group.rotation.y = opts.ry ?? 0;
    group.scale.setScalar(scale);
    group.traverse(o => {
      if (o instanceof THREE.Mesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        o.layers.enable(LAYERS.WORLD);
        o.layers.enable(LAYERS.GROUND);
      }
    });
    this.scene.add(group);

    const rCore  = def.patchRadius ?? def.footprint ?? 80;
    const rOuter = rCore + (def.blendRing ?? rCore * 0.5);
    const { ringHeights, centreY } = this.sampleRing(group, cx, cz, rCore);
    const patch: ActivePatch = { def, group, cx, cz, rCore, rOuter, ringHeights, centreY };
    this.patches.push(patch);

    for (const cb of this.listeners) cb({ cx, cz, rOuter });
    return patch;
  }

  /** Returns the blended height at world (x, z) accounting for all patches. */
  sampleBlended(x: number, z: number): number {
    if (this.patches.length === 0) return worldHeight(x, z);
    for (const p of this.patches) {
      const dx = x - p.cx, dz = z - p.cz;
      const r  = Math.sqrt(dx * dx + dz * dz);
      if (r >= p.rOuter) continue;
      // Sample the perimeter ring at the angle of (x,z) relative to the
      // patch centre — that's the boundary height we feather into.
      const ang = Math.atan2(dz, dx);
      const idx = ((ang / (Math.PI * 2)) * RING_SAMPLES + RING_SAMPLES) % RING_SAMPLES;
      const i0  = Math.floor(idx), i1 = (i0 + 1) % RING_SAMPLES;
      const f   = idx - i0;
      const ringY = p.ringHeights[i0] * (1 - f) + p.ringHeights[i1] * f;
      if (r <= p.rCore) return ringY;   // interior — let GLB do the rendering
      // Blend ring: smoothstep procedural → ring edge.
      const t = smoothstep(0, 1, (r - p.rCore) / (p.rOuter - p.rCore));
      return worldHeight(x, z) * t + ringY * (1 - t);
    }
    return worldHeight(x, z);
  }

  private loadGLB(def: PrefabDef): Promise<THREE.Group | null> {
    const url = assetUrl(prefabPath(def));
    return new Promise(resolve => {
      this.loader.load(url, gltf => resolve(gltf.scene as THREE.Group),
        undefined,
        () => { console.warn(`[TerrainPatchSystem] Missing patch GLB "${def.file}".`); resolve(null); });
    });
  }

  /** Raycast straight down at N points around the patch perimeter circle. */
  private sampleRing(group: THREE.Group, cx: number, cz: number, rCore: number) {
    const raycaster = new THREE.Raycaster();
    (raycaster as unknown as { firstHitOnly: boolean }).firstHitOnly = true;
    raycaster.far = RAY_LENGTH;
    const ringHeights = new Float32Array(RING_SAMPLES);
    for (let i = 0; i < RING_SAMPLES; i++) {
      const a = (i / RING_SAMPLES) * Math.PI * 2;
      const x = cx + Math.cos(a) * rCore;
      const z = cz + Math.sin(a) * rCore;
      _origin.set(x, RAY_START_Y, z);
      raycaster.set(_origin, _down);
      const hits = raycaster.intersectObject(group, true);
      ringHeights[i] = hits.length > 0 ? hits[0].point.y : worldHeight(x, z);
    }
    _origin.set(cx, RAY_START_Y, cz);
    raycaster.set(_origin, _down);
    const centreHits = raycaster.intersectObject(group, true);
    const centreY = centreHits.length > 0 ? centreHits[0].point.y : worldHeight(cx, cz);
    return { ringHeights, centreY };
  }
}

// ─── Module-level dispatch used by WorldChunkManager + heightfield collider ──

let _instance: TerrainPatchSystem | null = null;

export function setTerrainPatchSystem(s: TerrainPatchSystem | null): void { _instance = s; }
export function getTerrainPatchSystem(): TerrainPatchSystem | null { return _instance; }

/** Single source of truth for terrain Y — procedural blended with patches. */
export function getBlendedHeight(x: number, z: number): number {
  return _instance ? _instance.sampleBlended(x, z) : worldHeight(x, z);
}
