/**
 * ResourceSystem — procedural harvestable resource nodes on the terrain.
 *
 * Design:
 *   • Placement is deterministic from world seed — same run = same nodes.
 *   • Each node registers in SpatialTracker so minimap + culling work for free.
 *   • Nodes within the player's 100 m render bubble get a Three.js mesh;
 *     those outside are tracked positionally only (no draw calls).
 *   • Each node has an HP, respawn timer, and loot table.
 *   • Expanding: add a new ResourceDef to RESOURCE_DEFS — zero other changes.
 */

import * as THREE from 'three';
import { getBiome, worldHeight, Biome } from './WorldGen';
import { groundY } from '../GroundSampler';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import { HarvestablePlacer } from './HarvestablePlacer';
import { ensureSceneGraph } from './SceneGraphLayers';

import { getSpatialTracker, EntityType, TrackedEntity } from '../SpatialTracker';
import { getFogOfWar } from './FogOfWar';
import { activeHarvestWeightAt } from '../../data/sectorCanon';

// String key → Biome enum (const enum so we reference the imported symbols).
const BIOME_KEY_MAP: Record<string, Biome> = {
  deepocean:  Biome.DeepOcean,
  ocean:      Biome.Ocean,
  shallowsea: Biome.ShallowSea,
  beach:      Biome.Beach,
  grassland:  Biome.Grassland,
  forest:     Biome.Forest,
  highland:   Biome.Highland,
  mountain:   Biome.Mountain,
  snowpeak:   Biome.SnowPeak,
};

// ─── Resource definitions (scriptable — add freely) ──────────────────────────

export interface ResourceLoot {
  itemId: string;
  min:    number;
  max:    number;
  chance: number;  // 0–1
}

export interface ResourceDef {
  id:         string;
  label:      string;
  biomes:     string[];      // which biome keys this spawns in
  color:      number;        // fallback mesh color when GLB missing
  radius:     number;        // mesh bounding radius metres
  maxHp:      number;
  respawnSec: number;
  loot:       ResourceLoot[];
  /** Nodes per km² in matching biome */
  density:    number;
  minimapColor: string;      // CSS color for minimap dot
  /**
   * NatureAssets key (tree/bush/ore/herb/…) — loads original-game GLB with
   * textures. When unset, falls back to procedural geometry + flat color.
   */
  meshKey?:   string;
  /** Extra multiplicative tint applied after GLB load (optional). */
  meshTint?:  number;
}

