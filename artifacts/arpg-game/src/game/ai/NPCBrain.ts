/**
 * NPCBrain — goal-driven AI entity built on YUKA steering.
 *
 * Architecture (scriptable, expandable):
 *   NPCBrain holds a stack of Goals.  Each tick the top Goal is updated.
 *   Goals can push sub-goals, delegate to a YUKA Vehicle for movement,
 *   or signal completion/failure back up the stack.
 *
 * Steering behaviors wired from YUKA:
 *   • SeekBehavior      — direct pursuit of a target position
 *   • ArriveBehavior    — decelerate on approach (vendor/camp routing)
 *   • FleeBehavior      — escape from threat
 *   • WanderBehavior    — idle patrol
 *   • InterposeBehavior — insert self between two entities (tactical defense)
 *   • SeparationBehavior— personal space in flocks
 *   • AlignmentBehavior — heading alignment in flocks
 *   • CohesionBehavior  — group cohesion in flocks
 *
 * References:
 *   https://mugen87.github.io/yuka/examples/steering/seek/
 *   https://mugen87.github.io/yuka/examples/steering/interpose/
 *   https://mugen87.github.io/yuka/examples/steering/flocking/
 */

import * as YUKA from 'yuka';
import * as THREE from 'three';
import { hasLOS } from '../math/TerrainRaycast';
import { getSpatialTracker, EntityType, TrackedEntity } from '../SpatialTracker';

// ─── Goal types (scriptable — add new goals without touching NPCBrain core) ──

export const enum GoalType {
  IDLE      = 'idle',
  WANDER    = 'wander',
  SEEK      = 'seek',
  FLEE      = 'flee',
  PATROL    = 'patrol',
  VENDOR    = 'vendor',
  SLEEP     = 'sleep',
  CAMP      = 'camp',
  DEFEND    = 'defend',
  ATTACK    = 'attack',
  INTERPOSE = 'interpose',
  GOTO      = 'goto',
}

export const enum NPCFaction {
  FRIENDLY = 'friendly',
  NEUTRAL  = 'neutral',
  HOSTILE  = 'hostile',
}

export interface GoalContext {
  targetPosition?: THREE.Vector3;
  targetEntityId?: string;
  floorIndex?: number;
  buildingId?:  string;
  duration?: number;            // goal timeout in seconds
}

export interface Goal {
  type:    GoalType;
  ctx:     GoalContext;
  /** Returns true when this goal is complete */
  tick(brain: NPCBrain, dt: number): boolean;
}

// ─── Sentiment (tracks relationship with specific player / entity ids) ────────

interface SentimentEntry {
  value:     number;   // –1.0 (hostile) … +1.0 (beloved)
  decayRate: number;   // per second decay toward neutral
}

export class SentimentMap {
  private entries = new Map<string, SentimentEntry>();

  adjust(entityId: string, delta: number): void {
    const e = this.entries.get(entityId) ?? { value: 0, decayRate: 0.005 };
    e.value  = Math.max(-1, Math.min(1, e.value + delta));
    this.entries.set(entityId, e);
  }

  get(entityId: string): number {
    return this.entries.get(entityId)?.value ?? 0;
  }

  factionFor(entityId: string): NPCFaction {
    const v = this.get(entityId);
    if (v >= 0.3)  return NPCFaction.FRIENDLY;
    if (v <= -0.3) return NPCFaction.HOSTILE;
    return NPCFaction.NEUTRAL;
  }

  tick(dt: number): void {
    for (const [id, e] of this.entries) {
      if (Math.abs(e.value) < 0.001) { this.entries.delete(id); continue; }
      e.value -= Math.sign(e.value) * e.decayRate * dt;
    }
  }
}

// ─── Pre-built Goal implementations ──────────────────────────────────────────

class IdleGoal implements Goal {
  type = GoalType.IDLE;
  ctx: GoalContext;
  private elapsed = 0;

  constructor(ctx: GoalContext = {}) { this.ctx = ctx; }

  tick(_brain: NPCBrain, dt: number): boolean {
    this.elapsed += dt;
    return this.elapsed >= (this.ctx.duration ?? 3);
  }
}

class GotoGoal implements Goal {
  type = GoalType.GOTO;
  ctx: GoalContext;
  private stuckTimer = 0;

  constructor(ctx: GoalContext) { this.ctx = ctx; }

