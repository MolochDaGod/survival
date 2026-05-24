/**
 * SurvivorSpawner — RTS camp system that spawns wild survivors, manages
 * join requests, ticks camp production, and triggers raid defense events.
 *
 * Lifecycle (driven by GameEngine.update):
 *   1. Every 60-90 s, spawn a "lost survivor" 80-120 m from the player.
 *   2. Wild survivors wander toward the camp flag / player.
 *   3. Within 6 m of the player, show a join prompt (Press F).
 *   4. On accept, the survivor joins the township population via CitySpawner.
 *   5. Every 60 s of gameplay, run a production tick for all assigned-role NPCs.
 *   6. At tribe+ tier, schedule periodic raid events.
 *
 * Serialization: production timer + pending survivors are captured in
 * _collectSaveData() via serialize() / hydrate().
 */

import * as THREE from 'three';
import type { CitySpawner } from '../ai/CitySpawner';
import type { EnemyManager } from '../EnemyManager';
import { computeTownshipState, type TownshipState, type SettlementTier } from './TownshipSystem';
import { computeProduction, type CampFollower } from './CampProductionTick';

// ── Configuration ───────────────────────────────────────────────────────────

/** Seconds between wild survivor spawn attempts. */
const SPAWN_INTERVAL_MIN = 60;
const SPAWN_INTERVAL_MAX = 90;
/** Distance from player at which survivors spawn. */
const SPAWN_RANGE_MIN = 80;
const SPAWN_RANGE_MAX = 120;
/** Distance at which the join prompt appears. */
const JOIN_PROMPT_RANGE = 6;
/** Distance at which the prompt disappears (hysteresis). */
const JOIN_HIDE_RANGE = 8;
/** Maximum wild survivors alive in the world at once. */
const MAX_WILD_SURVIVORS = 3;
/** Seconds between camp production ticks. */
const PRODUCTION_INTERVAL = 60;
/** Seconds between raid checks. */
const RAID_INTERVAL_MIN = 300;  // 5 min
const RAID_INTERVAL_MAX = 480;  // 8 min
/** Minimum township tier for raids to trigger. */
const RAID_MIN_TIER: SettlementTier = 'tribe';
const RAID_TIER_ORDER: SettlementTier[] = ['camp', 'tribe', 'village', 'town', 'stronghold'];

// ── Wild survivor record ────────────────────────────────────────────────────

interface WildSurvivor {
  id: string;
  position: THREE.Vector3;
  /** Direction the survivor wanders (toward the player's last known position). */
  heading: THREE.Vector3;
  speed: number;
  spawnedAt: number;
}

// ── Serializable state ──────────────────────────────────────────────────────

export interface SurvivorSpawnerSnapshot {
  productionTimer: number;
  raidTimer: number;
  totalProduced: Record<string, number>;
}

// ── Main class ──────────────────────────────────────────────────────────────

export class SurvivorSpawner {
  private citySpawner: CitySpawner;
  private enemyManager: EnemyManager | null;

  /** Currently alive wild survivors wandering toward the camp. */
  private wildSurvivors: WildSurvivor[] = [];
  /** Timer until next spawn attempt. */
  private spawnTimer: number;
  /** Timer for camp production ticks. */
  private productionTimer: number = 0;
  /** Timer for raid event checks. */
  private raidTimer: number;
  /** Cumulative resources produced (for save/UI). */
  private totalProduced: Record<string, number> = {};

  /** The wild survivor currently in prompt range (if any). */
  private nearestWild: WildSurvivor | null = null;

  /** UI consumes this for the join prompt. */
  onJoinPrompt: ((text: string | null) => void) | null = null;
  /** Called when camp production tick produces resources. */
  onProduction: ((resources: Record<string, number>) => void) | null = null;
  /** Called when a raid event starts. */
  onRaidStart: ((waveSize: number, tier: SettlementTier) => void) | null = null;

  private nextId = 0;

  constructor(citySpawner: CitySpawner, enemyManager: EnemyManager | null) {
    this.citySpawner = citySpawner;
    this.enemyManager = enemyManager;
    this.spawnTimer = randRange(SPAWN_INTERVAL_MIN, SPAWN_INTERVAL_MAX);
    this.raidTimer = randRange(RAID_INTERVAL_MIN, RAID_INTERVAL_MAX);
  }

  // ── Frame update ──────────────────────────────────────────────────────────

  update(dt: number, playerPos: THREE.Vector3): void {
    // ── 1. Spawn timer ────────────────────────────────────────────────────
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0 && this.wildSurvivors.length < MAX_WILD_SURVIVORS) {
      this.spawnWildSurvivor(playerPos);
      this.spawnTimer = randRange(SPAWN_INTERVAL_MIN, SPAWN_INTERVAL_MAX);
    }

    // ── 2. Move wild survivors toward player ──────────────────────────────
    let newNearest: WildSurvivor | null = null;
    let bestDist2 = JOIN_PROMPT_RANGE * JOIN_PROMPT_RANGE;

    for (let i = this.wildSurvivors.length - 1; i >= 0; i--) {
      const ws = this.wildSurvivors[i];
      // Update heading toward current player position
      ws.heading.set(
        playerPos.x - ws.position.x,
        0,
        playerPos.z - ws.position.z,
      ).normalize();
      ws.position.addScaledVector(ws.heading, ws.speed * dt);

      // Proximity check
      const dx = playerPos.x - ws.position.x;
      const dz = playerPos.z - ws.position.z;
      const d2 = dx * dx + dz * dz;

      if (d2 < bestDist2) {
        bestDist2 = d2;
        newNearest = ws;
      }

      // Despawn if alive too long without being recruited (5 min)
      if (performance.now() - ws.spawnedAt > 300_000) {
        this.wildSurvivors.splice(i, 1);
      }
    }