export const RESOURCE_DEFS: ResourceDef[] = [
  {
    id: 'timber_log',
    label: 'Fallen Log',
    biomes: ['forest'],
    color: 0x3d2b1f,
    radius: 1.5,
    maxHp: 30,
    respawnSec: 300,
    density: 120,
    minimapColor: '#5c3a1a',
    meshKey: 'log',
    meshTint: 0x5c3a1a,
    loot: [
      { itemId: 'wood_chopped', min: 2, max: 5, chance: 1.0 },
      { itemId: 'branch_a',     min: 0, max: 2, chance: 0.5 },
      { itemId: 'branch_b',     min: 0, max: 1, chance: 0.2 },
    ],
  },
  {
    id: 'iron_ore',
    label: 'Iron Vein',
    biomes: ['highland', 'default'],
    color: 0x6e6e78,
    radius: 1.2,
    maxHp: 50,
    respawnSec: 600,
    density: 40,
    minimapColor: '#888',
    meshKey: 'ore',
    meshTint: 0x8899bb,
    loot: [
      { itemId: 'rock_7', min: 2, max: 4, chance: 1.0 }, // ore chunk
      { itemId: 'rock_5', min: 0, max: 2, chance: 0.4 }, // flint
    ],
  },
  {
    id: 'permafrost_ore',
    label: 'Permafrost Vein',
    biomes: ['tundra'],
    color: 0x9ab8dd,
    radius: 1.4,
    maxHp: 60,
    respawnSec: 720,
    density: 35,
    minimapColor: '#9ab8dd',
    meshKey: 'crystal',
    meshTint: 0xaaccff,
    loot: [
      { itemId: 'rock_7', min: 1, max: 3, chance: 1.0 },
      { itemId: 'rock_3', min: 0, max: 2, chance: 0.6 },
      { itemId: 'rock_6', min: 0, max: 1, chance: 0.08 }, // coal rare
    ],
  },
  {
    id: 'copper_deposit',
    label: 'Copper Deposit',
    biomes: ['desert'],
    color: 0xb87333,
    radius: 1.1,
    maxHp: 40,
    respawnSec: 480,
    density: 50,
    minimapColor: '#b87333',
    meshKey: 'rock',
    meshTint: 0xb87333,
    loot: [
      { itemId: 'rock_7', min: 2, max: 5, chance: 1.0 },
      { itemId: 'rock_2', min: 0, max: 3, chance: 0.5 },
    ],
  },
  {
    id: 'wild_herbs',
    label: 'Wild Herbs',
    biomes: ['forest', 'highland', 'default'],
    color: 0x2e6e1e,
    radius: 0.6,
    maxHp: 5,
    respawnSec: 120,
    density: 200,
    minimapColor: '#2e9e1e',
    meshKey: 'herb',
    meshTint: 0x44cc44,
    loot: [
      { itemId: 'branch_a', min: 1, max: 3, chance: 1.0 },
      { itemId: 'branch_b', min: 0, max: 1, chance: 0.15 },
    ],
  },
  {
    id: 'hemp_plant',
    label: 'Wild Hemp',
    biomes: ['grassland', 'forest', 'default'],
    color: 0x4a8a30,
    radius: 0.7,
    maxHp: 8,
    respawnSec: 180,
    density: 90,
    minimapColor: '#4a8a30',
    meshKey: 'hemp',
    meshTint: 0x66aa44,
    loot: [
      { itemId: 'branch_a', min: 1, max: 4, chance: 1.0 },
      { itemId: 'wood_chopped', min: 0, max: 1, chance: 0.2 },
    ],
  },
  {
    id: 'scrap_pile',
    label: 'Scrap Pile',
    biomes: ['highland', 'desert', 'default'],
    color: 0x6a6a62,
    radius: 1.3,
    maxHp: 35,
    respawnSec: 480,
    density: 25,
    minimapColor: '#7a7a70',
    meshKey: 'scrap',
    loot: [
      { itemId: 'rock_7', min: 2, max: 5, chance: 1.0 },
      { itemId: 'rock_6', min: 0, max: 2, chance: 0.35 },
    ],
  },
  {
    id: 'frozen_pond',
    label: 'Frozen Pond',
    biomes: ['tundra'],
    color: 0x6ab4cc,
    radius: 2.0,
    maxHp: 10,
    respawnSec: 240,
    density: 20,
    minimapColor: '#6ab4cc',
    meshKey: 'rock2',
    meshTint: 0x6ab4cc,
    loot: [
      { itemId: 'bottle_full', min: 1, max: 2, chance: 0.8 },
      { itemId: 'rock_5',     min: 0, max: 2, chance: 0.45 },
    ],
  },
  {
    id: 'flint_outcrop',
    label: 'Flint Outcrop',
    biomes: ['highland', 'desert', 'default'],
    color: 0x8a7a6a,
    radius: 0.9,
    maxHp: 20,
    respawnSec: 200,
    density: 60,
    minimapColor: '#8a7a6a',
    meshKey: 'rock',
    meshTint: 0x8a7a6a,
    loot: [
      { itemId: 'rock_5', min: 2, max: 4, chance: 1.0 }, // flint
      { itemId: 'rock_2', min: 0, max: 2, chance: 0.3 },
    ],
  },
];

const DEF_BY_ID = new Map(RESOURCE_DEFS.map(d => [d.id, d]));

// ─── Resource node instance ───────────────────────────────────────────────────

export interface ResourceNode extends TrackedEntity {
  defId:        string;
  hp:           number;
  maxHp:        number;
  respawnAt:    number;   // timestamp ms when it respawns; 0 = alive
  /** Visual root under HarvestRoot (three-layer scene graph). */
  mesh?:        THREE.Object3D;
  worldY:       number;
  /** True once an async GLB load has been requested (avoid spam). */
  meshLoading?: boolean;
}

// ─── Lightweight deterministic RNG (seeded by position) ──────────────────────

function seededRand(x: number, z: number, salt: number): number {
  let h = (Math.sin(x * 127.1 + z * 311.7 + salt * 74.3) * 43758.5453) % 1;
  if (h < 0) h += 1;
  return h;
}

// ─── Shared placeholder geometry per def ─────────────────────────────────────

const _geoCache = new Map<string, THREE.BufferGeometry>();
const _matCache = new Map<string, THREE.MeshStandardMaterial>();

/** Procedural fallback when original-game GLB is missing. */
function proceduralMeshFor(def: ResourceDef): THREE.Mesh {
  if (!_geoCache.has(def.id)) {
    // Ore veins = rock, plants = cone, water = flat disc
    let g: THREE.BufferGeometry;
    if (def.id.includes('pond')) {
      g = new THREE.CylinderGeometry(def.radius, def.radius, 0.12, 12);
    } else if (def.id.includes('herb') || def.id.includes('hemp')) {
      g = new THREE.ConeGeometry(def.radius * 0.8, def.radius * 1.2, 5);
    } else {
      g = new THREE.DodecahedronGeometry(def.radius * 0.7);
    }
    _geoCache.set(def.id, g);
  }
  if (!_matCache.has(def.id)) {
    _matCache.set(def.id, new THREE.MeshStandardMaterial({
      color:     def.color,
      roughness: 0.85,
      metalness: def.id.includes('ore') || def.id.includes('scrap') ? 0.35 : 0.08,
      fog: true,
    }));
  }
  return new THREE.Mesh(_geoCache.get(def.id)!, _matCache.get(def.id)!);
}

