/**
 * GLBLocationSystem — loads the 4 world-location GLBs and places them at
 * their designated WorldGen settlement anchors.
 *
 * Responsibilities:
 *   • Scale each scene to a target world-space footprint (X-extent formula).
 *   • Terrain-snap the root (median of a 5×5 ground sample grid).
 *   • Build BVH on every static mesh for collision.
 *   • Fix materials (IBL intensity, clamp emissive).
 *   • Distance-based visibility streaming (update() per frame).
 *   • Collect door proxies (by name) for InteriorPortalSystem.
 *   • Collect breakable wall/ceiling meshes for BreakableWallSystem.
 */

import * as THREE from 'three';
import type { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createGLTFLoader } from '@/game/loaders/createGLTFLoader';
import { getSettlements } from './WorldGen';
import { groundY } from '../GroundSampler';
import { LAYERS } from '../Layers';

// ── Public API types ──────────────────────────────────────────────────────────

export interface DoorProxy {
  mesh: THREE.Object3D;
  worldPosition: THREE.Vector3;
  normalDir: THREE.Vector3;  // outward door-face normal (world space)
  locationId: string;
}

// ── Internal config ───────────────────────────────────────────────────────────

interface LocationCfg {
  id: string;
  file: string;                    // filename under public/locations/
  settlementType: 'town' | 'camp';
  settlementIndex: number;         // 0-based index within that type list
  targetRadius: number;            // desired world-space half-extent (m)
}

const CONFIGS: LocationCfg[] = [
  { id: 'main-town',       file: 'main-town.glb',       settlementType: 'town', settlementIndex: 0, targetRadius: 120 },
  { id: 'market-district', file: 'market-district.glb', settlementType: 'town', settlementIndex: 1, targetRadius:  60 },
  { id: 'misty-town',      file: 'misty-town.glb',      settlementType: 'town', settlementIndex: 2, targetRadius:  80 },
  { id: 'town3f2',         file: 'town3f2.glb',         settlementType: 'town', settlementIndex: 3, targetRadius:  50 },
  { id: 'encampment',      file: 'encampment.glb',      settlementType: 'camp', settlementIndex: 0, targetRadius:  40 },
];

// A location becomes visible when the player is within this multiplier of its radius.
const STREAM_IN_MULT  = 4.0;
// A location becomes hidden when farther than this multiplier (hysteresis).
const STREAM_OUT_MULT = 5.0;

// Name-pattern sets for mesh classification (case-insensitive substring match).
const DOOR_KW  = ['door', 'gate', 'entrance', 'doorway', 'portal', 'enter'];
const WALL_KW  = ['wall', 'ceiling', 'ceil', 'roof', 'partition', 'plank', 'board', 'beam', 'panel'];
const FLOOR_KW = ['floor', 'ground', 'pavement', 'street', 'road', 'path', 'terrain', 'tile'];

// ── Loaded location entry ─────────────────────────────────────────────────────

interface LocationEntry {
  group:        THREE.Group;
  anchorX:      number;
  anchorZ:      number;
  streamRadius: number; // targetRadius — used for proximity streaming
  visible:      boolean;
}

// ── System class ──────────────────────────────────────────────────────────────

export class GLBLocationSystem {
  private loader: GLTFLoader;
  private doorProxies:     DoorProxy[]    = [];
  private breakableMeshes: THREE.Mesh[]   = [];
  private locations:       LocationEntry[] = [];

