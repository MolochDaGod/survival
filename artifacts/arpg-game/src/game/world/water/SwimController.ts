/**
 * SwimController — turns the new `WaterSurface` API into player swim
 * gameplay. Light coupling: holds a reference to the player and writes
 * `player.isSwimming` / `player.isSubmerged` flags + nudges
 * `player.position.y` so the head sits at the wave crest while moving.
 *
 * State machine
 *   dry        → not in water; idle
 *   wading     → 0.3 m < depth < 1.2 m; movement reduced, no swim anim
 *   swimming   → depth ≥ 1.2 m and head above surface; full swim
 *   submerged  → head below surface; oxygen ticks down
 *
 * Resources
 *   • Stamina drains while moving in water (1.5×ground rate).
 *   • Oxygen (max 12 s by default) drains when submerged, regens at 3 s/s
 *     while head is above surface.
 *   • Once oxygen hits 0 the player takes 5 HP/s drowning damage.
 *
 * Splash hooks
 *   • Calls `onSplash(pos, intensity)` on water-entry/exit transitions
 *     (intensity scales with vertical velocity).
 */

import * as THREE from 'three';
import type { PlayerController } from '../../PlayerController';
import type { WaterSurface } from './WaterSurface';

export type SwimState = 'dry' | 'wading' | 'swimming' | 'submerged';

interface Cfg {
  /** Minimum depth (m) before the player is considered "in water". */
  enterDepth: number;
  /** Depth at which wading transitions to full swimming. */
  swimDepth: number;
  /** Move-speed multiplier while wading. */
  wadeSpeedMul: number;
  /** Move-speed multiplier while swimming. */
  swimSpeedMul: number;
  /** Stamina drain per second while moving in water. */
  staminaDrainPerSec: number;
  /** Oxygen capacity, seconds. */
  oxygenMax: number;
  /** Oxygen drain per second while head is below surface. */
  oxygenDrainPerSec: number;
  /** Oxygen regen per second while head is above surface. */
  oxygenRegenPerSec: number;
  /** HP drain per second while drowning (oxygen at 0, still submerged). */
  drowningHpPerSec: number;
  /** Approximate eye-to-foot distance — surface anchor for "head above water". */
  eyeOffset: number;
}

const DEFAULT_CFG: Cfg = {
  enterDepth:        0.3,
  swimDepth:         1.2,
  wadeSpeedMul:      0.55,
  swimSpeedMul:      0.4,
  staminaDrainPerSec: 1.5,
  oxygenMax:         12,
  oxygenDrainPerSec: 1.0,
  oxygenRegenPerSec: 3.0,
  drowningHpPerSec:  5.0,
  eyeOffset:         1.65,
};

export class SwimController {
  private player: PlayerController;
  private water: WaterSurface;
  private cfg: Cfg;

  state: SwimState = 'dry';
  oxygen: number;
  /** Cached so the UI can read it without re-computing. */
  depth = 0;

  /** Fired when the player enters or exits water. Caller can splash etc. */
  onSplash: ((pos: THREE.Vector3, intensity: number) => void) | null = null;

  /** Multiplier the PlayerController consults when computing per-frame
   *  speed. 1 when dry. */
  speedMultiplier: number = 1;

  private prevState: SwimState = 'dry';
  private prevY: number;

  constructor(player: PlayerController, water: WaterSurface, cfg: Partial<Cfg> = {}) {
    this.player = player;
    this.water  = water;
    this.cfg    = { ...DEFAULT_CFG, ...cfg };
    this.oxygen = this.cfg.oxygenMax;
    this.prevY  = player.position.y;
  }

