/**
 * FollowBrain — simple companion AI that follows the player.
 *
 * Uses the same locomotion system as the player (LocomotionAnimator)
 * so NPCs walk/run with identical animation blending and phase-synced
 * crossfades. No pathfinding — just YUKA ArriveBehavior with a
 * configurable follow distance.
 *
 * Usage:
 *   const brain = new FollowBrain(npcGroup, clips, mixer);
 *   brain.setTarget(playerPosition);
 *   // every frame:
 *   brain.update(dt);
 */

import * as THREE from 'three';
import * as YUKA from 'yuka';
import { LocomotionAnimator } from '../LocomotionAnimator';

export interface FollowBrainConfig {
  /** Distance at which the NPC stops and idles (default 3m). */
  arriveRadius?: number;
  /** Distance at which the NPC starts running instead of walking (default 8m). */
  runThreshold?: number;
  /** Walk speed in m/s (default 1.8). */
  walkSpeed?: number;
  /** Run speed in m/s (default 5.0). */
  runSpeed?: number;
  /** How fast the NPC rotates toward movement direction in rad/s (default 8). */
  turnSpeed?: number;
}

const DEFAULT_CONFIG: Required<FollowBrainConfig> = {
  arriveRadius: 3,
  runThreshold: 8,
  walkSpeed: 1.8,
  runSpeed: 5.0,
  turnSpeed: 8,
};

export type BrainMode = 'follow' | 'guard' | 'station';

export class FollowBrain {
  readonly vehicle: YUKA.Vehicle;
  readonly locomotion: LocomotionAnimator;
  readonly group: THREE.Group;

  private config: Required<FollowBrainConfig>;
  private arrive: YUKA.ArriveBehavior;
  private targetPos: THREE.Vector3 = new THREE.Vector3();
  private _yukaTarget: YUKA.Vector3 = new YUKA.Vector3();

  /** Current behavior mode — affects how the NPC moves relative to target. */
  private mode: BrainMode = 'follow';
  /** For 'station' mode: the fixed position the NPC works at. */
  private stationPos: THREE.Vector3 | null = null;
  /** For 'guard' mode: patrol offset angle that rotates over time. */
  private guardAngle: number = Math.random() * Math.PI * 2;

  /** Quaternion used for smooth rotation via rotateTowards. */
  private targetQuat: THREE.Quaternion = new THREE.Quaternion();
  private currentQuat: THREE.Quaternion = new THREE.Quaternion();

  constructor(
    group: THREE.Group,
    clips: THREE.AnimationClip[],
    mixer: THREE.AnimationMixer,
    config: FollowBrainConfig = {},
  ) {
    this.group = group;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.locomotion = new LocomotionAnimator(mixer, clips);

    // YUKA vehicle for steering
    this.vehicle = new YUKA.Vehicle();
    this.vehicle.maxSpeed = this.config.runSpeed;
    this.vehicle.mass = 1;

    // ArriveBehavior decelerates on approach
    this.arrive = new YUKA.ArriveBehavior(this._yukaTarget, 2, 0.5);
    this.vehicle.steering.add(this.arrive);

    // Sync initial position from the Three.js group
    this.vehicle.position.set(group.position.x, group.position.y, group.position.z);
  }

  /** Set the position the NPC should follow (typically the player). */
  setTarget(pos: THREE.Vector3) {
    this.targetPos.copy(pos);
    this._yukaTarget.set(pos.x, pos.y, pos.z);
    this.arrive.target = this._yukaTarget;
  }

  /**
   * Switch this NPC's behavior mode and update its movement parameters.
   *
   * Modes:
   *   - 'follow': stays close to the player (default companion)
   *   - 'guard': patrols a circle around the player at medium distance
   *   - 'station': stays at a fixed position (workstation, stall, watchtower)
   */
  setMode(mode: BrainMode, overrides?: Partial<FollowBrainConfig>) {
    this.mode = mode;
    if (overrides) {
      Object.assign(this.config, overrides);
    }
    if (mode === 'station') {
      // Lock station position to wherever the NPC currently is
      this.stationPos = this.group.position.clone();
    }
  }

  /** Set the station position explicitly (e.g. to a building's work point). */
  setStationPosition(pos: THREE.Vector3) {
    this.stationPos = pos.clone();
  }

  /** Call every frame. Updates steering, locomotion, and rotation. */
  update(dt: number) {
    // Compute the effective target based on mode
    let effectiveTarget = this.targetPos;

    if (this.mode === 'station' && this.stationPos) {
      // Station mode: NPC stays at their workstation, ignores player position
      effectiveTarget = this.stationPos;
    } else if (this.mode === 'guard') {
      // Guard mode: patrol a circle around the player at the arrive radius
      this.guardAngle += dt * 0.3; // slow orbit
      const guardDist = this.config.arriveRadius + 2;
      effectiveTarget = new THREE.Vector3(
        this.targetPos.x + Math.cos(this.guardAngle) * guardDist,
        this.targetPos.y,
        this.targetPos.z + Math.sin(this.guardAngle) * guardDist,
      );
    }

    // Update YUKA target
    this._yukaTarget.set(effectiveTarget.x, effectiveTarget.y, effectiveTarget.z);
    this.arrive.target = this._yukaTarget;

    const dx = effectiveTarget.x - this.group.position.x;
    const dz = effectiveTarget.z - this.group.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    // Decide speed based on distance
    const isRunning = dist > this.config.runThreshold;
    const isIdle = dist < this.config.arriveRadius;

    this.vehicle.maxSpeed = isRunning ? this.config.runSpeed : this.config.walkSpeed;

    if (isIdle) {
      // Close enough — idle
      this.locomotion.setMovement(0, 0, 0);
      this.vehicle.velocity.set(0, 0, 0);
    } else {
      // Update YUKA steering
      this.vehicle.update(dt);

      // Map velocity to locomotion input
      const speed = this.vehicle.getSpeed();
      const speed01 = THREE.MathUtils.mapLinear(
        speed,
        0, this.config.runSpeed,
        0, 1.0,
      );

      // Forward vector from velocity
      const vx = this.vehicle.velocity.x;
      const vz = this.vehicle.velocity.z;
      const vmag = Math.sqrt(vx * vx + vz * vz) || 1;

      // All movement is "forward" from the NPC's perspective — it rotates to face
      this.locomotion.setMovement(1, 0, Math.min(1, speed01));

      // Smooth rotation toward movement direction (rotateTowards)
      if (vmag > 0.01) {
        const angle = Math.atan2(vx, vz);
        this.targetQuat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), angle);
        this.group.quaternion.rotateTowards(this.targetQuat, this.config.turnSpeed * dt);
      }

      // Sync Three.js group position from YUKA vehicle
      this.group.position.set(
        this.vehicle.position.x,
        this.group.position.y,  // keep Y from terrain/physics
        this.vehicle.position.z,
      );
    }

    // Tick locomotion blend weights
    this.locomotion.update(dt);
  }

  /** Teleport the NPC to a specific position (no animation). */
  teleportTo(pos: THREE.Vector3) {
    this.group.position.copy(pos);
    this.vehicle.position.set(pos.x, pos.y, pos.z);
  }

  dispose() {
    this.vehicle.steering.clear();
  }
}
