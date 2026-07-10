/**
 * ModularBuilding — player-driven modular construction system.
 *
 * Loads a small catalog of kaykit_dungeon GLBs (foundation, wall, wall_door,
 * door, wall_window, wall_corner, floor, stairs, roof) and provides:
 *
 *  • Ghost preview that follows the player's view, snapped to a 4 m grid.
 *  • R-key 90° rotation; valid/invalid colouring for the ghost.
 *  • Left-click to commit a piece, consume one of the matching item from the
 *    inventory, and emit a placement event for any UI listeners.
 *  • serialize() / restore() so placed structures survive a cloud save round-trip.
 *
 * Pieces are auto-scaled so their longest XZ extent fits a single 4 m grid
 * cell — this saves us from hand-tuning per-asset scales while still
 * guaranteeing the kit looks consistent at placement time.
 */
import * as THREE from 'three';
import { createGLTFLoader } from '@/game/loaders/createGLTFLoader';
import { extractGltfSubnode, fitGroupToXZ, parseGltfPath } from '@/game/loaders/extractGltfSubnode';
import { LAYERS } from '../Layers';

/**
 * Survival-stack adapter — ModularBuilding doesn't own the inventory; the UI
 * does (GameCanvas keeps `survivalStacks` in React state). We pass in a tiny
 * read/consume bridge so the engine never has to know how the UI stores it.
 */
export interface SurvivalProvider {
  getCount(itemId: string): number;
  /** Decrement by 1. Returns true on success, false if the stack was empty. */
  consumeOne(itemId: string): boolean;
}

export type BuildingPieceId =
  | 'mb_foundation'
  | 'mb_wall'
  | 'mb_wall_door'
  | 'mb_door'
  | 'mb_wall_window'
  | 'mb_wall_corner'
  | 'mb_floor'
  | 'mb_stairs'
  | 'mb_roof'
  // ── medieval_village additions (alternative wall/roof palette) ────────────
  | 'mb_wall_plaster'
  | 'mb_wall_brick'
  | 'mb_roof_tile'
  | 'mb_stairs_solid'
  // ── fantasy_megakit furniture (player-placeable decoration) ───────────────
  | 'mb_workbench'
  | 'mb_anvil'
  | 'mb_table'
  | 'mb_bed'
  | 'mb_chest'
  | 'mb_bookcase'
  | 'mb_bench'
  | 'mb_lantern'
  // ── low_poly farm / village wood props (sub-nodes in a single GLB) ────────
  | 'wt_fence'
  | 'wt_bucket'
  | 'wt_ladder'
  | 'wt_box'
  | 'wt_barrel'
  | 'wt_sign';

interface PieceDef {
  id: BuildingPieceId;
  glbPath: string;
  /** Preferred Y offset above the grid plane (used for floors/roofs). */
  yOffset: number;
  /** Target longest XZ extent in metres (defaults to GRID). */
  fitSize?: number;
}

/** Grid cell size in metres. Standard for survival-game modular kits. */
const GRID = 4;

/**
 * Catalog. Paths are root-relative under public/. The roof entry reuses the
 * `floorDecoration_tilesLarge` tile but is anchored 3 m above grid so a wall
 * ring underneath looks sensible — until we ship a dedicated roof asset this
 * is a perfectly serviceable visual.
 */
