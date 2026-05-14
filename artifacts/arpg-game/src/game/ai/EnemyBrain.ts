/**
 * EnemyBrain — YUKA-powered enemy AI controller.
 *
 * Two archetypes:
 *  MELEE  — PursuitBehavior (predicts player position) + separation
 *  RANGED — ArriveBehavior to strafe at engagement range + EvadeBehavior
 *           when player gets too close + shoot timer
 *
 * State machine:
 *   IDLE    → wander slowly
 *   ALERT   → briefly remember player after losing LOS
 *   PURSUE  → close-range chase (melee only)
 *   COMBAT  → attack / shoot phase
 *   FLEE    → retreat when health < fleeHP threshold
 *
 * References:
 *   https://mugen87.github.io/yuka/examples/steering/pursuit/
 *   https://mugen87.github.io/yuka/examples/steering/obstacleAvoidance/
 *   https://github.com/Mugen87/dive (ranged combat reference)
 */

import * as YUKA from 'yuka';
import * as THREE from 'three';

// ─── Types ────────────────────────────────────────────────────────────────────

export const enum EnemyRole {
  MELEE  = 'melee',
  RANGED = 'ranged',
}

export const enum CombatState {
  IDLE    = 'idle',
  PURSUE  = 'pursue',
  COMBAT  = 'combat',
  FLEE    = 'flee',
}

export interface EnemyBrainOptions {
  role:          EnemyRole;
  x:             number;
  y:             number;
  z:             number;
  speed:         number;
  /** Shared player-proxy vehicle — position set by EnemyManager each frame. */
  playerProxy:   YUKA.Vehicle;
  entityManager: YUKA.EntityManager;
}

// ─── EnemyBrain ───────────────────────────────────────────────────────────────

export class EnemyBrain {
  vehicle:    YUKA.Vehicle;
  role:       EnemyRole;
  state:      CombatState = CombatState.IDLE;

  // Ranged shooting
  shootTimer    = 0;
  readonly shootCooldown: number;
  /** Set true by this brain; cleared by EnemyManager after spawning a shot. */
  pendingShot   = false;

  // Ranged strafe
  private strafeDir   = 1;
  private strafeTimer = 0;

  // Alert memory — how long to keep pursuing after losing sight
  private alertTimer = 0;

  // Steering behaviors
  private _pursuit: YUKA.PursuitBehavior;
  private _arrive:  YUKA.ArriveBehavior;
  private _flee:    YUKA.FleeBehavior;
  private _wander:  YUKA.WanderBehavior;

  // ── Patrol state ───────────────────────────────────────────────────────────
  // Replaces the old "spin in a 5m circle" YUKA WanderBehavior idle. Each
  // enemy picks a new waypoint within `_patrolRadius` of its home, walks
  // there at a slow speed, idles for a few seconds, then picks the next.
  // This reads as deliberate patrolling rather than the dizzy circling
  // the bare WanderBehavior produced.
  private _patrolHome:    YUKA.Vector3;
  private _patrolTarget:  YUKA.Vector3 | null = null;
  private _patrolLinger:  number;
  private _patrolRadius:  number;
  private _patrolHopMin:  number;
  private _patrolHopMax:  number;

  // Config
  readonly alertRange:  number;
  readonly engageRange: number;
  readonly fleeHP:      number;

  private _playerProxy: YUKA.Vehicle;