  /**
   * @param scene          The main THREE.Scene.
   * @param loadingManager Shared manager from AssetManager — so GLB progress
   *                       flows through the same onProgress callback as all
   *                       other game assets (textures, FBX, character GLTF).
   */
  constructor(
    private scene: THREE.Scene,
    loadingManager?: THREE.LoadingManager,
  ) {
    this.loader = createGLTFLoader(loadingManager);
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Load and place all configured GLB locations.
   * @param basePath   Vite BASE_URL (e.g. '/').
   * @param onProgress Optional progress callback; called with (loaded, total).
   */
  async loadAll(
    basePath = '/',
    onProgress?: (loaded: number, total: number) => void,
  ): Promise<void> {
    const settlements = getSettlements();
    const towns = settlements.filter(s => s.type === 'town');
    const camps = settlements.filter(s => s.type === 'camp');

    const base  = basePath.endsWith('/') ? basePath : basePath + '/';
    const total = CONFIGS.length;
    let loaded  = 0;

    await Promise.allSettled(
      CONFIGS.map(cfg => {
        const pool   = cfg.settlementType === 'town' ? towns : camps;
        const anchor = pool[cfg.settlementIndex];
        if (!anchor) {
          console.warn(
            `[GLBLocationSystem] No ${cfg.settlementType}[${cfg.settlementIndex}]` +
            ` settlement — skipping "${cfg.id}".`,
          );
          loaded++;
          onProgress?.(loaded, total);
          return Promise.resolve();
        }
        const url = `${base}locations/${cfg.file}`;
        return this.loadOne(cfg, url, anchor.x, anchor.z).then(() => {
          loaded++;
          onProgress?.(loaded, total);
        });
      }),
    );

    console.info(
      `[GLBLocationSystem] Loaded ${this.locations.length}/${total} locations.` +
      ` Doors: ${this.doorProxies.length}  Breakables: ${this.breakableMeshes.length}`,
    );
  }

  /**
   * Distance-based visibility streaming. Call once per frame with player position.
   * Locations within STREAM_IN_MULT × their radius become visible;
   * farther than STREAM_OUT_MULT × their radius are hidden.
   */
  update(playerX: number, playerZ: number): void {
    for (const entry of this.locations) {
      const dx   = playerX - entry.anchorX;
      const dz   = playerZ - entry.anchorZ;
      const dist = Math.sqrt(dx * dx + dz * dz);

      if (!entry.visible && dist < entry.streamRadius * STREAM_IN_MULT) {
        entry.group.visible = true;
        entry.visible       = true;
      } else if (entry.visible && dist > entry.streamRadius * STREAM_OUT_MULT) {
        entry.group.visible = false;
        entry.visible       = false;
      }
    }
  }

  getDoorProxies():    DoorProxy[]    { return this.doorProxies; }
  getBreakableMeshes(): THREE.Mesh[] { return this.breakableMeshes; }

  dispose(): void {
    for (const { group } of this.locations) {
      this.scene.remove(group);
      group.traverse(obj => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          mats.forEach(m => m.dispose());
        }
      });
    }
    this.locations       = [];
    this.doorProxies     = [];
    this.breakableMeshes = [];
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private loadOne(
    cfg: LocationCfg,
    url: string,
    anchorX: number,
    anchorZ: number,
  ): Promise<void> {
    return new Promise(resolve => {
      this.loader.load(
        url,
        gltf => {
          try {
            this.placeGroup(gltf.scene as THREE.Group, cfg, anchorX, anchorZ);
          } catch (err) {
            console.warn(`[GLBLocationSystem] Placement error for "${cfg.id}":`, err);
          }
          resolve();
        },
        undefined,
        err => {
          console.warn(`[GLBLocationSystem] Failed to load "${url}":`, err);
          resolve();
        },
      );
    });
  }

