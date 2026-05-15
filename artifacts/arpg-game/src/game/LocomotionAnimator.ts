import * as THREE from 'three';
import { SLIDE_TRANSITIONS } from './AnimationRegistry';

/**
 * Directional locomotion blend tree for the player.
 *
 * Holds long-running AnimationActions for every locomotion clip
 * (Idle / Walk / Run / StrafeLeft / StrafeRight / StrafeLeftWalk /
 * StrafeRightWalk / Walk_Carry_Loop) and crossfades their weights every
 * frame based on the current input direction and speed.
 *
 * One-shot clips (Attack, Block, Jump and all Quaternius action clips) are
 * layered on top via `playOneShot` and temporarily mute the locomotion
 * layer until they finish.
 *
 * Slide is managed as a 3-phase state machine:
 *   enterSlide() → SLIDE_START (once) → SLIDE_LOOP (held) → exitSlide() → SLIDE_EXIT (once)
 *
 * Weight blending is exponential smoothing — frame-rate independent and
 * snappy without being twitchy.
 */

export type SlideState = 'none' | 'entering' | 'looping' | 'exiting';

export class LocomotionAnimator {
  private mixer: THREE.AnimationMixer;
  private actions = new Map<string, THREE.AnimationAction>();
  private targetWeights = new Map<string, number>();
  private currentWeights = new Map<string, number>();

  /** Names of clips that participate in the locomotion blend. */
  private readonly LOCO = [
    'Idle',
    'Walk',
    'Run',
    'Sprint',
    'StrafeLeft',
    'StrafeRight',
    'StrafeLeftWalk',
    'StrafeRightWalk',
    'Walk_Carry_Loop',
    'Swim_Idle_Loop',
    'Swim_Fwd_Loop',
    'Crouch_Idle_Loop',
    'Crouch_Fwd_Loop',
  ];

  private oneShotAction: THREE.AnimationAction | null = null;
  private oneShotName: string | null = null;
  private oneShotEndTime = 0;

  /** Whether Walk_Carry_Loop should replace Walk in the blend. */
  isCarrying = false;
  /** Driven by SwimController — when true, Swim_*_Loop replace Walk/Run/Idle. */
  isSwimming = false;
  /** Driven by PlayerController crouch state — when true, Crouch_*_Loop replace Walk/Idle. */
  isCrouching = false;

  /** Slide state machine. */
  private slideState: SlideState = 'none';
  private slideLoopAction: THREE.AnimationAction | null = null;
  private slideTransitionEndTime = 0;

  constructor(mixer: THREE.AnimationMixer, clips: THREE.AnimationClip[]) {
    this.mixer = mixer;

    for (const name of this.LOCO) {
      const clip = THREE.AnimationClip.findByName(clips, name);
      if (!clip) continue;
      const action = mixer.clipAction(clip);
      action.setLoop(THREE.LoopRepeat, Infinity);
      action.weight = name === 'Idle' ? 1 : 0;
      action.play();
      this.actions.set(name, action);
      this.targetWeights.set(name, name === 'Idle' ? 1 : 0);
      this.currentWeights.set(name, name === 'Idle' ? 1 : 0);
    }
  }