const PIECES: Record<BuildingPieceId, PieceDef> = {
  mb_foundation: { id: 'mb_foundation', glbPath: 'models/environment/kaykit_dungeon/floorDecoration_tilesLarge.gltf.glb', yOffset: 0 },
  mb_wall: { id: 'mb_wall', glbPath: 'models/environment/kaykit_dungeon/wall.gltf.glb', yOffset: 0 },
  mb_wall_door: { id: 'mb_wall_door', glbPath: 'models/environment/kaykit_dungeon/wall_door.gltf.glb', yOffset: 0 },
  mb_door: { id: 'mb_door', glbPath: 'models/environment/kaykit_dungeon/door.gltf.glb', yOffset: 0 },
  mb_wall_window: { id: 'mb_wall_window', glbPath: 'models/environment/kaykit_dungeon/wall_window.gltf.glb', yOffset: 0 },
  mb_wall_corner: { id: 'mb_wall_corner', glbPath: 'models/environment/kaykit_dungeon/wallCorner.gltf.glb', yOffset: 0 },
  mb_floor: { id: 'mb_floor', glbPath: 'models/environment/kaykit_dungeon/floorDecoration_wood.gltf.glb', yOffset: 0 },
  mb_stairs: { id: 'mb_stairs', glbPath: 'models/environment/kaykit_dungeon/stairs.gltf.glb', yOffset: 0 },
  mb_roof: { id: 'mb_roof', glbPath: 'models/environment/kaykit_dungeon/floorDecoration_tilesLarge.gltf.glb', yOffset: 3.0 },

  // medieval_village palette
  mb_wall_plaster: { id: 'mb_wall_plaster', glbPath: 'models/environment/medieval_village/glTF/Wall_Plaster_Straight.gltf', yOffset: 0 },
  mb_wall_brick: { id: 'mb_wall_brick', glbPath: 'models/environment/medieval_village/glTF/Wall_UnevenBrick_Straight.gltf', yOffset: 0 },
  mb_roof_tile: { id: 'mb_roof_tile', glbPath: 'models/environment/medieval_village/glTF/Roof_RoundTiles_4x4.gltf', yOffset: 3.0 },
  mb_stairs_solid: { id: 'mb_stairs_solid', glbPath: 'models/environment/medieval_village/glTF/Stair_Interior_Solid.gltf', yOffset: 0 },

  // fantasy_megakit furniture
  mb_workbench: { id: 'mb_workbench', glbPath: 'models/props/fantasy_megakit/Exports/glTF/Workbench.gltf', yOffset: 0 },
  mb_anvil: { id: 'mb_anvil', glbPath: 'models/props/fantasy_megakit/Exports/glTF/Anvil.gltf', yOffset: 0 },
  mb_table: { id: 'mb_table', glbPath: 'models/props/fantasy_megakit/Exports/glTF/Table_Large.gltf', yOffset: 0 },
  mb_bed: { id: 'mb_bed', glbPath: 'models/props/fantasy_megakit/Exports/glTF/Bed_Twin1.gltf', yOffset: 0 },
  mb_chest: { id: 'mb_chest', glbPath: 'models/props/fantasy_megakit/Exports/glTF/Chest_Wood.gltf', yOffset: 0 },
  mb_bookcase: { id: 'mb_bookcase', glbPath: 'models/props/fantasy_megakit/Exports/glTF/Bookcase_2.gltf', yOffset: 0 },
  mb_bench: { id: 'mb_bench', glbPath: 'models/props/fantasy_megakit/Exports/glTF/Bench.gltf', yOffset: 0 },
  mb_lantern: { id: 'mb_lantern', glbPath: 'models/props/fantasy_megakit/Exports/glTF/Lantern_Wall.gltf', yOffset: 0 },

  // low_poly farm / village wood pack — meshes extracted by node name (# suffix).
  wt_fence:  { id: 'wt_fence',  glbPath: 'models/props/low_poly_farm_wood/pack.glb#Fence',   yOffset: 0, fitSize: 4.0 },
  wt_bucket: { id: 'wt_bucket', glbPath: 'models/props/low_poly_farm_wood/pack.glb#Bucket',  yOffset: 0, fitSize: 1.2 },
  wt_ladder: { id: 'wt_ladder', glbPath: 'models/props/low_poly_farm_wood/pack.glb#Ladder',  yOffset: 0, fitSize: 2.5 },
  wt_box:    { id: 'wt_box',    glbPath: 'models/props/low_poly_farm_wood/pack.glb#Box',     yOffset: 0, fitSize: 1.5 },
  wt_barrel: { id: 'wt_barrel', glbPath: 'models/props/low_poly_farm_wood/pack.glb#Barrel',  yOffset: 0, fitSize: 1.5 },
  wt_sign:   { id: 'wt_sign',   glbPath: 'models/props/low_poly_farm_wood/pack.glb#Pointer', yOffset: 0, fitSize: 2.0 },
};