  private placeGroup(
    group: THREE.Group,
    cfg: LocationCfg,
    anchorX: number,
    anchorZ: number,
  ): void {
    // ── 1. Scale normalisation — spec formula: targetRadius / (xMax - xMin) * 2 ──
    const preBbox = new THREE.Box3().setFromObject(group);
    const xWidth  = preBbox.max.x - preBbox.min.x;
    const scaleFactor = xWidth > 0.001 ? (cfg.targetRadius / xWidth) * 2 : 1;
    group.scale.setScalar(scaleFactor);
    group.updateMatrixWorld(true);

    // ── 2. Terrain-snap: 5×5 ground sample grid → median Y ────────────────
    const step    = cfg.targetRadius * 0.35;
    const samples: number[] = [];
    for (let gi = -2; gi <= 2; gi++) {
      for (let gj = -2; gj <= 2; gj++) {
        samples.push(groundY(anchorX + gi * step, anchorZ + gj * step));
      }
    }
    samples.sort((a, b) => a - b);
    const medianY = samples[Math.floor(samples.length / 2)];

    // ── 3. Compute post-scale bbox and position group ──────────────────────
    const bbox   = new THREE.Box3().setFromObject(group);
    const centerX = (bbox.min.x + bbox.max.x) * 0.5;
    const centerZ = (bbox.min.z + bbox.max.z) * 0.5;

    group.position.set(
      anchorX - centerX,
      medianY - bbox.min.y,
      anchorZ - centerZ,
    );

    // ── 4. Per-mesh processing ────────────────────────────────────────────
    group.updateMatrixWorld(true);

    group.traverse(obj => {
      if (obj instanceof THREE.SkinnedMesh) return;
      if (!(obj instanceof THREE.Mesh))    return;

      const geo = obj.geometry;
      if (!geo.attributes.position || geo.attributes.position.count < 3) return;

      obj.castShadow    = true;
      obj.receiveShadow = true;
      obj.layers.enable(LAYERS.WORLD);

      const nameLow = (obj.name + ' ' + (obj.parent?.name ?? '')).toLowerCase();

      // Tag as walkable ground if either:
      //   • the mesh name contains a floor/ground keyword, OR
      //   • the geometry is a horizontal slab (width and depth >> height).
      // The geometric heuristic is what lets generically-named GLB meshes
      // (Mesh_0, Object_4, …) actually become walkable surfaces — without
      // it, GroundSampler's downward raycast misses the GLB floor entirely
      // and characters sink onto the procedural noise terrain below.
      // Walls/doors get LAYERS.WORLD only (camera occlusion + Rapier
      // collision) so the downward ray never snaps a character onto a
      // wall top.
      const nameMatchFloor = FLOOR_KW.some(k => nameLow.includes(k));
      let geomLooksHorizontal = false;
      if (!nameMatchFloor && !WALL_KW.some(k => nameLow.includes(k))) {
        if (!geo.boundingBox) geo.computeBoundingBox();
        const bb = geo.boundingBox;
        if (bb) {
          const sx = bb.max.x - bb.min.x;
          const sy = bb.max.y - bb.min.y;
          const sz = bb.max.z - bb.min.z;
          // "Slab-like": horizontal footprint at least 3× the vertical
          // extent, and at least 1 m wide in both horizontal axes
          // (filters out thin posts, signs, decals).
          const horizFootprint = Math.min(sx, sz);
          if (horizFootprint >= 1.0 && Math.max(sx, sz) >= 3 * Math.max(sy, 0.05)) {
            geomLooksHorizontal = true;
          }
        }
      }
      if (nameMatchFloor || geomLooksHorizontal) {
        obj.layers.enable(LAYERS.GROUND);
      }

      // Material fixes
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const mat of mats) {
        if (mat instanceof THREE.MeshStandardMaterial) {
          mat.envMapIntensity = 0.6;
          if (mat.emissiveIntensity > 2) mat.emissiveIntensity = 2;
          mat.needsUpdate = true;
        }
      }

      // BVH collision
      const extGeo = geo as THREE.BufferGeometry & { boundsTree?: unknown };
      if (!extGeo.boundsTree) extGeo.computeBoundsTree?.();

      // Breakable walls / ceilings
      if (WALL_KW.some(k => nameLow.includes(k))) {
        const isCeiling     = nameLow.includes('ceil') || nameLow.includes('roof');
        obj.userData.hp     = isCeiling ? 80 : 60;
        obj.userData.maxHp  = obj.userData.hp;
        obj.userData.material       = this.guessMaterialType(obj);
        obj.userData.breakableLocId = cfg.id;
        this.breakableMeshes.push(obj);

        // Tag interior-only meshes so InteriorPortalSystem can hide them
        // from the camera while the player is outside the building.
        // Heuristic: ceilings, roofs, and any wall-ish mesh whose centre is
        // > 1 m above the ground are interior. Keeps exterior facade walls
        // (which sit at floor level and are the player's outside view of
        // the building) on the default layer so they stay visible outdoors.
        // Use the WORLD-space bbox centre — the location root group can
        // be scaled to fit `targetRadius`, so a geometry-local Y of 1 m
        // could be 0.2 m or 5 m in world space. setFromObject() bakes in
        // every parent transform so the > 1 m threshold is always
        // measured in real world metres.
        const worldBox = new THREE.Box3().setFromObject(obj);
        const worldCentreY = (worldBox.min.y + worldBox.max.y) * 0.5;
        // Defensive: never hide anything that was classified as walkable
        // floor above. A misnamed mesh (e.g. "wall_floor_section") would
        // otherwise vanish outdoors and characters would fall through the
        // ground when the camera unhides it. Match the same conditions
        // we used to enable LAYERS.GROUND so the two checks stay in sync.
        const floorTagged = nameMatchFloor || geomLooksHorizontal;
        if (!floorTagged && (isCeiling || worldCentreY > 1)) {
          // Move the mesh OFF the DEFAULT render channel onto INTERIOR only.
          // The main camera (which has DEFAULT enabled) won't render it
          // outdoors; InteriorPortalSystem flips LAYERS.INTERIOR on the
          // camera when the player crosses inside, at which point it
          // becomes visible. WORLD tagging is preserved because layer
          // toggling is rendering-only — BVH raycasts use the geometry
          // directly and ignore layers.
          obj.layers.set(LAYERS.INTERIOR);
          obj.layers.enable(LAYERS.WORLD);
          obj.userData.interiorLocId = cfg.id;
        }
      }

      // Door proxies
      if (DOOR_KW.some(k => nameLow.includes(k))) {
        const worldPos = new THREE.Vector3();
        obj.getWorldPosition(worldPos);
        const fwd = new THREE.Vector3(0, 0, 1).transformDirection(obj.matrixWorld);
        this.doorProxies.push({
          mesh:          obj,
          worldPosition: worldPos,
          normalDir:     fwd,
          locationId:    cfg.id,
        });
      }
    });

    // Visible immediately upon load; streaming update() can hide when very far.
    group.visible = true;

    this.scene.add(group);
    this.locations.push({
      group,
      anchorX,
      anchorZ,
      streamRadius: cfg.targetRadius,
      visible:      true,
    });

    console.info(
      `[GLBLocationSystem] "${cfg.id}" → anchor(${anchorX.toFixed(0)},${anchorZ.toFixed(0)})` +
      `  scale=${scaleFactor.toFixed(3)}  groundY=${medianY.toFixed(1)}`,
    );
  }

  private guessMaterialType(mesh: THREE.Mesh): 'wood' | 'metal' {
    const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    if (!(mat instanceof THREE.MeshStandardMaterial)) return 'wood';
    const hsl = { h: 0, s: 0, l: 0 };
    mat.color.getHSL(hsl);
    return hsl.s < 0.18 && hsl.l < 0.40 ? 'metal' : 'wood';
  }
}
