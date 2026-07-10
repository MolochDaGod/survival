/**
 * EnemyCampSystem — enemy camp nodes across the 20 km world.
 *
 * Three camp kinds:
 *   • patrol   — procedural, 200–500 m from player (missions/events)
 *   • sector   — fixed at sector POIs + wildlands settlements
 *   • ai_island — faction AI starter camp per 9-sector grid cell; grows over time
 *
 * Persistent camps (sector + ai_island) accrue population and tier up when
 * left alone, spawning more defenders and scaling the GLB prefab.
 */

import * as THREE from 'three';
import type { Group } from 'three';
import { getBiome, isWater, worldHeight, getSettlements } from './WorldGen';
import { groundY } from '../GroundSampler';
import { getSpatialTracker, EntityType, type TrackedEntity } from '../SpatialTracker';
import type { PrefabSystem } from './PrefabSystem';
import type { EnemyManager } from '../EnemyManager';
import { getQuestSystem } from '../quest/QuestSystem';
import { createEnemyCampQuest, rollCampDefenderCount, type CampMissionKind } from '../quest/EnemyCampMissions';
import { getAllPOIs, getSector, getSectorForPosition, SECTORS } from '../../data/sectors';
import { getAISeedSectors, GRID_SECTOR_SPAN_M } from '../../data/worldGridSectors';
import type { FactionId } from '../../data/factions';
import {
  AI_CAMP_BASE_GROWTH_RATE,
  tierForPopulation,
  type AICampTier,
} from './EnemyCampGrowth';
import {
  campLayoutPhase,
  slotsForCamp,
  slotWorldPosition,
} from './EnemyCampBuildings';
import { getPrefab } from '../../data/prefabs';

// ─── Tuning ───────────────────────────────────────────────────────────────────

