/**
 * BuildingSystem — procedural multi-story building generator and manager.
 *
 * Design rules (scriptable / expandable):
 *  • Buildings are defined by a BuildingDef (archetype) — add new types
 *    without touching the generator.
 *  • Each floor is a FloorPlan with zones (vendor, camp, storage, empty).
 *  • Stairs are geometry primitives placed at consistent positions per
 *    building size so NPCs can navigate between floors.
 *  • NPCManager.spawnCamp() is called per camp zone at init.
 *  • Buildings register in SpatialTracker as EntityType.BUILDING for
 *    LOD and culling decisions.
 *
 * Geometry:
 *  • Shell: BoxGeometry walls + flat roof (MeshStandardMaterial)
 *  • Doors: rectangular cut via BSP would be ideal; here we use an offset
 *    door-frame mesh placed at ground level.
 *  • Stairs: CylinderGeometry steps helical or straight box ramp.
 *  • Windows: small plane meshes on wall surfaces.
 *
 * All geometry uses a shared material atlas for draw-call efficiency.
 */

import * as THREE from 'three';
import { v4 as uuid } from 'uuid';
import { getNPCManager } from '../ai/NPCManager';
import { getSpatialTracker, EntityType, TrackedEntity } from '../SpatialTracker';
import { NPCFaction } from '../ai/NPCBrain';
import { groundY } from '../GroundSampler';

// ─── Building archetypes (add new ones freely) ──────────────────────────────

export type FloorZoneType = 'vendor' | 'camp' | 'storage' | 'empty' | 'shrine';

export interface FloorZoneDef {
  type:       FloorZoneType;
  npcCount?:  number;
  npcFaction?: string;
}

export interface FloorDef {
  height:   number;         // ceiling height metres
  zones:    FloorZoneDef[];
}

export interface BuildingDef {
  archetype: string;        // unique string key
  width:     number;        // metres X
  depth:     number;        // metres Z
  floors:    FloorDef[];
  wallColor?: number;
  roofColor?: number;
}

// ── Prebuilt archetypes ──────────────────────────────────────────────────────

export const BUILDING_ARCHETYPES: Record<string, BuildingDef> = {

  // Small 2-story outpost — floor 1 vendor + floor 2 camp
  outpost: {
    archetype: 'outpost',
    width: 10, depth: 10,
    floors: [
      { height: 3.5, zones: [{ type: 'vendor', npcCount: 1, npcFaction: 'friendly' }] },
      { height: 3.0, zones: [{ type: 'camp',   npcCount: 2, npcFaction: 'neutral'  }] },
    ],
    wallColor: 0x8e7b6a,
    roofColor: 0x5a4a3a,
  },

  // Trading post — floor 1 multi-vendor, floor 2 storage, floor 3 guard camp
  tradingPost: {
    archetype: 'tradingPost',
    width: 16, depth: 12,
    floors: [
      { height: 4.0, zones: [
        { type: 'vendor', npcCount: 2, npcFaction: 'friendly' },
        { type: 'vendor', npcCount: 1, npcFaction: 'friendly' },
      ]},
      { height: 3.0, zones: [{ type: 'storage' }] },
      { height: 3.0, zones: [{ type: 'camp', npcCount: 3, npcFaction: 'neutral' }] },
    ],
    wallColor: 0x9e8c7a,
    roofColor: 0x4e3e2e,
  },

  // Ruined tower — 4 floors, mix of camps and empty
  tower: {
    archetype: 'tower',
    width: 8, depth: 8,
    floors: [
      { height: 3.5, zones: [{ type: 'empty' }] },
      { height: 3.0, zones: [{ type: 'camp', npcCount: 2, npcFaction: 'hostile' }] },
      { height: 3.0, zones: [{ type: 'camp', npcCount: 2, npcFaction: 'hostile' }] },
      { height: 3.0, zones: [{ type: 'shrine' }] },
    ],
    wallColor: 0x6a5a4a,
    roofColor: 0x3a2a1a,
  },

  // Grand hall — wide floor 1 marketplace, floor 2-3 noble camps
  grandHall: {
    archetype: 'grandHall',
    width: 24, depth: 18,
    floors: [
      { height: 5.0, zones: [
        { type: 'vendor', npcCount: 3, npcFaction: 'friendly' },
        { type: 'vendor', npcCount: 2, npcFaction: 'neutral'  },
      ]},
      { height: 3.5, zones: [{ type: 'camp', npcCount: 3, npcFaction: 'neutral' }] },
      { height: 3.5, zones: [{ type: 'camp', npcCount: 2, npcFaction: 'friendly' }] },
    ],
    wallColor: 0xb09880,
    roofColor: 0x6a5a3a,
  },
};

// ─── Building instance ───────────────────────────────────────────────────────

export interface BuildingFloor {
  index:       number;
  worldY:      number;     // base Y of this floor
  group:       THREE.Group;
  zones:       FloorZoneDef[];
  npcGroupId?: string;
}

export class Building implements TrackedEntity {
  readonly trackId:    string;
  readonly trackType:  EntityType = EntityType.BUILDING;
  position:            { x: number; z: number };
  active = true;