// ─── ResourceSystem ───────────────────────────────────────────────────────────

export class ResourceSystem {
  private scene:  THREE.Scene;
  private nodes:  ResourceNode[] = [];
  private byId    = new Map<string, ResourceNode>();
  /** Canonical mesh + terrain snap + Rapier colliders (three-layer graph). */
  private placer: HarvestablePlacer | null = null;

  /** Callback invoked when a node is successfully harvested */
  onHarvest?: (node: ResourceNode, loot: ResourceLoot[]) => void;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    // Ensure World / Harvest / Actor / Vfx roots exist before first place.
    ensureSceneGraph(scene);
    this.placer = new HarvestablePlacer(scene, null);
  }

  /**
   * Attach Rapier after async physics boot. Rebuilds placer so new harvest
   * meshes get solid PROP colliders + harvest sensors.
   */
  setPhysics(physics: PhysicsWorld | null): void {
    // Drop old visual-only placer; nodes re-stream meshes with colliders.
    this.placer?.dispose();
    this.placer = new HarvestablePlacer(this.scene, physics);
    for (const n of this.nodes) {
      n.mesh = undefined;
      n.meshLoading = false;
    }
  }

  // ── World seeding ──────────────────────────────────────────────────────────

  /**
   * Seed resource nodes for a chunk of terrain (called by WorldChunkManager
   * after a chunk is loaded).
   *
   * @param chunkX  Chunk column index (chunkOriginX = chunkX * chunkSize)
   * @param chunkZ  Chunk row index
   * @param chunkSize  Metres per chunk (default 256)
   */
  seedChunk(chunkX: number, chunkZ: number, chunkSize = 256): void {
    const originX = chunkX * chunkSize;
    const originZ = chunkZ * chunkSize;

    for (const def of RESOURCE_DEFS) {
      // How many nodes should appear in this chunk?
      const chunkArea   = chunkSize * chunkSize;          // m²
      const baseCount   = (def.density / 1_000_000) * chunkArea; // density per m²
      const wxMid       = originX + chunkSize * 0.5;
      const wzMid       = originZ + chunkSize * 0.5;
      const sectorWt    = activeHarvestWeightAt(wxMid, wzMid, def.id);
      const count       = Math.floor((baseCount * sectorWt) + seededRand(chunkX, chunkZ, def.id.length) * 0.5);

      for (let i = 0; i < count; i++) {
        const rx    = seededRand(chunkX * 31 + i, chunkZ, i);
        const rz    = seededRand(chunkX, chunkZ * 31 + i, i + 7);
        const wx    = originX + rx * chunkSize;
        const wz    = originZ + rz * chunkSize;
        const biome = getBiome(worldHeight(wx, wz));

        // Only place if biome matches
        if (!def.biomes.some(k => BIOME_KEY_MAP[k.toLowerCase()] === biome)) continue;

        // Avoid duplicate placement (deterministic ID)
        const nodeId = `res_${def.id}_${chunkX}_${chunkZ}_${i}`;
        if (this.byId.has(nodeId)) continue;

        const wy = groundY(wx, wz);

        const node: ResourceNode = {
          trackId:   nodeId,
          trackType: EntityType.PROP,
          position:  { x: wx, z: wz },
          active:    true,
          defId:     def.id,
          hp:        def.maxHp,
          maxHp:     def.maxHp,
          respawnAt: 0,
          worldY:    wy,
        };

        this.nodes.push(node);
        this.byId.set(nodeId, node);
        getSpatialTracker().add(node);
      }
    }
  }

  // ── Per-frame update ───────────────────────────────────────────────────────

  /**
   * Call each frame from GameEngine.update().
   * Manages mesh visibility within 100m, respawn timers.
   */
  update(playerX: number, playerZ: number, nowMs: number): void {
    const RENDER_R = 95;
    const RENDER_R2 = RENDER_R * RENDER_R;

    for (const node of this.nodes) {
      if (!node.active) continue;

      // Respawn check
      if (node.respawnAt > 0 && nowMs >= node.respawnAt) {
        const def = DEF_BY_ID.get(node.defId)!;
        node.hp        = def.maxHp;
        node.respawnAt = 0;
      }

      const dx  = node.position.x - playerX;
      const dz  = node.position.z - playerZ;
      const d2  = dx * dx + dz * dz;
      const near = d2 <= RENDER_R2;

      if (near && node.respawnAt === 0) {
        // Spawn via HarvestablePlacer: plant → groundY → HarvestRoot → colliders
        if (!node.mesh && !node.meshLoading && this.placer) {
          const def = DEF_BY_ID.get(node.defId)!;
          node.meshLoading = true;
          // Re-sample ground when streaming in (chunk terrain may be ready now)
          node.worldY = groundY(node.position.x, node.position.z);

          const isPlant =
            def.id.includes('herb') ||
            def.id.includes('hemp') ||
            def.id.includes('pond');
          const fallback = proceduralMeshFor(def);
          fallback.userData.disposeOnRemove = false;

          this.placer
            .place({
              id: node.trackId,
              wx: node.position.x,
              wz: node.position.z,
              worldY: node.worldY,
              ry: seededRand(node.position.x, node.position.z, 3) * Math.PI * 2,
              meshKey: def.meshKey,
              tint: def.meshTint,
              fallback,
              radius: def.radius,
              height: def.radius * (isPlant ? 1.1 : 1.5),
              // Soft plants: no solid block; hard rocks/logs: cylinder solid
              collider: isPlant ? 'none' : 'cylinder',
              harvestSensor: true,
              castShadow: true,
            })
            .then((placement) => {
              if (!placement || !node.active) return;
              node.mesh = placement.root;
              node.worldY = placement.wy;
            })
            .catch((err) => {
              console.warn('[ResourceSystem] place failed', node.trackId, err);
            })
            .finally(() => {
              node.meshLoading = false;
            });
        }
        if (node.mesh) node.mesh.visible = true;
        this.placer?.setVisible(node.trackId, true);
      } else if (node.mesh) {
        node.mesh.visible = false;
        this.placer?.setVisible(node.trackId, false);
      }
    }
  }

  // ── Harvesting ─────────────────────────────────────────────────────────────

  /**
   * Attempt to harvest a node.  Returns the loot rolled or null if already
   * depleted.
   */
  harvest(nodeId: string, damage: number, nowMs: number): ResourceLoot[] | null {
    const node = this.byId.get(nodeId);
    if (!node || node.respawnAt > 0) return null;

    node.hp -= damage;
    if (node.hp <= 0) {
      const def  = DEF_BY_ID.get(node.defId)!;
      node.hp         = 0;
      node.respawnAt  = nowMs + def.respawnSec * 1000;
      if (node.mesh) node.mesh.visible = false;
      this.placer?.setVisible(node.trackId, false);

      const loot = this._rollLoot(def, node);
      this.onHarvest?.(node, loot);
      return loot;
    }
    return [];
  }

  /** Return all nodes within radius of (x, z) — for minimap rendering */
  queryNear(x: number, z: number, radius: number): ResourceNode[] {
    const r2  = radius * radius;
    return this.nodes.filter(n => {
      const dx = n.position.x - x;
      const dz = n.position.z - z;
      return dx * dx + dz * dz <= r2 && n.active;
    });
  }

  get nodeCount(): number { return this.nodes.length; }

  // ── Internals ─────────────────────────────────────────────────────────────

  private _rollLoot(def: ResourceDef, _node: ResourceNode): ResourceLoot[] {
    // SWG-style profession bonuses — pulled lazily so this module stays
    // free of cyclic imports during initial bundle eval.
    const yieldBonus =
      _ProfessionsService?.getEffect('harvestYieldBonus') ?? 0;
    const fishingBonus =
      def.id === 'frozen_pond'
        ? (_ProfessionsService?.getEffect('fishingYieldBonus') ?? 0)
        : 0;
    const rareBonus =
      _ProfessionsService?.getEffect('harvestRareBonus') ?? 0;

    return def.loot
      .filter(l => Math.random() < Math.min(1, l.chance + (l.chance < 1 ? rareBonus : 0)))
      .map(l => {
        const baseRoll = l.min + Math.floor(Math.random() * (l.max - l.min + 1));
        const scaled = Math.max(l.min, Math.round(baseRoll * (1 + yieldBonus + fishingBonus)));
        return { ...l, min: scaled, max: l.max };
      });
  }
}

// Lazy reference to ProfessionsService so this module's bundle order is
// independent of progression imports. Resolved on first harvest call.
let _ProfessionsService: typeof import('../progression/ProfessionsService').ProfessionsService | null = null;
import('../progression/ProfessionsService')
  .then(m => { _ProfessionsService = m.ProfessionsService; })
  .catch(() => { /* progression not available — harvest still works */ });

// ── Singleton ─────────────────────────────────────────────────────────────────

let _instance: ResourceSystem | null = null;
export function getResourceSystem(scene?: THREE.Scene): ResourceSystem {
  if (!_instance) {
    if (!scene) throw new Error('ResourceSystem needs scene on first call');
    _instance = new ResourceSystem(scene);
  }
  return _instance;
}
export function resetResourceSystem(): void { _instance = null; }
