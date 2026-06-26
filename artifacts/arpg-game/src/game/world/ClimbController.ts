/**
 * ClimbController — surface-climbing mechanic tied to the Nexus stat system.
 *
 * Detects near-vertical surfaces via forward raycast from the player's chest.
 * When the player presses Space near a climbable wall while airborne (or
 * holding forward), the controller enters the `climbing` state and drives
 * movement up/down/across the surface.
 *
 * Stat integration (reads from the same perkEffects bag as SwimController):
 *   • KIN → `climbSpeed`  : faster ascent/descent (base 1.5 m/s + bonus)
 *   • KIN → `staminaRegen`: offsets the 3 HP/s stamina drain
 *   • GRA ≥ 3 → `wallRun` : unlocks a wall-run burst (fast upward dash)
 *
 * Wall probes reuse the same BVH-backed occluder list as ThirdPersonCamera
 * (set via `setOccluders` from GameEngine) rather than walking the full
 * scene graph — consistent layer filtering and no Sprite raycast crashes.
 *
 * The controller is stateless between frames — it re-probes every tick and
 * detaches the player the instant no wall is found, stamina runs out, or
 * the player presses Jump to leap off.
 */

import * as THREE from 'three';
import type { PlayerController } from '../PlayerController';
import { bindWorldRaycaster } from '../Layers';

export type ClimbState = 'idle' | 'climbing' | 'wall_run';

export type ClimbStatReader = (key: string) => number;

// ── Tuning ────────────────────────────────────────────────────────────────

const PROBE_DISTANCE = 0.8;         // m — how far forward to raycast
const MAX_NORMAL_Y   = 0.3;         // surface must be near-vertical (normal.y < this)
const BASE_CLIMB_SPEED = 1.5;       // m/s without stat bonus
const STAMINA_DRAIN_PER_SEC = 3.0;  // stamina/s while climbing
const WALL_RUN_SPEED = 6.0;         // m/s during wall-run burst
const WALL_RUN_DURATION = 0.6;      // s — short upward dash
const DETACH_LEAP_SPEED = 4.0;      // m/s upward impulse on jump-off

const _rayOrigin = new THREE.Vector3();
const _rayDir    = new THREE.Vector3();
const _wallNormalScratch = new THREE.Vector3();

export class ClimbController {
  private player: PlayerController;
  private readonly raycaster = new THREE.Raycaster();

  /** BVH-backed static meshes — shared list with ThirdPersonCamera. */
  private occluders: THREE.Object3D[] = [];

  state: ClimbState = 'idle';

  /** Surface normal of the wall the player is currently on. */
  wallNormal = new THREE.Vector3();

  /**
   * Perk-effect reader. Set by GameEngine after construction, same pattern
   * as SwimController.readStat.
   */
  readStat: ClimbStatReader = () => 0;

  /** True when the player is on a climbable surface (even if not climbing yet). */
  nearWall = false;

  private wallRunTimer = 0;
  /** Track Space-key so we only trigger on the leading edge. */
  private spaceWasDown = false;

  constructor(player: PlayerController, camera: THREE.Camera) {
    this.player = player;
    bindWorldRaycaster(this.raycaster, camera);
  }

  /** Same occluder list as ThirdPersonCamera — set once after scene BVHs build. */
  setOccluders(meshes: THREE.Object3D[]): void {
    this.occluders = meshes;
  }

  // ── Dynamic stat getters ──────────────────────────────────────────────

  private get effectiveClimbSpeed(): number {
    return BASE_CLIMB_SPEED * (1 + this.readStat('climbSpeed'));
  }

  private get hasWallRun(): boolean {
    return this.readStat('wallRun') >= 1;
  }

  // ── Per-frame tick ────────────────────────────────────────────────────