  tick(brain: NPCBrain, dt: number): boolean {
    if (!this.ctx.targetPosition) return true;
    const pos    = brain.vehicle.position;
    const target = this.ctx.targetPosition;
    const dx     = target.x - pos.x;
    const dz     = target.z - pos.z;
    const d2     = dx * dx + dz * dz;

    if (d2 < 1.5 * 1.5) return true;   // arrived

    // Update YUKA arrive behavior destination
    brain.setArriveDest(target);

    // Stuck detection
    if (d2 > brain._lastGoalDist2 - 0.01) {
      this.stuckTimer += dt;
    } else {
      this.stuckTimer = 0;
    }
    brain._lastGoalDist2 = d2;

    return this.stuckTimer > 5; // give up after 5s stuck
  }
}

class VendorGoal implements Goal {
  type = GoalType.VENDOR;
  ctx: GoalContext;

  constructor(ctx: GoalContext) { this.ctx = ctx; }

  tick(brain: NPCBrain, dt: number): boolean {
    // Vendors stand near their stall — gentle wander within 3m
    brain.vehicle.maxSpeed = 0.8;
    return false; // never completes during trading hours
  }
}

class SleepGoal implements Goal {
  type = GoalType.SLEEP;
  ctx: GoalContext;
  private elapsed = 0;

  constructor(ctx: GoalContext = {}) { this.ctx = ctx; }

  tick(brain: NPCBrain, dt: number): boolean {
    brain.vehicle.maxSpeed = 0;
    this.elapsed += dt;
    return this.elapsed >= (this.ctx.duration ?? 28800); // 8h in-game
  }
}

class AttackGoal implements Goal {
  type    = GoalType.ATTACK;
  ctx: GoalContext;
  private losTimer = 0;
  private canSee   = false;

  constructor(ctx: GoalContext) { this.ctx = ctx; }

  tick(brain: NPCBrain, dt: number): boolean {
    this.losTimer -= dt;
    if (this.losTimer <= 0) {
      this.losTimer = 0.2;
      const tracker = getSpatialTracker();
      const target  = tracker.get(this.ctx.targetEntityId ?? '');
      if (!target) return true; // target gone

      this.canSee = hasLOS(
        brain.vehicle.position.x, brain.vehicle.position.y + 1.7,
        brain.vehicle.position.z,
        target.position.x, (target as any).posY ?? brain.vehicle.position.y + 1.7,
        target.position.z,
      );
    }

    if (this.canSee) {
      const tracker = getSpatialTracker();
      const target  = tracker.get(this.ctx.targetEntityId ?? '');
      if (target) {
        brain.setSeekTarget(
          new THREE.Vector3(target.position.x, brain.vehicle.position.y, target.position.z),
        );
      }
      brain.vehicle.maxSpeed = brain.runSpeed;
    }

    return !this.canSee && brain._lastGoalDist2 > 400; // lost sight
  }
}

class InterposeGoal implements Goal {
  type = GoalType.INTERPOSE;
  ctx: GoalContext;

  constructor(ctx: GoalContext) { this.ctx = ctx; }

  tick(brain: NPCBrain, _dt: number): boolean {
    // Maintain interposition between two tracked entities
    const tracker = getSpatialTracker();
    const a = tracker.get(brain.interposeAgentA ?? '');
    const b = tracker.get(brain.interposeAgentB ?? '');
    if (!a || !b) return true;

    const mx = (a.position.x + b.position.x) * 0.5;
    const mz = (a.position.z + b.position.z) * 0.5;
    brain.setArriveDest(new THREE.Vector3(mx, brain.vehicle.position.y, mz));
    brain.vehicle.maxSpeed = brain.runSpeed;
    return false;
  }
}

class FleeGoal implements Goal {
  type = GoalType.FLEE;
  ctx: GoalContext;
  private elapsed = 0;

  constructor(ctx: GoalContext) { this.ctx = ctx; }

  tick(brain: NPCBrain, dt: number): boolean {
    this.elapsed += dt;
    if (this.ctx.targetEntityId) {
      const t = getSpatialTracker().get(this.ctx.targetEntityId);
      if (t) brain.setFleeTarget(new THREE.Vector3(t.position.x, 0, t.position.z));
    }
    brain.vehicle.maxSpeed = brain.runSpeed;
    return this.elapsed > 8;
  }
}

// ─── Goal registry (scriptable — register new Goal constructors here) ─────────