  update(dt: number, terrainY: number): void {
    const p = this.player.position;
    const surfaceY = this.water.getSurfaceY(p.x, p.z);
    const footY    = p.y - this.cfg.eyeOffset; // capsule feet
    const depth    = Math.max(0, surfaceY - footY);
    const headSubmerged = p.y < surfaceY;
    this.depth = depth;
    void terrainY; // reserved for shore-shape fade if/when terrain sampler wired

    // ── State select ────────────────────────────────────────────────────
    let next: SwimState;
    if (depth < this.cfg.enterDepth) next = 'dry';
    else if (headSubmerged)          next = 'submerged';
    else if (depth < this.cfg.swimDepth) next = 'wading';
    else                              next = 'swimming';

    // ── Splash transitions ──────────────────────────────────────────────
    if (next !== 'dry' && this.prevState === 'dry') {
      const vy = (p.y - this.prevY) / Math.max(dt, 1e-3);
      this.onSplash?.(new THREE.Vector3(p.x, surfaceY, p.z), Math.min(2.5, 0.8 + Math.abs(vy) * 0.15));
    } else if (next === 'dry' && this.prevState !== 'dry') {
      this.onSplash?.(new THREE.Vector3(p.x, surfaceY, p.z), 0.6);
    }

    // ── Apply per-state effects ─────────────────────────────────────────
    switch (next) {
      case 'dry':
        this.speedMultiplier = 1;
        // Oxygen recovers fully out of water
        this.oxygen = Math.min(this.cfg.oxygenMax, this.oxygen + this.cfg.oxygenRegenPerSec * dt);
        break;

      case 'wading':
        this.speedMultiplier = this.cfg.wadeSpeedMul;
        if (this.isMoving()) {
          this.player.stats.stamina = Math.max(0, this.player.stats.stamina - this.cfg.staminaDrainPerSec * dt);
        }
        this.oxygen = Math.min(this.cfg.oxygenMax, this.oxygen + this.cfg.oxygenRegenPerSec * dt);
        break;

      case 'swimming':
        this.speedMultiplier = this.cfg.swimSpeedMul;
        if (this.isMoving()) {
          this.player.stats.stamina = Math.max(0, this.player.stats.stamina - this.cfg.staminaDrainPerSec * dt);
        }
        // Lerp Y toward "head just above the surface" so player floats.
        {
          const targetY = surfaceY + (this.cfg.eyeOffset * 0.15); // chin clearance
          p.y = THREE.MathUtils.lerp(p.y, targetY, Math.min(1, dt * 6));
        }
        this.oxygen = Math.min(this.cfg.oxygenMax, this.oxygen + this.cfg.oxygenRegenPerSec * dt);
        break;

      case 'submerged':
        this.speedMultiplier = this.cfg.swimSpeedMul * 0.85;
        this.oxygen = Math.max(0, this.oxygen - this.cfg.oxygenDrainPerSec * dt);
        if (this.oxygen <= 0) {
          this.player.stats.health = Math.max(0, this.player.stats.health - this.cfg.drowningHpPerSec * dt);
        }
        break;
    }

    // Expose flags PlayerController can short-circuit on (jump, sprint).
    const swimmingNow = next === 'swimming' || next === 'submerged';
    (this.player as unknown as { isSwimming: boolean }).isSwimming   = swimmingNow;
    (this.player as unknown as { isSubmerged: boolean }).isSubmerged = next === 'submerged';
    // Drive the locomotion blend tree's swim mode so Swim_Idle_Loop /
    // Swim_Fwd_Loop replace Idle/Walk/Run while in water. Wading still
    // uses ground locomotion (just slower) — only true swimming swaps the
    // clip set, matching the visual where the body is fully off the floor.
    if (this.player.locomotion) {
      this.player.locomotion.isSwimming = swimmingNow;
    }

    this.prevState = next;
    this.state     = next;
    this.prevY     = p.y;
  }

  /** UI/HUD: 0..1 oxygen fraction. */
  oxygenFraction(): number {
    return this.cfg.oxygenMax === 0 ? 1 : this.oxygen / this.cfg.oxygenMax;
  }

  private isMoving(): boolean {
    const k = this.player.keys;
    return !!(k['KeyW'] || k['KeyA'] || k['KeyS'] || k['KeyD']);
  }
}