  update(dt: number): void {
    const p = this.player.position;
    const keys = this.player.keys;
    const spaceDown = !!keys['Space'];
    const spaceJustPressed = spaceDown && !this.spaceWasDown;
    this.spaceWasDown = spaceDown;

    // ── Probe for a climbable wall ──────────────────────────────────────
    this.nearWall = false;
    if (this.occluders.length > 0) {
      const fwd = this.player.getForwardDir();
      _rayOrigin.set(p.x, p.y + 0.8, p.z); // chest height
      _rayDir.copy(fwd).normalize();
      this.raycaster.set(_rayOrigin, _rayDir);
      this.raycaster.far = PROBE_DISTANCE;

      const hits = this.raycaster.intersectObjects(this.occluders, true);
      for (const h of hits) {
        if (!(h.object instanceof THREE.Mesh)) continue;
        if (!h.face) continue;
        _wallNormalScratch
          .copy(h.face.normal)
          .transformDirection(h.object.matrixWorld)
          .normalize();
        if (Math.abs(_wallNormalScratch.y) < MAX_NORMAL_Y) {
          this.wallNormal.copy(_wallNormalScratch);
          this.nearWall = true;
          break;
        }
      }
    }

    // ── State machine ───────────────────────────────────────────────────

    switch (this.state) {
      case 'idle': {
        // Can't start climbing while swimming/submerged or mounted on a boat
        if (this.player.isSwimming || this.player.mountedBoat) break;

        // Transition to climbing: near a wall + Space just pressed
        if (this.nearWall && spaceJustPressed) {
          // Check stamina
          if (this.player.stats.stamina > 1) {
            this.state = 'climbing';
          }
        }
        break;
      }

      case 'climbing': {
        if (!this.nearWall || this.player.stats.stamina <= 0) {
          this.detach(0);
          break;
        }

        // Wall-run burst: Space again while climbing (GRA ≥ 3 required)
        if (spaceJustPressed && this.hasWallRun) {
          this.state = 'wall_run';
          this.wallRunTimer = WALL_RUN_DURATION;
          break;
        }

        // Jump off wall: Space without wallRun
        if (spaceJustPressed && !this.hasWallRun) {
          this.detach(DETACH_LEAP_SPEED);
          break;
        }

        this.applyClimbMovement(dt, this.effectiveClimbSpeed);
        this.drainStamina(dt);
        break;
      }

      case 'wall_run': {
        this.wallRunTimer -= dt;
        if (this.wallRunTimer <= 0 || !this.nearWall) {
          this.state = this.nearWall ? 'climbing' : 'idle';
          break;
        }

        // Wall run = fast vertical ascent
        p.y += WALL_RUN_SPEED * dt;
        this.drainStamina(dt * 1.5); // heavier drain during wall-run
        break;
      }
    }

    // Expose climbing flag to PlayerController so it can suppress gravity,
    // jump, and ground snap while we're on the wall.
    (this.player as unknown as { isClimbing: boolean }).isClimbing =
      this.state !== 'idle';
  }

  // ── Helpers ───────────────────────────────────────────────────────────

  private applyClimbMovement(dt: number, speed: number): void {
    const p = this.player.position;
    const keys = this.player.keys;

    // Up/down along the wall
    if (keys['KeyW']) p.y += speed * dt;
    if (keys['KeyS']) p.y -= speed * dt;

    // Lateral (strafe along the wall face)
    if (keys['KeyA'] || keys['KeyD']) {
      // Cross product of wall normal and up = lateral direction
      const lateral = new THREE.Vector3()
        .crossVectors(this.wallNormal, THREE.Object3D.DEFAULT_UP)
        .normalize();
      if (keys['KeyA']) p.addScaledVector(lateral, -speed * 0.7 * dt);
      if (keys['KeyD']) p.addScaledVector(lateral,  speed * 0.7 * dt);
    }

    // Keep the player pressed against the wall (so the raycast stays valid)
    const fwd = this.player.getForwardDir();
    p.x = p.x + fwd.x * 0.02; // gentle push toward wall
    p.z = p.z + fwd.z * 0.02;
  }

  private drainStamina(dt: number): void {
    const drain = STAMINA_DRAIN_PER_SEC - this.readStat('staminaRegen') * 0.5;
    this.player.stats.stamina = Math.max(0, this.player.stats.stamina - Math.max(0.5, drain) * dt);
  }

  private detach(verticalImpulse: number): void {
    this.state = 'idle';
    if (verticalImpulse > 0) {
      // Apply a real upward velocity so the player arcs away from the wall
      // instead of just bumping up 0.4m. We write directly to jumpVelocity
      // which handleGravity bridges into vy on the next frame. Also push
      // the player backward (away from wall normal) so they clear the
      // surface and don't immediately re-attach.
      this.player.jumpVelocity = verticalImpulse;
      this.player.isGrounded = false;
      // Push away from wall so the next-frame raycast doesn't re-attach
      this.player.position.x -= this.wallNormal.x * 0.4;
      this.player.position.z -= this.wallNormal.z * 0.4;
    }
  }
}