type GoalFactory = (ctx: GoalContext) => Goal;
const GOAL_REGISTRY = new Map<GoalType, GoalFactory>([
  [GoalType.IDLE,       ctx => new IdleGoal(ctx)],
  [GoalType.GOTO,       ctx => new GotoGoal(ctx)],
  [GoalType.VENDOR,     ctx => new VendorGoal(ctx)],
  [GoalType.SLEEP,      ctx => new SleepGoal(ctx)],
  [GoalType.ATTACK,     ctx => new AttackGoal(ctx)],
  [GoalType.INTERPOSE,  ctx => new InterposeGoal(ctx)],
  [GoalType.FLEE,       ctx => new FleeGoal(ctx)],
]);

export function registerGoal(type: GoalType, factory: GoalFactory): void {
  GOAL_REGISTRY.set(type, factory);
}

// ─── NPCBrain ─────────────────────────────────────────────────────────────────

export interface NPCBrainOptions {
  id:           string;
  faction?:     NPCFaction;
  walkSpeed?:   number;
  runSpeed?:    number;
  visionRange?: number;
  buildingId?:  string;
  homeFloor?:   number;
  homePosition?: THREE.Vector3;
  isVendor?:    boolean;
}

export class NPCBrain implements TrackedEntity {
  // TrackedEntity
  readonly trackId:   string;
  readonly trackType: EntityType = EntityType.NPC;
  position: { x: number; z: number };
  active = true;

  // YUKA vehicle (drives actual movement)
  vehicle: YUKA.Vehicle;

  // Public config
  faction:      NPCFaction;
  walkSpeed:    number;
  runSpeed:     number;
  visionRange:  number;
  buildingId?:  string;
  homeFloor:    number;
  homePosition: THREE.Vector3;
  isVendor:     boolean;

  sentiment     = new SentimentMap();
  goalStack:    Goal[] = [];

  // Interpose targets
  interposeAgentA?: string;
  interposeAgentB?: string;

  // Internal tracking
  _lastGoalDist2 = Infinity;

  // Steering behaviors (held for removal/enable toggles)
  private _seekBehavior:    YUKA.SeekBehavior;
  private _arriveBehavior:  YUKA.ArriveBehavior;
  private _fleeBehavior:    YUKA.FleeBehavior;
  private _wanderBehavior:  YUKA.WanderBehavior;
  private _sepBehavior:     YUKA.SeparationBehavior;
  private _alignBehavior:   YUKA.AlignmentBehavior;
  private _cohBehavior:     YUKA.CohesionBehavior;

  private _losTimer       = 0;
  private _lastPos        = new YUKA.Vector3();

  // Three.js mesh driven by YUKA matrix
  mesh?: THREE.Object3D;

  constructor(opts: NPCBrainOptions) {
    this.trackId     = opts.id;
    this.position    = { x: 0, z: 0 };
    this.faction     = opts.faction     ?? NPCFaction.NEUTRAL;
    this.walkSpeed   = opts.walkSpeed   ?? 1.8;
    this.runSpeed    = opts.runSpeed    ?? 4.5;
    this.visionRange = opts.visionRange ?? 35;
    this.buildingId  = opts.buildingId;
    this.homeFloor   = opts.homeFloor   ?? 0;
    this.homePosition= opts.homePosition ?? new THREE.Vector3();
    this.isVendor    = opts.isVendor    ?? false;

    // Create YUKA Vehicle
    this.vehicle = new YUKA.Vehicle();
    this.vehicle.maxSpeed  = this.walkSpeed;
    this.vehicle.maxForce  = 12;
    this.vehicle.mass      = 1;

    // Build steering behaviors (all inactive until activated by goals)
    this._seekBehavior   = new YUKA.SeekBehavior(new YUKA.Vector3());
    this._arriveBehavior = new YUKA.ArriveBehavior(new YUKA.Vector3(), 2.5, 0.1);
    this._fleeBehavior   = new YUKA.FleeBehavior(new YUKA.Vector3(), 12);
    this._wanderBehavior = new YUKA.WanderBehavior();
    this._wanderBehavior.radius      = 3;
    this._wanderBehavior.distance    = 5;
    this._wanderBehavior.jitter      = 0.2;
    this._sepBehavior    = new YUKA.SeparationBehavior();
    this._alignBehavior  = new YUKA.AlignmentBehavior();
    this._cohBehavior    = new YUKA.CohesionBehavior();

    // Add all behaviors; goals enable/disable them by weight
    this.vehicle.steering.add(this._seekBehavior);
    this.vehicle.steering.add(this._arriveBehavior);
    this.vehicle.steering.add(this._fleeBehavior);
    this.vehicle.steering.add(this._wanderBehavior);
    this.vehicle.steering.add(this._sepBehavior);
    this.vehicle.steering.add(this._alignBehavior);
    this.vehicle.steering.add(this._cohBehavior);

    this._setAllWeights(0);

    // Register in spatial tracker
    getSpatialTracker().add(this);
  }