  /**
   * Set the desired locomotion state for this frame.
   *
   * @param forward  -1 (back) → 1 (forward), in input space
   * @param strafe   -1 (left) → 1 (right), in input space
   * @param speed01  0 = stationary, 0.5 = walking, 1.0 = running
   */
  setMovement(forward: number, strafe: number, speed01: number) {
    const inputMag = Math.hypot(forward, strafe);

    // Pick the active "idle" / "forward" / "strafe" clip set based on which
    // mutually-exclusive locomotion mode the player is in. Swim wins over
    // crouch wins over carry wins over default.
    const idleClip =
      this.isSwimming  ? 'Swim_Idle_Loop'   :
      this.isCrouching ? 'Crouch_Idle_Loop' :
      'Idle';
    const fwdClip =
      this.isSwimming  ? 'Swim_Fwd_Loop'    :
      this.isCrouching ? 'Crouch_Fwd_Loop'  :
      this.isCarrying  ? 'Walk_Carry_Loop'  :
      null; // null = use Walk/Run blend below

    if (inputMag < 0.05 || speed01 < 0.05) {
      // Idle
      this.setTarget(idleClip, 1);
      for (const name of this.LOCO) if (name !== idleClip) this.setTarget(name, 0);
      return;
    }

    // Compute fwd/strafe weights so they sum to inputMag (each direction
    // contributes proportionally to the input vector).
    const fwdAbs = Math.abs(forward);
    const strafeAbs = Math.abs(strafe);
    const total = fwdAbs + strafeAbs || 1;
    const fwdWeight = fwdAbs / total;     // 0..1
    const strafeWeight = strafeAbs / total;

    // Walk vs Run blend by speed (0.5 = walk, 1.0 = run).
    const runMix = THREE.MathUtils.clamp((speed01 - 0.5) / 0.5, 0, 1);
    const walkMix = 1 - runMix;

    // Forward / backward — we don't have a back clip, so play Walk reversed
    // by setting timeScale negative when forward < 0.
    const walkAction = this.actions.get('Walk');
    const carryAction = this.actions.get('WALK_CARRY');
    const runAction = this.actions.get('Run');
    if (walkAction) walkAction.timeScale = forward >= 0 ? 1 : -1;
    if (carryAction) carryAction.timeScale = forward >= 0 ? 1 : -1;
    if (runAction) runAction.timeScale = forward >= 0 ? 1 : -1;

    // When swim/crouch/carry mode is active, the chosen clip replaces the
    // Walk/Run blend entirely. Otherwise crossfade Walk ↔ Run by speed.
    if (fwdClip) {
      this.setTarget(fwdClip, fwdWeight);
      this.setTarget('Walk', 0);
      this.setTarget('Run', 0);
      this.setTarget('Sprint', 0);
    } else {
      // speed01: 0.5 = walk, 1.0 = run, >1.0 routes Run→Sprint.
      const sprintMix = THREE.MathUtils.clamp((speed01 - 1.0) / 0.4, 0, 1);
      const runMixAdj = runMix * (1 - sprintMix);
      this.setTarget('Walk',   fwdWeight * walkMix);
      this.setTarget('Run',    fwdWeight * runMixAdj);
      this.setTarget('Sprint', fwdWeight * sprintMix);
      this.setTarget('Walk_Carry_Loop',  0);
      this.setTarget('Swim_Fwd_Loop',    0);
      this.setTarget('Crouch_Fwd_Loop',  0);
    }

    // Strafe — pick left/right based on sign.
    const strafeBase = strafe < 0 ? 'StrafeLeft' : 'StrafeRight';
    const strafeWalk = strafe < 0 ? 'StrafeLeftWalk' : 'StrafeRightWalk';
    const strafeOpposite = strafe < 0 ? 'StrafeRight' : 'StrafeLeft';
    const strafeWalkOpp = strafe < 0 ? 'StrafeRightWalk' : 'StrafeLeftWalk';

    this.setTarget(strafeWalk, strafeWeight * walkMix);
    this.setTarget(strafeBase, strafeWeight * runMix);
    this.setTarget(strafeOpposite, 0);
    this.setTarget(strafeWalkOpp, 0);

    // Idle fades out while moving.
    this.setTarget('Idle', 0);
  }

  /** Play a one-shot animation (Attack/Block/Jump) above the loco layer. */
  playOneShot(name: string, clips: THREE.AnimationClip[], duration: number) {
    const clip = THREE.AnimationClip.findByName(clips, name);
    if (!clip) return;
    const action = this.mixer.clipAction(clip);
    action.reset();
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    action.fadeIn(0.08).play();
    if (this.oneShotAction && this.oneShotAction !== action) {
      this.oneShotAction.fadeOut(0.1);
    }
    this.oneShotAction = action;
    this.oneShotName = name;
    this.oneShotEndTime = performance.now() + duration * 1000;
  }

  /**
   * Sync a newly-activating clip's playhead to match the phase of the
   * clip it's blending from. This prevents the "foot teleport" artifact
   * when crossfading Walk↔Run — the foot that's forward stays forward.
   *
   * Sketchbook technique: current.time = old.time × (current.duration / old.duration)
   */
  private syncPhase(fromName: string, toName: string) {
    const from = this.actions.get(fromName);
    const to = this.actions.get(toName);
    if (!from || !to) return;
    const fromClip = from.getClip();
    const toClip = to.getClip();
    if (fromClip.duration <= 0 || toClip.duration <= 0) return;
    // Map phase (0..1) from the source clip onto the destination
    to.time = from.time * (toClip.duration / fromClip.duration);
  }