export interface PlacedPieceData {
  itemId: BuildingPieceId;
  x: number; y: number; z: number;
  rotY: number;
}

interface PlacedRecord extends PlacedPieceData {
  group: THREE.Group;
}

/** All-in-one snapshot for cloud save. */
export interface ModularBuildingSnapshot {
  pieces: PlacedPieceData[];
}

const GHOST_VALID_COLOR   = new THREE.Color(0x00ff66);
const GHOST_INVALID_COLOR = new THREE.Color(0xff3322);

export class ModularBuilding {
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private survival: SurvivalProvider;
  private loader = createGLTFLoader();

  /** Cached source mesh per piece — ghost & permanent placements clone from this. */
  private sourceCache = new Map<BuildingPieceId, THREE.Group>();
  /** Auto-computed uniform scale per piece so pieces fit the grid. */
  private scaleCache = new Map<BuildingPieceId, number>();
  /** Shared loaded GLTF roots keyed by url (before #node extraction). */
  private gltfRootCache = new Map<string, THREE.Group>();

  /** Currently selected blueprint, or null when build mode is off. */
  private activePieceId: BuildingPieceId | null = null;
  private ghost: THREE.Group | null = null;
  private ghostRotY = 0;
  private ghostValid = false;

  /** All committed pieces, in insertion order. */
  private placed: PlacedRecord[] = [];

  /** Reusable raycaster for ghost positioning. */
  private raycaster = new THREE.Raycaster();
  private screenCentre = new THREE.Vector2(0, 0);

  /**
   * Caller may listen for placement events (UI feedback / sound / inv refresh).
   * The `group` argument is the just-placed Three.js Object — useful for
   * downstream systems like DoorSystem that need to register the new mesh.
   */
  onPlace: ((piece: BuildingPieceId, position: THREE.Vector3, group: THREE.Group) => void) | null = null;

  constructor(scene: THREE.Scene, camera: THREE.PerspectiveCamera, survival: SurvivalProvider) {
    this.scene = scene;
    this.camera = camera;
    this.survival = survival;
    // Ghost & placement raycasts only see the GROUND layer (the starter map
    // tags every mesh with both WORLD and GROUND so this picks up city geometry).
    this.raycaster.layers.set(LAYERS.GROUND);
  }

  /** Swap the survival adapter at runtime (used when the UI rebuilds its provider). */
  setSurvivalProvider(p: SurvivalProvider): void {
    this.survival = p;
  }

  // ── Catalog access ───────────────────────────────────────────────────────

  static isBuildingItem(itemId: string): itemId is BuildingPieceId {
    return itemId in PIECES;
  }

  // ── Loading ──────────────────────────────────────────────────────────────

  /** Pre-load every piece in the catalog. Safe to call once at boot. */
  async preload(basePath: string): Promise<void> {
    await Promise.all(Object.values(PIECES).map((def) => this.loadPiece(def, basePath)));
  }

  private async loadPiece(def: PieceDef, basePath: string): Promise<void> {
    if (this.sourceCache.has(def.id)) return;
    try {
      const { url, nodeName } = parseGltfPath(def.glbPath);
      const fullUrl = `${basePath}${url}`;
      let root = this.gltfRootCache.get(fullUrl);
      if (!root) {
        const gltf = await this.loader.loadAsync(fullUrl);
        root = gltf.scene;
        this.gltfRootCache.set(fullUrl, root);
      }
      const group = nodeName
        ? extractGltfSubnode(root, nodeName)
        : root.clone(true);
      if (!group) {
        console.warn(`[ModularBuilding] node "${nodeName}" not found in ${url}`);
        return;
      }
      const scale = fitGroupToXZ(group, def.fitSize ?? GRID);
      this.scaleCache.set(def.id, scale);
      this.sourceCache.set(def.id, group);
    } catch (e) {
      console.warn(`[ModularBuilding] failed to load ${def.id} from ${def.glbPath}`, e);
    }
  }