  // ── Goal management ────────────────────────────────────────────────────────

  pushGoal(type: GoalType, ctx: GoalContext = {}): void {
    const factory = GOAL_REGISTRY.get(type);
    if (!factory) { console.warn(`[NPCBrain] Unknown goal: ${type}`); return; }
    this.goalStack.push(factory(ctx));
  }

  clearGoals(): void { this.goalStack.length = 0; }

  get currentGoal(): Goal | undefined {
    return this.goalStack[this.goalStack.length - 1];
  }

  // ── Steering helpers (called by Goal implementations) ─────────────────────

  setSeekTarget(pos: THREE.Vector3): void {
    this._setAllWeights(0);
    this._seekBehavior.target.set(pos.x, pos.y, pos.z);
    this._seekBehavior.weight = 1;
    this._sepBehavior.weight  = 0.4;
  }

  setArriveDest(pos: THREE.Vector3): void {
    this._setAllWeights(0);
    this._arriveBehavior.target.set(pos.x, pos.y, pos.z);
    this._arriveBehavior.weight = 1;
    this._sepBehavior.weight    = 0.3;
  }

  setFleeTarget(pos: THREE.Vector3): void {
    this._setAllWeights(0);
    this._fleeBehavior.target.set(pos.x, pos.y, pos.z);
    this._fleeBehavior.weight = 1;
  }

  enableWander(): void {
    this._setAllWeights(0);
    this._wanderBehavior.weight = 1;
    this._sepBehavior.weight    = 0.4;
  }

  /** Enable full flocking weights (used by NPCManager for group assignment) */
  enableFlocking(weight = 1): void {
    this._setAllWeights(0);
    this._sepBehavior.weight   = weight;
    this._alignBehavior.weight = weight * 0.6;
    this._cohBehavior.weight   = weight * 0.5;
    this._wanderBehavior.weight= weight * 0.3;
  }

  // ── Main tick ──────────────────────────────────────────────────────────────

  tick(dt: number, entityManager: YUKA.EntityManager): void {
    // Tick sentiment decay
    this.sentiment.tick(dt);

    // Tick current goal
    if (this.currentGoal) {
      const done = this.currentGoal.tick(this, dt);
      if (done) this.goalStack.pop();
    } else {
      this._defaultBehavior();
    }

    // Sync position to spatial tracker
    const p       = this.vehicle.position;
    this.position.x = p.x;
    this.position.z = p.z;
    getSpatialTracker().move(this);

    // Sync Three.js mesh if present
    if (this.mesh) {
      const m = new THREE.Matrix4();
      const v = this.vehicle.worldMatrix;
      m.set(
        v.elements[0], v.elements[4], v.elements[8],  v.elements[12],
        v.elements[1], v.elements[5], v.elements[9],  v.elements[13],
        v.elements[2], v.elements[6], v.elements[10], v.elements[14],
        v.elements[3], v.elements[7], v.elements[11], v.elements[15],
      );
      this.mesh.matrixAutoUpdate = false;
      this.mesh.matrix.copy(m);
    }
  }

  // ── Utility ────────────────────────────────────────────────────────────────

  setPosition(x: number, y: number, z: number): void {
    this.vehicle.position.set(x, y, z);
    this.position.x = x;
    this.position.z = z;
    getSpatialTracker().move(this);
  }

  dispose(): void {
    this.active = false;
    getSpatialTracker().remove(this);
  }

  private _setAllWeights(w: number): void {
    this._seekBehavior.weight   = w;
    this._arriveBehavior.weight = w;
    this._fleeBehavior.weight   = w;
    this._wanderBehavior.weight = w;
    this._sepBehavior.weight    = w;
    this._alignBehavior.weight  = w;
    this._cohBehavior.weight    = w;
  }

  private _defaultBehavior(): void {
    // Vendors stand still; others wander gently
    if (this.isVendor) {
      this.vehicle.maxSpeed = 0;
    } else {
      this.vehicle.maxSpeed = this.walkSpeed;
      this.enableWander();
      this.pushGoal(GoalType.IDLE, { duration: 2 + Math.random() * 4 });
    }
  }
}