  constructor(opts: EnemyBrainOptions) {
    this.role         = opts.role;
    this._playerProxy = opts.playerProxy;

    // Archetype settings
    if (opts.role === EnemyRole.RANGED) {
      this.alertRange   = 40;
      this.engageRange  = 17;
      this.shootCooldown = 2.5;
      this.fleeHP       = 0.25; // ranged enemies flee earlier
    } else {
      this.alertRange   = 32;
      this.engageRange  = 2.2;
      this.shootCooldown = 0;
      this.fleeHP       = 0.12;
    }

    // Build YUKA vehicle
    this.vehicle = new YUKA.Vehicle();
    this.vehicle.position.set(opts.x, opts.y, opts.z);
    this.vehicle.maxSpeed = opts.speed;
    this.vehicle.maxForce = 20;
    this.vehicle.mass     = 1;

    // Build steering behaviors
    // Pursuit — predicts player position a short time ahead (factor 0.15)
    this._pursuit = new YUKA.PursuitBehavior(opts.playerProxy, 0.15);
    // Arrive — used by ranged enemies to reach the strafe target
    this._arrive  = new YUKA.ArriveBehavior(new YUKA.Vector3(), 3.0, 0.05);
    // Flee — low-health retreat; target updated each frame
    this._flee    = new YUKA.FleeBehavior(new YUKA.Vector3(), 15);
    // Wander — kept as a low-weight overlay during PURSUE so paths look
    // organic, but no longer drives idle behaviour (which was the source
    // of the "walking in stupid circles" bug).
    this._wander  = new YUKA.WanderBehavior();
    this._wander.radius   = 1.2;
    this._wander.distance = 8;
    this._wander.jitter   = 0.05;

    // Patrol — initialise the home position to spawn point, give each
    // enemy a slightly different beat so a group doesn't move in unison.
    this._patrolHome   = new YUKA.Vector3(opts.x, opts.y, opts.z);
    this._patrolLinger = 1.0 + Math.random() * 2.0;  // brief settle on spawn
    this._patrolRadius = 16 + Math.random() * 10;    // 16–26 m beat
    this._patrolHopMin = 7;
    this._patrolHopMax = 16;

    this.vehicle.steering.add(this._pursuit);
    this.vehicle.steering.add(this._arrive);
    this.vehicle.steering.add(this._flee);
    this.vehicle.steering.add(this._wander);
    this._zero();

    // Register in EntityManager (YUKA handles integration)
    opts.entityManager.add(this.vehicle);
  }

  // ── Per-frame update (call BEFORE entityManager.update) ───────────────────

  /**
   * @param dt         Delta time seconds
   * @param playerPos  Current player world position
   * @param healthRatio  current HP / maxHP (0–1)
   */
  update(dt: number, playerPos: THREE.Vector3, healthRatio: number): void {
    const dx   = playerPos.x - this.vehicle.position.x;
    const dz   = playerPos.z - this.vehicle.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    // ── State transitions ───────────────────────────────────────────────────
    if (healthRatio < this.fleeHP) {
      this.state = CombatState.FLEE;
    } else {
      if (dist < this.alertRange) {
        this.alertTimer = 6; // remember player for 6s

        if (this.role === EnemyRole.MELEE) {
          this.state = dist < this.engageRange + 1.5
            ? CombatState.COMBAT
            : CombatState.PURSUE;
        } else {
          // Ranged: go straight to combat once in range
          this.state = CombatState.COMBAT;
        }
      } else {
        this.alertTimer -= dt;
        if (this.alertTimer > 0) {
          // Still alert (chasing after losing sight)
          this.state = CombatState.PURSUE;
        } else {
          this.state = CombatState.IDLE;
        }
      }
    }

    // ── Apply behaviors for current state ──────────────────────────────────
    this._zero();

    switch (this.state) {
      case CombatState.IDLE:
        this._idlePatrol(dt);
        break;

      case CombatState.PURSUE:
        // Clear the patrol target — when the chase ends, the enemy will
        // pick a fresh waypoint relative to its current position rather
        // than trying to resume an old trail across the map.
        this._patrolTarget = null;
        this._patrolLinger = 0.5 + Math.random() * 1.5;
        this.vehicle.maxSpeed = 5.5;
        this._pursuit.weight  = 1.0;
        this._wander.weight   = 0.1;  // tiny jitter — paths look less robotic
        break;

      case CombatState.COMBAT:
        if (this.role === EnemyRole.MELEE) {
          this.vehicle.maxSpeed = 5.5;
          this._pursuit.weight  = 1.0;
        } else {
          this._rangedCombat(dt, playerPos, dist);
        }
        break;

      case CombatState.FLEE:
        this.vehicle.maxSpeed = 7;
        this._flee.target.set(playerPos.x, this.vehicle.position.y, playerPos.z);
        this._flee.weight     = 1.0;
        break;
    }

    // ── Ranged shoot timer ─────────────────────────────────────────────────
    if (this.role === EnemyRole.RANGED && this.state === CombatState.COMBAT) {
      this.shootTimer -= dt;
      if (this.shootTimer <= 0 && !this.pendingShot) {
        this.shootTimer  = this.shootCooldown * (0.75 + Math.random() * 0.5);
        this.pendingShot = true;
      }
    }
  }

  // ── Idle patrol (waypoint + linger) ────────────────────────────────────────

