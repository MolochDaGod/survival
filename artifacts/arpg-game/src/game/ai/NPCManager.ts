/**
 * NPCManager — world-level NPC lifecycle, flocking groups, render culling.
 *
 * Responsibilities:
 *  1. Own the YUKA EntityManager — ticks ALL NPCs every frame regardless of
 *     distance (goals/missions must keep running off-screen).
 *  2. Spatial render culling — only Three.js meshes within RENDER_RADIUS are
 *     visible; mesh.visible toggled based on SpatialTracker query.
 *  3. Flocking groups — NPCs sharing a camp/floor are linked into a YUKA
 *     neighbor list so separation, alignment, cohesion work.
 *  4. Sentiment dispersal — when a player's sentiment with one NPC in a
 *     group drops, nearby NPCs are "aware" (sentinel flocking mode).
 *  5. Day/night routing — on day-change events, push appropriate goals to
 *     every NPC based on faction + building assignment.
 *
 * Design: fully scriptable via event hooks and rule tables.
 * Add new NPC types / behaviors without modifying this file.
 */

import * as YUKA from 'yuka';
import * as THREE from 'three';
import {
  NPCBrain,
  NPCBrainOptions,
  NPCFaction,
  GoalType,
} from './NPCBrain';
import { getSpatialTracker, EntityType } from '../SpatialTracker';

// ── Constants ─────────────────────────────────────────────────────────────────

/** Only render NPCs within this radius of any active camera / player */
export const RENDER_RADIUS = 100;       // metres

/** NPCs in the same group share YUKA neighbor references for flocking */
const MAX_GROUP_SIZE = 12;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface FlockGroup {
  id:      string;
  members: NPCBrain[];
  /** Shared sentiment: 0 = calm, 1 = alert, 2 = hostile */
  alertLevel: number;
}

/** Rules: day-phase goal assignments (override per NPC type) */
type DayPhaseRule = {
  phase:    'day' | 'night';
  faction?: NPCFaction;
  isVendor?: boolean;
  goal:     GoalType;
};

const DEFAULT_DAY_PHASE_RULES: DayPhaseRule[] = [
  // Vendors stay at stalls during day
  { phase: 'day',   isVendor: true,  goal: GoalType.VENDOR  },
  // Friendly non-vendors wander their floor during day
  { phase: 'day',   faction: NPCFaction.FRIENDLY, goal: GoalType.WANDER },
  // Everyone sleeps inside buildings at night
  { phase: 'night', goal: GoalType.SLEEP },
];

// ── NPCManager ────────────────────────────────────────────────────────────────

export class NPCManager {
  private entityManager = new YUKA.EntityManager();
  private npcs          = new Map<string, NPCBrain>();
  private groups        = new Map<string, FlockGroup>();

  private dayPhaseRules: DayPhaseRule[] = [...DEFAULT_DAY_PHASE_RULES];

  /** Active player positions used for render culling — updated externally */
  playerPositions: THREE.Vector3[] = [];

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  /** Create and register a new NPC.  Returns the NPCBrain. */
  spawn(opts: NPCBrainOptions): NPCBrain {
    const brain = new NPCBrain(opts);
    this.npcs.set(opts.id, brain);
    this.entityManager.add(brain.vehicle);
    return brain;
  }

  /** Look up a brain by id. Used by QuestSystem for proximity checks. */
  getBrain(id: string): NPCBrain | undefined {
    return this.npcs.get(id);
  }

  /** Remove an NPC from the world */
  despawn(id: string): void {
    const brain = this.npcs.get(id);
    if (!brain) return;
    this.entityManager.remove(brain.vehicle);
    brain.dispose();
    this.npcs.delete(id);
  }

  // ── Flocking groups ───────────────────────────────────────────────────────

  /**
   * Create a flock group.  All members share YUKA neighbor lists so the
   * built-in separation / alignment / cohesion behaviors interact.
   * Called by BuildingSystem when populating a floor.
   */
  createGroup(id: string, members: NPCBrain[]): FlockGroup {
    const group: FlockGroup = { id, members: members.slice(0, MAX_GROUP_SIZE), alertLevel: 0 };
    this.groups.set(id, group);

    // Wire YUKA neighbors
    for (const brain of group.members) {
      const neighbors = group.members
        .filter(m => m !== brain)
        .map(m => m.vehicle);
      brain.vehicle.neighbors = neighbors;
      brain.enableFlocking(1.0);
    }

    return group;
  }

  /**
   * Adjust alert level for a group.
   * 0 = calm (flocking)  1 = alert (seek perimeter)  2 = hostile (attack)
   */
  setGroupAlert(groupId: string, level: 0 | 1 | 2): void {
    const group = this.groups.get(groupId);
    if (!group) return;
    group.alertLevel = level;

    for (const brain of group.members) {
      brain.clearGoals();
      switch (level) {
        case 0:
          brain.enableFlocking(1.0);
          brain.pushGoal(GoalType.WANDER);
          break;
        case 1:
          brain.enableFlocking(0.5);
          brain.vehicle.maxSpeed = brain.walkSpeed * 1.3;
          break;
        case 2:
          // Hostile — each member seeks the threat
          brain.pushGoal(GoalType.ATTACK, { targetEntityId: this._lastThreatId });
          break;
      }
    }
  }

  private _lastThreatId?: string;