const PATROL_MIN_DIST_M   = 200;
const PATROL_MAX_DIST_M   = 500;
const MAX_PATROL_ACTIVE   = 2;
const PATROL_SPAWN_CD_S   = 50;
const PATROL_DESPAWN_M    = 750;
const STREAM_DIST_M       = 550;
const MIN_CAMP_GAP_M      = 120;
const MAX_SLOPE_M         = 8;
const GROWTH_REINFORCE_M  = 280;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EnemyCamp extends TrackedEntity {
  campId: string;
  kind: CampMissionKind;
  worldY: number;
  tier: AICampTier;
  population: number;
  killCount: number;
  cleared: boolean;
  enemiesSpawned: boolean;
  missionActive: boolean;
  placed: boolean;
  persistent: boolean;
  factionId: FactionId | null;
  sectorId: string | null;
  sectorName: string | null;
  gridSectorId: string | null;
  prefabGroup: Group | null;
  growthPaused: boolean;
  /** Nearby idle reinforcement cadence. */
  reinforceTimer: number;
  /** Deterministic ring layout angle. */
  buildPhase: number;
  /** Satellite structure slot ids already placed. */
  builtSlots: Set<string>;
  /** Placed bench / defense groups for cleanup. */
  buildingGroups: Group[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function seededRand(a: number, b: number, c: number): number {
  const x = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453;
  return x - Math.floor(x);
}

function isValidCampSite(wx: number, wz: number): boolean {
  const h = worldHeight(wx, wz);
  if (isWater(getBiome(h))) return false;
  if (h < 1.2) return false;

  const hN = worldHeight(wx, wz + 6);
  const hS = worldHeight(wx, wz - 6);
  const hE = worldHeight(wx + 6, wz);
  const hW = worldHeight(wx - 6, wz);
  const slope = Math.max(Math.abs(hN - h), Math.abs(hS - h), Math.abs(hE - h), Math.abs(hW - h));
  return slope <= MAX_SLOPE_M;
}

function nudgeToLand(wx: number, wz: number, attempts = 8): { x: number; z: number } | null {
  if (isValidCampSite(wx, wz)) return { x: wx, z: wz };
  for (let i = 1; i <= attempts; i++) {
    const ring = i * 40;
    for (let a = 0; a < 8; a++) {
      const ang = (a / 8) * Math.PI * 2;
      const x   = wx + Math.cos(ang) * ring;
      const z   = wz + Math.sin(ang) * ring;
      if (isValidCampSite(x, z)) return { x, z };
    }
  }
  return null;
}

function samplePatrolPosition(
  px: number,
  pz: number,
  seed: number,
  existing: EnemyCamp[],
): { x: number; z: number } | null {
  for (let attempt = 0; attempt < 14; attempt++) {
    const angle = seededRand(seed, attempt, 1) * Math.PI * 2;
    const t     = seededRand(seed, attempt, 2);
    const dist  = PATROL_MIN_DIST_M + t * (PATROL_MAX_DIST_M - PATROL_MIN_DIST_M);
    const x     = px + Math.cos(angle) * dist;
    const z     = pz + Math.sin(angle) * dist;

    if (!isValidCampSite(x, z)) continue;

    let tooClose = false;
    for (const camp of existing) {
      const dx = x - camp.position.x;
      const dz = z - camp.position.z;
      if (dx * dx + dz * dz < MIN_CAMP_GAP_M * MIN_CAMP_GAP_M) {
        tooClose = true;
        break;
      }
    }
    if (tooClose) continue;

    return { x, z };
  }
  return null;
}

function campScale(camp: EnemyCamp): number {
  return tierForPopulation(camp.population).scale;
}

function campDefenders(camp: EnemyCamp): number {
  if (camp.kind === 'patrol') return camp.killCount;
  return tierForPopulation(camp.population).defenders;
}

/** Canonical hostile roster for a camp based on its sector / world position. */
function hostilesForCamp(camp: EnemyCamp): string[] {
  if (camp.sectorId) {
    const byId = getSector(camp.sectorId);
    if (byId?.hostileTypes.length) return byId.hostileTypes;
  }
  const byPos = getSectorForPosition(camp.position.x, camp.position.z);
  if (byPos?.hostileTypes.length) return byPos.hostileTypes;
  return ['rat', 'spider', 'snake'];
}

// ─── System ───────────────────────────────────────────────────────────────────

let _nextCampId = 1;

export class EnemyCampSystem {
  private camps: EnemyCamp[] = [];
  private patrolCooldown = 8;
  private seedCounter    = 0;
  private worldSeeded    = false;

  constructor(
    private scene: THREE.Scene,
    private prefabs: PrefabSystem,
    private enemyManager: EnemyManager,
  ) {
    this.seedWorldCamps();
  }

  /** Call each frame from GameEngine.update(). */
  update(dt: number, playerX: number, playerZ: number): void {
    this.patrolCooldown -= dt;
    this.cullPatrolCamps(playerX, playerZ);
    this.streamPrefabs(playerX, playerZ);
    this.tickGrowth(dt, playerX, playerZ);

    const livePatrol = this.camps.filter(c => c.kind === 'patrol' && !c.cleared);
    if (livePatrol.length < MAX_PATROL_ACTIVE && this.patrolCooldown <= 0) {
      this.trySpawnPatrolCamp(playerX, playerZ);
      this.patrolCooldown = PATROL_SPAWN_CD_S;
    }
  }

  getCampNear(px: number, pz: number, radius = 5): EnemyCamp | null {
    const r2 = radius * radius;
    let best: EnemyCamp | null = null;
    let bestD2 = r2;
    for (const camp of this.camps) {
      if (camp.cleared || !camp.active) continue;
      const dx = px - camp.position.x;
      const dz = pz - camp.position.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestD2) {
        bestD2 = d2;
        best = camp;
      }
    }
    return best;
  }

  acceptCampMission(camp: EnemyCamp): void {
    if (camp.cleared || camp.missionActive) return;

    camp.killCount = campDefenders(camp);
    const questSys = getQuestSystem();
    const questId  = `enemy_camp_${camp.campId}`;

    if (!questSys.getState(questId)) {
      questSys.register(this.buildQuestDef(camp));
    }

    questSys.activate(questId);
    camp.missionActive = true;
    camp.growthPaused   = true;

    if (!camp.enemiesSpawned) {
      camp.enemiesSpawned = true;
      this.enemyManager.spawnEnemiesAtCamp(
        camp.position.x,
        camp.position.z,
        camp.killCount,
        hostilesForCamp(camp),
      );
    }
  }

  getCamps(): readonly EnemyCamp[] {
    return this.camps;
  }

  dispose(): void {
    const tracker = getSpatialTracker();
    for (const camp of this.camps) {
      tracker.remove(camp);
    }
    this.camps = [];
  }

  // ── World seeding (9 sectors + POIs) ───────────────────────────────────────

  private seedWorldCamps(): void {
    if (this.worldSeeded) return;
    this.worldSeeded = true;

    // One growing AI island camp per non-safe grid sector (8 cells).
    for (const grid of getAISeedSectors()) {
      const phase = ((grid.col + 1) * 17 + grid.row * 31) % 8;
      const ang   = (phase / 8) * Math.PI * 2 + 0.4;
      const dist  = GRID_SECTOR_SPAN_M * 0.22;
      const rawX  = grid.center.x + Math.cos(ang) * dist;
      const rawZ  = grid.center.z + Math.sin(ang) * dist;
      const pos   = nudgeToLand(rawX, rawZ);
      if (!pos) continue;

      this.addCamp({
        kind: 'ai_island',
        x: pos.x,
        z: pos.z,
        persistent: true,
        factionId: grid.owner,
        sectorId: grid.territoryId ?? null,
        sectorName: grid.name,
        gridSectorId: grid.id,
        tier: 'outpost',
        population: 1,
        killCount: tierForPopulation(1).defenders,
      });
    }

    // Sector POI camps from sectors.ts.
    for (const poi of getAllPOIs()) {
      if (poi.type !== 'camp') continue;
      const pos = nudgeToLand(poi.worldX, poi.worldZ);
      if (!pos) continue;
      const sector = SECTORS.find(s => s.id === poi.sectorId);
      this.addCamp({
        kind: 'sector',
        x: pos.x,
        z: pos.z,
        persistent: true,
        factionId: poi.factionId,
        sectorId: poi.sectorId,
        sectorName: poi.name,
        gridSectorId: null,
        tier: 'camp',
        population: 6,
        killCount: tierForPopulation(6).defenders,
        labelSuffix: poi.name,
      });
    }

    // Wildlands settlement camps.
    for (const s of getSettlements()) {
      if (s.type !== 'camp') continue;
      const pos = nudgeToLand(s.x, s.z);
      if (!pos) continue;
      this.addCamp({
        kind: 'sector',
        x: pos.x,
        z: pos.z,
        persistent: true,
        factionId: s.factionId,
        sectorId: s.sectorId,
        sectorName: s.name,
        gridSectorId: null,
        tier: 'outpost',
        population: 2,
        killCount: tierForPopulation(2).defenders,
        labelSuffix: s.name,
      });
    }

    console.info(`[EnemyCamp] Seeded ${this.camps.filter(c => c.persistent).length} persistent camps (9-sector AI islands + POIs)`);
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private addCamp(opts: {
    kind: CampMissionKind;
    x: number;
    z: number;
    persistent: boolean;
    factionId: FactionId | null;
    sectorId: string | null;
    sectorName: string | null;
    gridSectorId: string | null;
    tier: AICampTier;
    population: number;
    killCount: number;
    labelSuffix?: string;
  }): EnemyCamp {
    const campId = `camp_${_nextCampId++}`;
    const wy     = groundY(opts.x, opts.z);

    const camp: EnemyCamp = {
      trackId:   campId,
      trackType: EntityType.CAMP,
      position:  { x: opts.x, z: opts.z },
      active:    true,
      campId,
      kind:      opts.kind,
      worldY:    wy,
      tier:      opts.tier,
      population: opts.population,
      killCount: opts.killCount,
      cleared:   false,
      enemiesSpawned: false,
      missionActive:  false,
      placed:    false,
      persistent: opts.persistent,
      factionId: opts.factionId,
      sectorId:  opts.sectorId,
      sectorName: opts.sectorName,
      gridSectorId: opts.gridSectorId,
      prefabGroup: null,
      growthPaused: false,
      reinforceTimer: 0,
      buildPhase: campLayoutPhase(opts.x, opts.z),
      builtSlots: new Set(),
      buildingGroups: [],
    };

    this.camps.push(camp);
    getSpatialTracker().add(camp);

    return camp;
  }

  private trySpawnPatrolCamp(px: number, pz: number): void {
    const seed = ++this.seedCounter + Math.floor(px * 0.01) + Math.floor(pz * 0.01);
    const pos  = samplePatrolPosition(px, pz, seed, this.camps);
    if (!pos) return;

    const killCount = rollCampDefenderCount();
    this.addCamp({
      kind: 'patrol',
      x: pos.x,
      z: pos.z,
      persistent: false,
      factionId: null,
      sectorId: null,
      sectorName: null,
      gridSectorId: null,
      tier: 'camp',
      population: 0,
      killCount,
    });

    console.info(
      `[EnemyCamp] Patrol camp at (${pos.x.toFixed(0)}, ${pos.z.toFixed(0)}) — ${killCount} defenders`,
    );
  }

  private tickGrowth(dt: number, playerX: number, playerZ: number): void {
    for (const camp of this.camps) {
      if (camp.cleared || camp.growthPaused || camp.kind === 'patrol') continue;
      if (!camp.persistent) continue;

      const prevTier = camp.tier;
      camp.population += AI_CAMP_BASE_GROWTH_RATE * dt * (camp.kind === 'ai_island' ? 1.25 : 0.85);
      const tierDef   = tierForPopulation(Math.floor(camp.population));
      camp.tier       = tierDef.id;
      camp.killCount  = tierDef.defenders;

      if (camp.tier !== prevTier) {
        if (camp.prefabGroup) {
          camp.prefabGroup.scale.setScalar(tierDef.scale);
        }
        void this.syncCampBuildings(camp);
        console.info(
          `[EnemyCamp] ${camp.campId} grew to ${tierDef.label} (pop ${Math.floor(camp.population)}) — building new structures`,
        );
      }

      // Living camps slowly reinforce when the player is nearby but not raiding.
      if (!camp.missionActive && !camp.enemiesSpawned) {
        const dx = playerX - camp.position.x;
        const dz = playerZ - camp.position.z;
        if (dx * dx + dz * dz < GROWTH_REINFORCE_M * GROWTH_REINFORCE_M) {
          camp.reinforceTimer += dt;
          if (camp.reinforceTimer > 180) {
            camp.reinforceTimer = 0;
            const n = Math.min(2, Math.max(1, Math.floor(camp.population / 8)));
            this.enemyManager.spawnEnemiesAtCamp(
              camp.position.x,
              camp.position.z,
              n,
              hostilesForCamp(camp),
            );
          }
        }
      }
    }
  }

  private async placeCamp(camp: EnemyCamp): Promise<void> {
    if (camp.placed || camp.cleared) return;
    const inst = await this.prefabs.place('enemy_camp', camp.position.x, camp.position.z, {
      scale: campScale(camp),
    });
    if (inst) {
      camp.placed      = true;
      camp.prefabGroup = inst.group;
      await this.syncCampBuildings(camp);
    }
  }

  /** Place crafting benches, furnaces, defenses unlocked at the current tier. */
  private async syncCampBuildings(camp: EnemyCamp): Promise<void> {
    if (camp.cleared) return;

    const slots = slotsForCamp({
      kind: camp.kind,
      tier: camp.tier,
      factionId: camp.factionId,
      x: camp.position.x,
      z: camp.position.z,
    });

    const tierScale = campScale(camp);

    for (const slot of slots) {
      if (camp.builtSlots.has(slot.slotId)) continue;

      const { x, z, ry } = slotWorldPosition(
        camp.position.x,
        camp.position.z,
        slot,
        camp.buildPhase,
      );
      const def   = getPrefab(slot.prefabId);
      const scale = (def?.scale ?? 1) * (slot.scaleMul ?? 1) * Math.max(0.65, tierScale);

      const inst = await this.prefabs.place(slot.prefabId, x, z, {
        ry,
        scale,
        collide: slot.collide ?? (slot.role === 'defense_wall' || slot.role === 'defense_post'),
      });

      if (inst) {
        camp.buildingGroups.push(inst.group);
        camp.builtSlots.add(slot.slotId);
      }
    }
  }

  private clearCampBuildings(camp: EnemyCamp): void {
    for (const g of camp.buildingGroups) {
      this.scene.remove(g);
      g.traverse(obj => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry?.dispose();
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          mats.forEach(m => m.dispose());
        }
      });
    }
    camp.buildingGroups = [];
    camp.builtSlots.clear();
  }

  private streamPrefabs(px: number, pz: number): void {
    const streamR2 = STREAM_DIST_M * STREAM_DIST_M;
    for (const camp of this.camps) {
      if (camp.cleared) continue;
      const dx = px - camp.position.x;
      const dz = pz - camp.position.z;
      const near = dx * dx + dz * dz <= streamR2;
      if (near && !camp.placed) {
        void this.placeCamp(camp);
      }
    }
  }

  private cullPatrolCamps(px: number, pz: number): void {
    const despawnR2 = PATROL_DESPAWN_M * PATROL_DESPAWN_M;
    const tracker   = getSpatialTracker();
    const keep: EnemyCamp[] = [];

    for (const camp of this.camps) {
      if (camp.persistent) {
        keep.push(camp);
        continue;
      }
      const dx = px - camp.position.x;
      const dz = pz - camp.position.z;
      const far = dx * dx + dz * dz > despawnR2;
      if (far && (camp.cleared || !camp.missionActive)) {
        tracker.remove(camp);
        continue;
      }
      keep.push(camp);
    }
    this.camps = keep;
  }

  private markCampCleared(campId: string): void {
    const camp = this.camps.find(c => c.campId === campId);
    if (!camp) return;
    camp.cleared = true;
    camp.active  = false;
    camp.growthPaused = true;
    this.clearCampBuildings(camp);
    getSpatialTracker().remove(camp);

    // AI island camps reset to outpost after clearing (faction reclaims later).
    if (camp.kind === 'ai_island' && camp.persistent) {
      setTimeout(() => {
        camp.cleared = false;
        camp.active  = true;
        camp.missionActive = false;
        camp.enemiesSpawned = false;
        camp.population = 1;
        camp.tier = 'outpost';
        camp.killCount = tierForPopulation(1).defenders;
        camp.growthPaused = false;
        getSpatialTracker().add(camp);
        if (camp.prefabGroup) {
          camp.prefabGroup.scale.setScalar(tierForPopulation(1).scale);
        }
        void this.syncCampBuildings(camp);
        console.info(`[EnemyCamp] ${campId} re-seeded as faction outpost`);
      }, 120_000);
    }

    console.info(`[EnemyCamp] Cleared ${campId}`);
  }

  private buildQuestDef(camp: EnemyCamp) {
    return createEnemyCampQuest({
      campId: camp.campId,
      x: camp.position.x,
      z: camp.position.z,
      killCount: camp.killCount,
      enemyManager: this.enemyManager,
      kind: camp.kind,
      tier: camp.tier,
      factionId: camp.factionId,
      sectorName: camp.sectorName ?? undefined,
      onCleared: () => this.markCampCleared(camp.campId),
    });
  }

}