  /**
   * Walks the enemy between long-range waypoints with a brief idle pause
   * at each one. Replaces the old YUKA WanderBehavior idle which produced
   * tight circular paths because the wander circle was attached to the
   * vehicle's facing — the enemy chased its own jitter.
   */
  private _idlePatrol(dt: number): void {
    // Pause at the waypoint (or on first spawn).
    if (this._patrolLinger > 0) {
      this._patrolLinger -= dt;
      this.vehicle.maxSpeed = 0;
      // Bleed off velocity so the enemy actually stands still.
      this.vehicle.velocity.set(0, 0, 0);
      return;
    }

    // Pick a new waypoint when we don't have one.
    if (!this._patrolTarget) {
      this._pickPatrolTarget();
    }

    // Reached?
    const tgt = this._patrolTarget!;
    const dx  = tgt.x - this.vehicle.position.x;
    const dz  = tgt.z - this.vehicle.position.z;
    const d2  = dx * dx + dz * dz;
    if (d2 < 1.5 * 1.5) {
      this._patrolTarget = null;
      this._patrolLinger = 3 + Math.random() * 4;  // 3–7 s breather
      this.vehicle.maxSpeed = 0;
      this.vehicle.velocity.set(0, 0, 0);
      return;
    }

    // Walk toward the waypoint with ARRIVE so the enemy decelerates as
    // it gets close instead of overshooting and circling.
    this.vehicle.maxSpeed = 1.4;
    this._arrive.target.copy(tgt);
    this._arrive.weight   = 1.0;
  }

  private _pickPatrolTarget(): void {
    // Random direction + 7–16 m hop. Keeps movement local and varied so
    // groups don't all walk in lockstep across the map.
    const angle = Math.random() * Math.PI * 2;
    const r     = this._patrolHopMin + Math.random() * (this._patrolHopMax - this._patrolHopMin);
    let tx = this.vehicle.position.x + Math.cos(angle) * r;
    let tz = this.vehicle.position.z + Math.sin(angle) * r;

    // Clamp to a soft leash around home so wandering doesn't drift the
    // enemy off the playable area over time.
    const hdx = tx - this._patrolHome.x;
    const hdz = tz - this._patrolHome.z;
    const hr2 = hdx * hdx + hdz * hdz;
    const maxR = this._patrolRadius;
    if (hr2 > maxR * maxR) {
      const len = Math.sqrt(hr2);
      const k   = maxR / len;
      tx = this._patrolHome.x + hdx * k;
      tz = this._patrolHome.z + hdz * k;
    }

    this._patrolTarget = new YUKA.Vector3(tx, this.vehicle.position.y, tz);
  }

  // ── Ranged combat positioning ──────────────────────────────────────────────

  private _rangedCombat(dt: number, playerPos: THREE.Vector3, dist: number): void {
    // Switch strafe direction periodically
    this.strafeTimer -= dt;
    if (this.strafeTimer <= 0) {
      this.strafeTimer = 1.5 + Math.random() * 2.0;
      this.strafeDir  *= -1;
    }

    // Unit vector toward player
    const dx  = playerPos.x - this.vehicle.position.x;
    const dz  = playerPos.z - this.vehicle.position.z;
    const len = Math.sqrt(dx * dx + dz * dz) + 0.001;
    const nx = dx / len, nz = dz / len;

    // Perpendicular strafe direction
    const sx =  -nz * this.strafeDir;
    const sz =   nx * this.strafeDir;

    // Radial correction to maintain engagement range
    let rx = 0, rz = 0;
    if (dist < this.engageRange - 3) {      // too close → back away
      rx = -nx;  rz = -nz;
    } else if (dist > this.engageRange + 5) { // too far → approach
      rx =  nx;  rz =  nz;
    }

    const reach  = 7;
    const tgtX   = this.vehicle.position.x + (sx + rx) * reach;
    const tgtZ   = this.vehicle.position.z + (sz + rz) * reach;

    this.vehicle.maxSpeed   = 4.5;
    this._arrive.target.set(tgtX, this.vehicle.position.y, tgtZ);
    this._arrive.weight     = 1.0;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private _zero(): void {
    this._pursuit.weight = 0;
    this._arrive.weight  = 0;
    this._flee.weight    = 0;
    this._wander.weight  = 0;
  }

  dispose(entityManager: YUKA.EntityManager): void {
    entityManager.remove(this.vehicle);
  }
}
