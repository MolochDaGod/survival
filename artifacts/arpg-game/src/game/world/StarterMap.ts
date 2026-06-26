/**
 * StarterMap — loads the processed town3f2 GLB as the playable starting area.
 *
 * The raw 174 MB Sketchfab export was preprocessed by
 * `scripts/process-map.mjs` (Draco-compressed, mesh-joined, scale-normalised
 * to metres) and the player spawn marker baked into the source as a node
 * named "player" was extracted to a sidecar JSON.
 *
 * Each mesh in the loaded scene is:
 *   • Tagged with LAYERS.WORLD (so the third-person camera occludes against it).
 *   • Tagged with LAYERS.GROUND (so GroundSampler's downward raycast finds
 *     the walkable surface — feet snap to the actual mesh, not the procedural
 *     terrain underneath).
 *   • Given a BVH via the prototype patch installed by BVHRaycast.ts, so
 *     thousands of per-frame ground/camera raycasts stay O(log n).
 *   • Set to cast + receive shadows so it integrates with the existing
 *     three-point dungeon lighting.
 */
import * as THREE from 'three';
import type { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createGLTFLoader } from '@/game/loaders/createGLTFLoader';
import { assetUrl } from '@/lib/assetUrl';
import { LAYERS } from '../Layers';

// Name keywords that identify wall/ceiling meshes — kept in sync with
// GLBLocationSystem so both code paths use identical classification logic.
const WALL_KW = ['wall', 'ceiling', 'ceil', 'roof', 'partition', 'plank', 'board', 'beam', 'panel'];

interface Sidecar {
  source: string;
  scale: number;
  generated?: string;
  spawn: { world: { x: number; y: number; z: number } };
}

/** Default map filename under `public/locations/` when the caller doesn't pass one. */
const DEFAULT_MAP_NAME = 'main-town';

export class StarterMap {
  /** Root group containing the processed map. Null until `load()` resolves. */
  private group: THREE.Group | null = null;
  /** Spawn position in world space (already scaled to metres). */
  private spawn = new THREE.Vector3(0, 0, 0);
  /** True when spawn was loaded from a sidecar; false when computed from bbox. */
  private spawnFromSidecar = false;
  private loader: GLTFLoader;
  private mapName: string;
  /** Meshes classified as breakable walls/ceilings, populated during load(). */
  private breakableMeshes: THREE.Mesh[] = [];

  constructor(
    private scene: THREE.Scene,
    loadingManager?: THREE.LoadingManager,
    mapName: string = DEFAULT_MAP_NAME,
  ) {
    this.mapName = mapName;
    // Centralized GLTF loader handles DRACO + KTX2 + Meshopt; decoders are
    // vendored under /decoders/ so no CDN dependency.
    this.loader = createGLTFLoader(loadingManager);
  }

  /**
   * Fetch the sidecar (spawn coords) and the GLB itself, then add the scene
   * to the world. Resolves once both are in place and BVHs are built.
   *
   * @param basePath Vite `BASE_URL` — guarantees correct base prefix when
   *                 the artifact is mounted at a non-root path.
   */
  async load(_basePath: string): Promise<void> {
    const glbUrl     = assetUrl(`/locations/${this.mapName}.glb`);
    const sidecarUrl = assetUrl(`/locations/${this.mapName}.json`);

    // Sidecar first — small, no Draco roundtrip needed. If it fails we still
    // load the GLB; spawn falls back to the centre of the bounding box once
    // we know the actual map extents (computed below).
    try {
      const r = await fetch(sidecarUrl);
      if (r.ok) {
        const data = (await r.json()) as Sidecar;
        this.spawn.set(data.spawn.world.x, data.spawn.world.y, data.spawn.world.z);
        this.spawnFromSidecar = true;
      }
    } catch (_) {
      // No sidecar → bbox-derived spawn below.
    }

    const gltf = await this.loader.loadAsync(glbUrl);
    this.group = gltf.scene;
    this.group.name = `starter-map-${this.mapName}`;
    this.scene.add(this.group);

    // Tag every mesh + build BVH so raycasts (camera, ground, melee) work.
    type GeoWithBVH = THREE.BufferGeometry & {
      computeBoundsTree?: () => void;
      boundsTree?: unknown;
    };
    let meshCount = 0;
    let bvhBuilt = 0;
    // Dedupe shared-material side flips. Many GLB primitives reuse the same
    // Material instance — setting `.side` on each mesh would re-mutate the
    // same object N times. We track seen materials so we only flip once.
    // (This is purely a perf nicety; the resulting state is identical.)
    const sidedMats = new Set<THREE.Material>();
    this.group.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      meshCount++;

      // Visual: integrate with the existing dungeon lighting.
      obj.castShadow = true;
      obj.receiveShadow = true;
      // Frustum culling stays on — gltf-transform's `join` already merged
      // primitives by material so the residual count is small enough that
      // per-mesh culling is a net win.

      // Double-sided materials: many city meshes are exported as single-sided
      // shells (walls, roofs, awnings). Without DoubleSide the player sees
      // through them from inside a building. We deliberately flip every
      // material in the map — sharing is fine because every mesh that uses
      // the material is part of the same map and we want the whole thing
      // double-sided. shadowSide stays on FrontSide because doubling the
      // shadow contribution on thin walls causes peter-panning.
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const m of mats) {
        if (m && !sidedMats.has(m)) {
          m.side = THREE.DoubleSide;
          sidedMats.add(m);
        }
      }