  /**
   * Spawn an instance from the cached source. `cloneMaterials=true` is used
   * for the ghost so we can recolour/transparency-tweak it without poisoning
   * the shared GLB material that every placed instance reads from.
   */
  private instantiate(pieceId: BuildingPieceId, cloneMaterials: boolean): THREE.Group | null {
    const src = this.sourceCache.get(pieceId);
    if (!src) return null;
    const inst = src.clone(true);
    const scale = this.scaleCache.get(pieceId) ?? 1;
    inst.scale.setScalar(scale);
    inst.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        if (cloneMaterials) {
          // Clone material(s) so the ghost can be tinted/transparent without
          // affecting placed pieces or the cached source.
          if (Array.isArray(o.material)) {
            o.material = o.material.map((m) => m.clone());
          } else if (o.material) {
            o.material = o.material.clone();
          }
        }
      }
    });
    return inst;
  }

  // ── Blueprint mode ───────────────────────────────────────────────────────

  /** Enter build mode for the given piece, or null to clear. */
  setBlueprint(itemId: string | null): void {
    if (itemId === null || !ModularBuilding.isBuildingItem(itemId)) {
      this.clearBlueprint();
      return;
    }
    if (this.activePieceId === itemId) return;
    this.clearBlueprint();
    this.activePieceId = itemId;
    this.ghostRotY = 0;
    this.ghost = this.instantiate(itemId, /* cloneMaterials */ true);
    if (this.ghost) {
      this.applyGhostMaterial(this.ghost, true);
      this.ghost.visible = false;
      this.scene.add(this.ghost);
    }
  }

  clearBlueprint(): void {
    if (this.ghost) {
      this.scene.remove(this.ghost);
      // Only the ghost's MATERIALS are unique (we cloned them in instantiate).
      // Geometries are shared with the cached source + every placed piece, so
      // disposing them would corrupt every existing structure. Walk the ghost
      // and dispose only the material clones.
      this.disposeGhostMaterialsOnly(this.ghost);
    }
    this.ghost = null;
    this.activePieceId = null;
    this.ghostValid = false;
  }

  /** Rotate the active ghost 90° clockwise (around Y). */
  rotateBlueprint(deltaDeg: number = 90): void {
    if (!this.ghost) return;
    this.ghostRotY = (this.ghostRotY + (deltaDeg * Math.PI) / 180) % (Math.PI * 2);
    this.ghost.rotation.y = this.ghostRotY;
  }

  /** True iff a ghost is currently active in the scene. */
  hasActiveBlueprint(): boolean {
    return this.activePieceId !== null;
  }

  // ── Per-frame tick ───────────────────────────────────────────────────────

  /**
   * Update the ghost position/colour each frame. Casts a ray from screen
   * centre through the world; when it hits a ground surface, snaps the ghost
   * to the nearest grid intersection within sensible range of the player.
   */
  tick(playerPos: THREE.Vector3): void {
    if (!this.activePieceId || !this.ghost) return;
    this.raycaster.setFromCamera(this.screenCentre, this.camera);
    const groundCandidates: THREE.Object3D[] = [];
    this.scene.traverse((o) => {
      if (o instanceof THREE.Mesh && o.layers.test(this.raycaster.layers)) {
        groundCandidates.push(o);
      }
    });
    const hits = this.raycaster.intersectObjects(groundCandidates, false);
    const hit = hits[0];

    if (!hit) {
      this.ghost.visible = false;
      this.ghostValid = false;
      return;
    }

    // Range cap so players can't reach across the map.
    const distFromPlayer = hit.point.distanceTo(playerPos);
    if (distFromPlayer > 14) {
      this.ghost.visible = false;
      this.ghostValid = false;
      return;
    }

    const def = PIECES[this.activePieceId];
    const sx = Math.round(hit.point.x / GRID) * GRID;
    const sz = Math.round(hit.point.z / GRID) * GRID;
    this.ghost.position.set(sx, hit.point.y + def.yOffset, sz);
    this.ghost.visible = true;

    // Validity: must own at least one unit of the matching item.
    const owned = this.inventoryCount(this.activePieceId);
    this.ghostValid = owned > 0;
    this.applyGhostMaterial(this.ghost, this.ghostValid);
  }

  // ── Placement ────────────────────────────────────────────────────────────

  /** Try to commit the ghost. Returns true on success. */
  tryPlace(): boolean {
    if (!this.activePieceId || !this.ghost || !this.ghost.visible || !this.ghostValid) return false;

    const itemId = this.activePieceId;
    // Build the placed instance FIRST so a failed instantiate() doesn't eat a
    // stack item. Only consume after the world commit is guaranteed.
    const placedGroup = this.instantiate(itemId, /* cloneMaterials */ false);
    if (!placedGroup) return false;
    if (!this.consumeOne(itemId)) {
      // Player ran out between the per-frame validity check and the click.
      this.ghostValid = false;
      return false;
    }
    placedGroup.position.copy(this.ghost.position);
    placedGroup.rotation.y = this.ghostRotY;
    this.scene.add(placedGroup);

    const rec: PlacedRecord = {
      itemId,
      x: placedGroup.position.x,
      y: placedGroup.position.y,
      z: placedGroup.position.z,
      rotY: this.ghostRotY,
      group: placedGroup,
    };
    this.placed.push(rec);

    this.onPlace?.(itemId, placedGroup.position.clone(), placedGroup);

    // After placement, refresh ghost validity (player may have run out).
    if (this.inventoryCount(itemId) <= 0) {
      this.clearBlueprint();
    }
    return true;
  }

  // ── Save/restore ─────────────────────────────────────────────────────────

  serialize(): ModularBuildingSnapshot {
    return {
      pieces: this.placed.map((p) => ({
        itemId: p.itemId, x: p.x, y: p.y, z: p.z, rotY: p.rotY,
      })),
    };
  }

  /** Restore previously-placed pieces. Caller must have already preloaded. */
  restore(snap: ModularBuildingSnapshot): void {
    if (!snap?.pieces) return;
    for (const p of snap.pieces) {
      if (!ModularBuilding.isBuildingItem(p.itemId)) continue;
      const g = this.instantiate(p.itemId, /* cloneMaterials */ false);
      if (!g) continue;
      g.position.set(p.x, p.y, p.z);
      g.rotation.y = p.rotY;
      this.scene.add(g);
      this.placed.push({ ...p, group: g });
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private inventoryCount(itemId: BuildingPieceId): number {
    return this.survival.getCount(itemId);
  }

  private consumeOne(itemId: BuildingPieceId): boolean {
    return this.survival.consumeOne(itemId);
  }

  private applyGhostMaterial(group: THREE.Group, valid: boolean): void {
    const colour = valid ? GHOST_VALID_COLOR : GHOST_INVALID_COLOR;
    group.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      // We mutate in place because the ghost is a clone we own.
      if (Array.isArray(o.material)) return;
      const mat = o.material as THREE.Material & {
        transparent?: boolean;
        opacity?: number;
        depthWrite?: boolean;
        color?: THREE.Color;
        emissive?: THREE.Color;
      };
      mat.transparent = true;
      mat.opacity = 0.55;
      mat.depthWrite = false;
      mat.emissive?.copy(colour);
      mat.color?.copy(colour);
    });
  }

  /** Dispose only the per-mesh material clones (ghost-only). */
  private disposeGhostMaterialsOnly(group: THREE.Group): void {
    group.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      const m = o.material as THREE.Material | THREE.Material[];
      if (Array.isArray(m)) m.forEach((mm) => mm.dispose());
      else m?.dispose();
    });
  }

  /** Tear down everything we own — placed pieces, ghost, source cache. */
  dispose(): void {
    this.clearBlueprint();
    for (const rec of this.placed) {
      this.scene.remove(rec.group);
    }
    this.placed = [];
    // Source GLB groups: remove from cache. Geometries/materials inside are
    // shared by Three's clone — they'll be GC'd once no live group references
    // them. Three's renderer handles GPU resource cleanup on its own dispose.
    this.sourceCache.clear();
    this.scaleCache.clear();
    this.gltfRootCache.clear();
  }
}