  /** Called when a player attacks or angers an NPC */
  onPlayerAngered(playerId: string, npcId: string): void {
    this._lastThreatId = playerId;
    const brain = this.npcs.get(npcId);
    if (!brain) return;

    // Propagate anger to group
    for (const [, group] of this.groups) {
      if (group.members.includes(brain)) {
        // Raise alert proportional to flock size
        const newLevel = Math.min(2, group.alertLevel + 1) as 0 | 1 | 2;
        this.setGroupAlert(group.id, newLevel);
        // Nearby NPCs outside the group also take note
        this._disperseSentiment(brain.vehicle.position, playerId, -0.25, 60);
        break;
      }
    }

    // Individual sentiment
    brain.sentiment.adjust(playerId, -0.5);
  }

  /** Called when a player gives an NPC a gift / completes a quest */
  onPlayerHelped(playerId: string, npcId: string, amount = 0.3): void {
    const brain = this.npcs.get(npcId);
    if (!brain) return;
    brain.sentiment.adjust(playerId, amount);
    // Minor positive ripple to nearby NPCs
    this._disperseSentiment(brain.vehicle.position, playerId, 0.05, 30);
  }

  // ── Day/night routing ─────────────────────────────────────────────────────

  addDayPhaseRule(rule: DayPhaseRule): void {
    this.dayPhaseRules.unshift(rule); // higher priority at front
  }

  onDayPhaseChange(phase: 'day' | 'night'): void {
    for (const brain of this.npcs.values()) {
      const rule = this._matchRule(phase, brain);
      if (!rule) continue;
      brain.clearGoals();
      if (phase === 'night' && brain.buildingId && brain.homePosition) {
        // Go home first, then sleep
        brain.pushGoal(GoalType.SLEEP);
        brain.pushGoal(GoalType.GOTO, { targetPosition: brain.homePosition.clone() });
      } else {
        brain.pushGoal(rule.goal);
      }
    }
  }

  private _matchRule(phase: 'day' | 'night', brain: NPCBrain): DayPhaseRule | null {
    for (const rule of this.dayPhaseRules) {
      if (rule.phase !== phase) continue;
      if (rule.faction  !== undefined && rule.faction  !== brain.faction)  continue;
      if (rule.isVendor !== undefined && rule.isVendor !== brain.isVendor) continue;
      return rule;
    }
    return null;
  }

  // ── Main update ───────────────────────────────────────────────────────────

  /**
   * Call every frame from GameEngine.update(dt).
   *
   * • Ticks YUKA entity manager (ALL vehicles, regardless of culling)
   * • Ticks each NPCBrain goal stack
   * • Updates render visibility based on player proximity
   */
  update(dt: number): void {
    // YUKA physics step
    this.entityManager.update(dt);

    const tracker = getSpatialTracker();

    for (const brain of this.npcs.values()) {
      if (!brain.active) continue;

      // Brain goal tick
      brain.tick(dt, this.entityManager);

      // Render culling — check against all registered player positions
      if (brain.mesh) {
        let visible = false;
        for (const pp of this.playerPositions) {
          const dx = brain.vehicle.position.x - pp.x;
          const dz = brain.vehicle.position.z - pp.z;
          if (dx * dx + dz * dz < RENDER_RADIUS * RENDER_RADIUS) {
            visible = true;
            break;
          }
        }
        brain.mesh.visible = visible;
      }
    }
  }

  // ── Utility ───────────────────────────────────────────────────────────────

  getNPC(id: string): NPCBrain | undefined { return this.npcs.get(id); }

  getAllNPCs(): IterableIterator<NPCBrain> { return this.npcs.values(); }

  getGroup(id: string): FlockGroup | undefined { return this.groups.get(id); }

  get npcCount(): number { return this.npcs.size; }

  /** Spawn a minimal outdoor camp of 2–3 NPCs near a world position */
  spawnCamp(
    baseId: string,
    cx: number,
    cz: number,
    groundY: number,
    count = 2 + Math.floor(Math.random() * 2),
    faction = NPCFaction.NEUTRAL,
  ): FlockGroup {
    const members: NPCBrain[] = [];
    for (let i = 0; i < count; i++) {
      const angle  = (i / count) * Math.PI * 2;
      const radius = 3 + Math.random() * 2;
      const brain  = this.spawn({
        id:           `${baseId}_${i}`,
        faction,
        homePosition: new THREE.Vector3(
          cx + Math.cos(angle) * radius,
          groundY,
          cz + Math.sin(angle) * radius,
        ),
      });
      brain.setPosition(
        cx + Math.cos(angle) * radius,
        groundY,
        cz + Math.sin(angle) * radius,
      );
      members.push(brain);
    }
    return this.createGroup(baseId, members);
  }

  private _disperseSentiment(
    origin: YUKA.Vector3,
    targetId: string,
    delta: number,
    radius: number,
  ): void {
    const tracker = getSpatialTracker();
    const nearby  = tracker.query(origin.x, origin.z, radius, EntityType.NPC);
    for (const te of nearby) {
      const brain = this.npcs.get(te.trackId);
      if (brain) brain.sentiment.adjust(targetId, delta * 0.5);
    }
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

let _instance: NPCManager | null = null;
export function getNPCManager(): NPCManager {
  if (!_instance) _instance = new NPCManager();
  return _instance;
}
export function resetNPCManager(): void { _instance = null; }