      // Layers: WORLD → camera occluder; GROUND → walkable, GroundSampler
      // sees only this layer when snapping the player to the floor.
      obj.layers.enable(LAYERS.WORLD);
      obj.layers.enable(LAYERS.GROUND);

      // BVH for cheap raycasts. The prototype patch lives in BVHRaycast.ts
      // and runs at module-init, so this is just "build the tree if missing".
      const geo = obj.geometry as GeoWithBVH;
      if (geo && !geo.boundsTree && typeof geo.computeBoundsTree === 'function') {
        geo.computeBoundsTree();
        bvhBuilt++;
      }

      // ── Breakable wall / ceiling classification ────────────────────────────
      // Use the same keyword list as GLBLocationSystem so tagging is
      // consistent regardless of which loading path is active.
      if (!(obj instanceof THREE.SkinnedMesh)) {
        const nameLow = (obj.name + ' ' + (obj.parent?.name ?? '')).toLowerCase();
        if (WALL_KW.some(k => nameLow.includes(k))) {
          const isCeiling = nameLow.includes('ceil') || nameLow.includes('roof');
          const hp        = isCeiling ? 80 : 60;
          obj.userData.hp       = hp;
          obj.userData.maxHp    = hp;
          obj.userData.material = _guessMaterialType(obj);
          this.breakableMeshes.push(obj);
        }
      }
    });
    // If the sidecar didn't exist, derive a sensible spawn from the loaded
    // map's bounding box. We pick the centre in XZ and then raycast straight
    // DOWN from above the bbox to find the actual topmost mesh surface at
    // that XZ. We can't just use the bbox top — the GLB usually contains a
    // sky dome / cloud plane that pushes bbox.max.y hundreds of metres up,
    // and we can't just use the bbox bottom either (water plane, terrain
    // skirt). The downcast hits the highest real walkable surface and we
    // park the player two metres above it so Rapier / GroundSampler can
    // settle them onto it on the first frame.
    if (!this.spawnFromSidecar) {
      const bbox = new THREE.Box3().setFromObject(this.group);
      const cx = (bbox.min.x + bbox.max.x) * 0.5;
      const cz = (bbox.min.z + bbox.max.z) * 0.5;

      const ray = new THREE.Raycaster(
        new THREE.Vector3(cx, bbox.max.y + 10, cz),
        new THREE.Vector3(0, -1, 0),
        0,
        (bbox.max.y - bbox.min.y) + 20,
      );
      // BVH was just built above for every mesh in `this.group`, so this is
      // a single O(log n) tree walk per mesh, not a brute-force triangle scan.
      const hits = ray.intersectObject(this.group, true);
      // Skip any surface whose normal points significantly downward — those
      // are the underside of cloud planes / ceilings, not walkable ground.
      const groundHit = hits.find((h) => {
        const n = h.face?.normal;
        return !n || n.y > 0.3;
      });

      if (groundHit) {
        this.spawn.set(cx, groundHit.point.y + 2, cz);
      } else {
        // Last-resort fallback: use the bbox FLOOR (not the centre / top),
        // which will at least put the player near terrain rather than 300 m
        // up in the clouds.
        this.spawn.set(cx, bbox.min.y + 2, cz);
      }
    }

    console.log(`[StarterMap] loaded ${this.mapName}: ${meshCount} meshes, ${bvhBuilt} BVHs built; spawn=(${this.spawn.x.toFixed(2)}, ${this.spawn.y.toFixed(2)}, ${this.spawn.z.toFixed(2)})${this.spawnFromSidecar ? '' : ' [bbox]'}`);
  }

  /** Returns a CLONE so callers can't mutate the stored spawn. */
  getSpawn(): THREE.Vector3 {
    return this.spawn.clone();
  }

  /**
   * Root group containing every map mesh. Used by the physics layer to
   * bake static trimesh colliders against the actual world geometry.
   * Null until `load()` resolves.
   */
  getRoot(): THREE.Group | null {
    return this.group;
  }

  /** True once the GLB is in the scene and BVHs are built. */
  isLoaded(): boolean {
    return this.group !== null;
  }

  /** Meshes classified as breakable walls/ceilings. Valid after load() resolves. */
  getBreakableMeshes(): THREE.Mesh[] {
    return this.breakableMeshes;
  }

  dispose(): void {
    this.breakableMeshes = [];
    if (!this.group) return;
    type GeoWithBVH = THREE.BufferGeometry & { disposeBoundsTree?: () => void };
    this.group.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      const geo = obj.geometry as GeoWithBVH;
      geo.disposeBoundsTree?.();
      geo.dispose();
      const m = obj.material as THREE.Material | THREE.Material[];
      if (Array.isArray(m)) m.forEach((mm) => mm.dispose());
      else m.dispose();
    });
    this.scene.remove(this.group);
    this.group = null;
  }
}

// ── Module-level helpers ───────────────────────────────────────────────────

/**
 * Determine whether a mesh looks like wood or metal based on its base-color
 * HSL. Matches the same heuristic used by GLBLocationSystem.guessMaterialType().
 */
function _guessMaterialType(mesh: THREE.Mesh): 'wood' | 'metal' {
  const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  if (!(mat instanceof THREE.MeshStandardMaterial)) return 'wood';
  const hsl = { h: 0, s: 0, l: 0 };
  mat.color.getHSL(hsl);
  return hsl.s < 0.18 && hsl.l < 0.40 ? 'metal' : 'wood';
}