  readonly def:        BuildingDef;
  readonly rootGroup:  THREE.Group;
  floors:              BuildingFloor[] = [];
  readonly baseY:      number;

  constructor(
    id: string,
    def: BuildingDef,
    cx: number,
    cz: number,
    baseY: number,
  ) {
    this.trackId   = id;
    this.def       = def;
    this.baseY     = baseY;
    this.position  = { x: cx, z: cz };
    this.rootGroup = new THREE.Group();
    this.rootGroup.position.set(cx, baseY, cz);
  }
}

// ─── Shared materials ────────────────────────────────────────────────────────

function makeMat(color: number, roughness = 0.9): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.05 });
}

const STAIR_MAT = makeMat(0x7a6a5a, 0.85);
const FLOOR_MAT = makeMat(0x6a5a4a, 0.95);
const DOOR_MAT  = makeMat(0x3a2a1a, 1.0);
const WINDOW_MAT= new THREE.MeshStandardMaterial({
  color: 0x88aacc, transparent: true, opacity: 0.55, roughness: 0.1,
});

// ─── BuildingSystem ──────────────────────────────────────────────────────────

export class BuildingSystem {
  private scene:     THREE.Scene;
  private buildings  = new Map<string, Building>();

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  // ── Placement ─────────────────────────────────────────────────────────────

  /**
   * Place a building at world position (cx, cz).
   * Y is auto-sampled from the terrain.
   */
  place(
    defOrKey: BuildingDef | string,
    cx: number,
    cz: number,
    rotationY = 0,
  ): Building {
    const def    = typeof defOrKey === 'string'
      ? BUILDING_ARCHETYPES[defOrKey]
      : defOrKey;
    if (!def) throw new Error(`Unknown building archetype: ${defOrKey}`);

    const id     = uuid();
    const base_y = groundY(cx, cz);
    const bldg   = new Building(id, def, cx, cz, base_y);
    bldg.rootGroup.rotation.y = rotationY;

    this._buildGeometry(bldg);
    this._populateNPCs(bldg);

    this.scene.add(bldg.rootGroup);
    this.buildings.set(id, bldg);
    getSpatialTracker().add(bldg);
    return bldg;
  }

  remove(id: string): void {
    const b = this.buildings.get(id);
    if (!b) return;
    this.scene.remove(b.rootGroup);
    b.active = false;
    getSpatialTracker().remove(b);
    this.buildings.delete(id);
  }

  getBuilding(id: string): Building | undefined { return this.buildings.get(id); }

  // ── Geometry builder ──────────────────────────────────────────────────────

  private _buildGeometry(bldg: Building): void {
    const { def, rootGroup } = bldg;
    const { width: W, depth: D } = def;
    const wallMat = makeMat(def.wallColor ?? 0x8e7b6a);
    const roofMat = makeMat(def.roofColor ?? 0x5a4a3a);

    let cumulativeY = 0;

    for (let fi = 0; fi < def.floors.length; fi++) {
      const fDef = def.floors[fi];
      const H    = fDef.height;
      const floorGroup = new THREE.Group();
      floorGroup.position.y = cumulativeY;

      // ── Floor slab
      const slabGeo = new THREE.BoxGeometry(W, 0.2, D);
      const slab    = new THREE.Mesh(slabGeo, FLOOR_MAT);
      slab.position.y = 0.1;
      slab.receiveShadow = true;
      floorGroup.add(slab);

      // ── Four walls (hollow box via individual planes)
      const wallParts: [number, number, number, number, number, boolean][] = [
        // [posX, posZ, rotY, scaleX, scaleZ, isDoor]
        [0,      -D/2,  0,          W,   H, fi === 0],  // front (with door)
        [0,       D/2,  Math.PI,    W,   H, false     ],  // back
        [-W/2,    0,    Math.PI/2,  D,   H, false     ],  // left
        [ W/2,    0,   -Math.PI/2,  D,   H, false     ],  // right
      ];

      for (const [wx, wz, wy, sw, sh, hasDoor] of wallParts) {
        const wallGeo = new THREE.PlaneGeometry(sw, sh);
        const wall    = new THREE.Mesh(wallGeo, wallMat);
        wall.position.set(wx, H / 2, wz);
        wall.rotation.y = wy;
        wall.castShadow    = true;
        wall.receiveShadow = true;
        floorGroup.add(wall);

        // Window cut-outs (visual only — offset panels)
        if (!hasDoor && fi > 0) {
          this._addWindows(floorGroup, wx, wz, wy, sw, sh, H);
        }

        // Ground floor door opening
        if (hasDoor) {
          const dH = Math.min(2.4, H * 0.68);
          const dW = 1.4;
          const doorGeo = new THREE.PlaneGeometry(dW, dH);
          const door    = new THREE.Mesh(doorGeo, DOOR_MAT);
          door.position.set(0, dH / 2 + 0.01, -D / 2 - 0.01);
          door.rotation.y = 0;
          floorGroup.add(door);
        }
      }

      // ── Stairs to next floor (not on the top floor)
      if (fi < def.floors.length - 1) {
        this._buildStairs(floorGroup, W, D, H);
      }

      // ── Roof cap (only on top floor)
      if (fi === def.floors.length - 1) {
        const roofGeo = new THREE.BoxGeometry(W + 0.4, 0.3, D + 0.4);
        const roof    = new THREE.Mesh(roofGeo, roofMat);
        roof.position.y = H + 0.15;
        roof.castShadow = true;
        floorGroup.add(roof);
      }

      bldg.floors.push({
        index:  fi,
        worldY: bldg.baseY + cumulativeY,
        group:  floorGroup,
        zones:  fDef.zones,
      });

      rootGroup.add(floorGroup);
      cumulativeY += H;
    }
  }