    // ── 3. Join prompt ────────────────────────────────────────────────────
    if (newNearest && newNearest !== this.nearestWild) {
      this.nearestWild = newNearest;
      this.onJoinPrompt?.('Press F — A survivor wants to join your camp');
    } else if (!newNearest && this.nearestWild) {
      // Check hysteresis before hiding
      const prev = this.nearestWild;
      const dx = playerPos.x - prev.position.x;
      const dz = playerPos.z - prev.position.z;
      if (Math.sqrt(dx * dx + dz * dz) > JOIN_HIDE_RANGE) {
        this.nearestWild = null;
        this.onJoinPrompt?.(null);
      }
    }

    // ── 4. Production tick ────────────────────────────────────────────────
    this.productionTimer += dt;
    if (this.productionTimer >= PRODUCTION_INTERVAL) {
      this.productionTimer -= PRODUCTION_INTERVAL;
      this.runProductionTick();
    }

    // ── 5. Raid timer ─────────────────────────────────────────────────────
    this.raidTimer -= dt;
    if (this.raidTimer <= 0) {
      this.raidTimer = randRange(RAID_INTERVAL_MIN, RAID_INTERVAL_MAX);
      this.checkRaidEvent();
    }
  }

  // ── Recruitment (called when player presses F) ────────────────────────────

  /**
   * Try to recruit the nearest wild survivor. Returns true if successful.
   * Internally adds the survivor to the CitySpawner follower pool.
   */
  tryRecruit(playerPos: THREE.Vector3): boolean {
    if (!this.nearestWild) return false;

    // Remove from wild pool
    const idx = this.wildSurvivors.indexOf(this.nearestWild);
    if (idx >= 0) this.wildSurvivors.splice(idx, 1);

    // Hand off to CitySpawner's recruit flow
    const recruited = this.citySpawner.recruitNearest(playerPos);
    this.nearestWild = null;
    this.onJoinPrompt?.(null);
    return recruited;
  }

  // ── Wild survivor spawning ────────────────────────────────────────────────

  private spawnWildSurvivor(playerPos: THREE.Vector3): void {
    const angle = Math.random() * Math.PI * 2;
    const dist = randRange(SPAWN_RANGE_MIN, SPAWN_RANGE_MAX);
    const pos = new THREE.Vector3(
      playerPos.x + Math.cos(angle) * dist,
      playerPos.y,
      playerPos.z + Math.sin(angle) * dist,
    );

    const heading = new THREE.Vector3(
      playerPos.x - pos.x, 0, playerPos.z - pos.z,
    ).normalize();

    this.wildSurvivors.push({
      id: `wild-survivor-${this.nextId++}`,
      position: pos,
      heading,
      speed: 1.5 + Math.random() * 0.5,
      spawnedAt: performance.now(),
    });
  }

  // ── Camp production ───────────────────────────────────────────────────────

  private runProductionTick(): void {
    const followers = this.citySpawner.getFollowers();
    if (followers.length === 0) return;

    const state = this.citySpawner.getTownshipState();
    const campFollowers: CampFollower[] = followers.map(f => ({ role: f.role }));
    const produced = computeProduction(state, campFollowers);

    // Accumulate
    for (const [res, amt] of Object.entries(produced)) {
      this.totalProduced[res] = (this.totalProduced[res] ?? 0) + amt;
    }

    // Notify UI
    if (Object.keys(produced).length > 0) {
      this.onProduction?.(produced);
    }
  }

  // ── Raid events ───────────────────────────────────────────────────────────

  private checkRaidEvent(): void {
    const state = this.citySpawner.getTownshipState();
    const tierIdx = RAID_TIER_ORDER.indexOf(state.tier);
    const minIdx = RAID_TIER_ORDER.indexOf(RAID_MIN_TIER);

    if (tierIdx < minIdx) return; // Not high enough tier

    // Wave size scales with settlement tier
    const baseWaveSize = 3 + tierIdx * 2;
    const waveSize = baseWaveSize + Math.floor(Math.random() * 3);

    // Spawn raid wave via EnemyManager
    if (this.enemyManager) {
      this.enemyManager.spawnWave(waveSize);
    }
    this.onRaidStart?.(waveSize, state.tier);
  }

  // ── Serialization ─────────────────────────────────────────────────────────

  serialize(): SurvivorSpawnerSnapshot {
    return {
      productionTimer: this.productionTimer,
      raidTimer: this.raidTimer,
      totalProduced: { ...this.totalProduced },
    };
  }

  hydrate(snap: SurvivorSpawnerSnapshot | null | undefined): void {
    if (!snap) return;
    this.productionTimer = snap.productionTimer ?? 0;
    this.raidTimer = snap.raidTimer ?? randRange(RAID_INTERVAL_MIN, RAID_INTERVAL_MAX);
    this.totalProduced = { ...(snap.totalProduced ?? {}) };
  }

  getTotalProduced(): Readonly<Record<string, number>> {
    return this.totalProduced;
  }

  getTownshipState(): TownshipState {
    return this.citySpawner.getTownshipState();
  }

  getWildSurvivorCount(): number {
    return this.wildSurvivors.length;
  }

  dispose(): void {
    this.wildSurvivors = [];
    this.nearestWild = null;
    this.onJoinPrompt = null;
    this.onProduction = null;
    this.onRaidStart = null;
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function randRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}
