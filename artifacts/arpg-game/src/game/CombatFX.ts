import * as THREE from 'three';

/**
 * Global combat feel: hitstop and screen shake.
 *
 * Hitstop pauses gameplay for a few frames on heavy hits to make impacts
 * feel meaty (used by GS/mace/axe). Screen shake jitters the camera to
 * sell weight. Both decay deterministically per second so they're
 * frame-rate independent.
 */
export class CombatFX {
  private hitStopRemaining = 0;       // seconds left frozen
  private shakePower = 0;             // metres of camera offset
  private shakeRemaining = 0;         // seconds left shaking
  private offset = new THREE.Vector3();

  /** Freeze gameplay for `frames` (assumed 60fps → frames/60 seconds). */
  hitStop(frames: number) {
    const dur = frames / 60;
    if (dur > this.hitStopRemaining) this.hitStopRemaining = dur;
  }

  /** Add a shake. Power is in world metres; duration in seconds. */
  shake(power: number, duration: number = 0.18) {
    if (power > this.shakePower) this.shakePower = power;
    if (duration > this.shakeRemaining) this.shakeRemaining = duration;
  }

  /** True while gameplay should be paused. */
  isFrozen(): boolean {
    return this.hitStopRemaining > 0;
  }

  /** Tick down timers. Always called regardless of frozen state. */
  update(dt: number) {
    if (this.hitStopRemaining > 0) this.hitStopRemaining = Math.max(0, this.hitStopRemaining - dt);
    if (this.shakeRemaining > 0) {
      this.shakeRemaining = Math.max(0, this.shakeRemaining - dt);
      const t = this.shakeRemaining / 0.18; // normalised
      const p = this.shakePower * t;
      this.offset.set(
        (Math.random() - 0.5) * p,
        (Math.random() - 0.5) * p * 0.6,
        (Math.random() - 0.5) * p,
      );
      if (this.shakeRemaining === 0) {
        this.shakePower = 0;
        this.offset.set(0, 0, 0);
      }
    } else {
      this.offset.set(0, 0, 0);
    }
  }

  /** Per-frame camera jitter to add to the rendered camera position. */
  getOffset(): THREE.Vector3 {
    return this.offset;
  }
}