  /** Track which loco clip had the highest weight last frame for phase sync. */
  private prevDominant: string = 'Idle';

  /** Tick weight smoothing every frame. Call after `setMovement`. */
  update(dt: number) {
    this.tickSlideExit();

    // Smooth each locomotion weight toward its target.
    const k = 14;
    const t = 1 - Math.exp(-k * dt);

    // While a one-shot is active, mute locomotion layer.
    const oneShotActive = this.oneShotAction != null && performance.now() < this.oneShotEndTime;
    const damp = oneShotActive ? 0.0 : 1.0;

    // Find new dominant clip (highest target weight) for phase sync
    let newDominant = 'Idle';
    let maxTarget = -1;
    for (const name of this.LOCO) {
      const tw = this.targetWeights.get(name) ?? 0;
      if (tw > maxTarget) { maxTarget = tw; newDominant = name; }
    }

    // Phase-sync when the dominant clip changes (e.g. Walk→Run)
    // Skip Idle transitions — those don't need phase matching
    if (newDominant !== this.prevDominant
        && newDominant !== 'Idle'
        && this.prevDominant !== 'Idle') {
      this.syncPhase(this.prevDominant, newDominant);
    }
    this.prevDominant = newDominant;

    for (const name of this.LOCO) {
      const action = this.actions.get(name);
      if (!action) continue;
      const target = (this.targetWeights.get(name) ?? 0) * damp;
      const current = THREE.MathUtils.lerp(this.currentWeights.get(name) ?? 0, target, t);
      this.currentWeights.set(name, current);
      action.weight = current;
    }

    if (oneShotActive && this.oneShotAction) {
      this.oneShotAction.weight = 1;
    } else if (this.oneShotAction) {
      this.oneShotAction.fadeOut(0.15);
      this.oneShotAction = null;
      this.oneShotName = null;
    }
  }

  // ── Slide state machine ─────────────────────────────────────────────────

  /** Call once when the player enters a slide (sprint + crouch). */
  enterSlide(clips: THREE.AnimationClip[]) {
    if (this.slideState !== 'none') return;
    this.slideState = 'entering';
    this.playOneShot(SLIDE_TRANSITIONS.enter, clips, 0.30);
    this.slideTransitionEndTime = performance.now() + 300;
  }

  /**
   * Call every frame while slide is held.
   * Transitions automatically from entering → looping.
   */
  tickSlide(clips: THREE.AnimationClip[]) {
    if (this.slideState === 'none' || this.slideState === 'exiting') return;
    const now = performance.now();
    if (this.slideState === 'entering' && now >= this.slideTransitionEndTime) {
      this.slideState = 'looping';
      const clip = THREE.AnimationClip.findByName(clips, SLIDE_TRANSITIONS.loop);
      if (clip) {
        const action = this.mixer.clipAction(clip);
        action.reset().setLoop(THREE.LoopRepeat, Infinity).fadeIn(0.08).play();
        this.slideLoopAction = action;
      }
    }
  }

  /** Call once when slide is released or speed drops below threshold. */
  exitSlide(clips: THREE.AnimationClip[]) {
    if (this.slideState === 'none') return;
    if (this.slideLoopAction) {
      this.slideLoopAction.fadeOut(0.1);
      this.slideLoopAction = null;
    }
    this.slideState = 'exiting';
    this.playOneShot(SLIDE_TRANSITIONS.exit, clips, 0.38);
    this.slideTransitionEndTime = performance.now() + 380;
  }

  /** Returns true while the player is in any slide phase. */
  get isSliding(): boolean {
    return this.slideState !== 'none';
  }

  /**
   * Poll this every frame in `update()` to clear the exiting state once the
   * exit animation finishes. Called automatically inside update().
   */
  private tickSlideExit() {
    if (this.slideState === 'exiting' && performance.now() >= this.slideTransitionEndTime) {
      this.slideState = 'none';
    }
  }

  private setTarget(name: string, weight: number) {
    if (this.actions.has(name)) this.targetWeights.set(name, weight);
  }
}