  /**
   * Build a straight stair ramp along the inside right wall.
   * Steps are a series of thin boxes climbing from y=0 to y=floorHeight.
   */
  private _buildStairs(
    parent: THREE.Group,
    W: number,
    D: number,
    H: number,
  ): void {
    const STEPS     = Math.ceil(H / 0.22);
    const stepH     = H / STEPS;
    const stepD     = (D * 0.38) / STEPS;  // stair run along Z axis
    const stepW     = W * 0.22;            // stair width
    const startZ    = D / 2 - 0.5;        // start near back wall
    const startX    = W / 2 - stepW / 2 - 0.15;

    for (let s = 0; s < STEPS; s++) {
      const geo  = new THREE.BoxGeometry(stepW, stepH, stepD);
      const mesh = new THREE.Mesh(geo, STAIR_MAT);
      mesh.position.set(
        startX,
        s * stepH + stepH / 2,
        startZ - s * stepD,
      );
      mesh.castShadow    = true;
      mesh.receiveShadow = true;
      parent.add(mesh);
    }

    // Stair landing platform at the top
    const landGeo  = new THREE.BoxGeometry(stepW, 0.12, stepW);
    const landing  = new THREE.Mesh(landGeo, FLOOR_MAT);
    landing.position.set(startX, H + 0.06, startZ - STEPS * stepD);
    parent.add(landing);
  }

  private _addWindows(
    parent: THREE.Group,
    wx: number, wz: number, wy: number,
    wallW: number, wallH: number, H: number,
  ): void {
    const count = Math.max(1, Math.floor(wallW / 3.5));
    for (let i = 0; i < count; i++) {
      const t    = (i + 0.5) / count;
      const offX = (t - 0.5) * wallW * 0.75;
      const geo  = new THREE.PlaneGeometry(0.9, 1.2);
      const win  = new THREE.Mesh(geo, WINDOW_MAT);
      // Local position on the wall plane (will be rotated with wall)
      win.position.set(wx + Math.cos(wy + Math.PI / 2) * offX,
                       H * 0.55,
                       wz + Math.sin(wy + Math.PI / 2) * offX);
      win.rotation.y = wy;
      parent.add(win);
    }
  }

  // ── NPC population ────────────────────────────────────────────────────────

  private _populateNPCs(bldg: Building): void {
    const mgr = getNPCManager();

    for (const floor of bldg.floors) {
      for (let zi = 0; zi < floor.zones.length; zi++) {
        const zone = floor.zones[zi];
        if (zone.type === 'empty' || zone.type === 'storage') continue;

        const count   = zone.npcCount ?? 2;
        const faction = (zone.npcFaction ?? 'neutral') as NPCFaction;
        const groupId = `${bldg.trackId}_fl${floor.index}_z${zi}`;

        const floorY = floor.worldY + 0.3;
        const zoneX  = bldg.position.x + (zi % 2 === 0 ? -bldg.def.width * 0.2 : bldg.def.width * 0.2);
        const zoneZ  = bldg.position.z;

        const group = mgr.spawnCamp(
          groupId, zoneX, zoneZ, floorY, count, faction,
        );

        // Assign building metadata to each member
        for (const brain of group.members) {
          brain.buildingId  = bldg.trackId;
          brain.isVendor    = zone.type === 'vendor';
          brain.homeFloor   = floor.index;
          brain.homePosition.set(zoneX, floorY, zoneZ);
          if (brain.isVendor) {
            brain.clearGoals();
            brain.pushGoal('vendor' as any, {
              buildingId:  bldg.trackId,
              floorIndex:  floor.index,
            });
          }
        }

        floor.npcGroupId = groupId;
      }
    }
  }

  // ── Utility ───────────────────────────────────────────────────────────────

  /** Get all buildings within radius of (x, z) */
  nearby(x: number, z: number, radius: number): Building[] {
    const r2 = radius * radius;
    const out: Building[] = [];
    for (const b of this.buildings.values()) {
      const dx = b.position.x - x;
      const dz = b.position.z - z;
      if (dx * dx + dz * dz <= r2) out.push(b);
    }
    return out;
  }

  get count(): number { return this.buildings.size; }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

let _instance: BuildingSystem | null = null;
export function getBuildingSystem(scene?: THREE.Scene): BuildingSystem {
  if (!_instance) {
    if (!scene) throw new Error('BuildingSystem: scene required on first call');
    _instance = new BuildingSystem(scene);
  }
  return _instance;
}
export function resetBuildingSystem(): void { _instance = null; }
