import * as THREE from 'three';
import { SLIDE_TRANSITIONS, IDLE_OVERRIDE_CLIP } from './AnimationRegistry';

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

  // ── Weapon stance override ──────────────────────────────────────────────
  /**
   * When non-null, the equipped weapon type drives which Idle/Walk/Run clips
   * play. For example, a rifle swaps Idle→Rifle_Idle_Loop, Walk→Rifle_Walk_Fwd,
   * Run→Rifle_Run_Fwd so the character holds the gun during locomotion.
   */
  private stanceWeapon: string | null = null;
  private stanceIdleClip: string | null = null;
  private stanceWalkClip: string | null = null;
  private stanceRunClip: string | null = null;
  /** All clips from the source model — kept for lazy action init. */
  private allClips: THREE.AnimationClip[];

  /** Slide state machine. */
  private slideState: SlideState = 'none';
  private slideLoopAction: THREE.AnimationAction | null = null;
  private slideTransitionEndTime = 0;

  constructor(mixer: THREE.AnimationMixer, clips: THREE.AnimationClip[]) {
    this.mixer = mixer;
    this.allClips = clips;

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

  // ── Weapon stance API ──────────────────────────────────────────────────

  /**
   * Set the weapon type driving locomotion stance. Pass null to reset to
   * default unarmed animations. Called by PlayerController on weapon swap.
   *
   * The override replaces Idle and optionally Walk/Run with weapon-specific
   * clips from the AnimationRegistry. If the clip doesn't exist in the
   * model's animation set, the default clip is kept.
   */
  setWeaponStance(weaponType: string | null): void {
    if (weaponType === this.stanceWeapon) return;
    this.stanceWeapon = weaponType;

    if (!weaponType) {
      this.stanceIdleClip = null;
      this.stanceWalkClip = null;
      this.stanceRunClip = null;
      return;
    }

    // Idle override from AnimationRegistry
    const idleOverride = IDLE_OVERRIDE_CLIP[weaponType];
    this.stanceIdleClip = idleOverride && this.ensureAction(idleOverride) ? idleOverride : null;

    // Walk/Run overrides — only rifle-class weapons have dedicated locomotion
    const RIFLE_TYPES = new Set(['rifle', 'shotgun', 'smg', 'crossbow']);
    if (RIFLE_TYPES.has(weaponType)) {
      this.stanceWalkClip = this.ensureAction('Rifle_Walk_Fwd') ? 'Rifle_Walk_Fwd' : null;
      this.stanceRunClip  = this.ensureAction('Rifle_Run_Fwd')  ? 'Rifle_Run_Fwd'  : null;
    } else {
      this.stanceWalkClip = null;
      this.stanceRunClip = null;
    }
  }

  /**
   * Lazy-init an AnimationAction for a clip not in the original LOCO set.
   * Returns true if the clip exists and an action was created.
   */
  private ensureAction(clipName: string): boolean {
    if (this.actions.has(clipName)) return true;
    const clip = THREE.AnimationClip.findByName(this.allClips, clipName);
    if (!clip) return false;
    const action = this.mixer.clipAction(clip);
    action.setLoop(THREE.LoopRepeat, Infinity);
    action.weight = 0;
    action.play();
    this.actions.set(clipName, action);
    this.targetWeights.set(clipName, 0);
    this.currentWeights.set(clipName, 0);
    return true;
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

    // Weapon-stance overrides for Idle/Walk/Run
    const stanceIdle = this.stanceIdleClip ?? idleClip;
    const stanceWalk = this.stanceWalkClip ?? 'Walk';
    const stanceRun  = this.stanceRunClip  ?? 'Run';

    if (inputMag < 0.05 || speed01 < 0.05) {
      // Idle — use weapon-stance idle if set
      this.setTarget(stanceIdle, 1);
      // Zero everything else (including the default Idle if stance overrides it)
      for (const name of this.actions.keys()) {
        if (name !== stanceIdle) this.setTarget(name, 0);
      }
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
    // Walk/Run blend entirely. Otherwise crossfade Walk ↔ Run by speed,
    // using weapon-stance overrides when available.
    if (fwdClip) {
      this.setTarget(fwdClip, fwdWeight);
      this.setTarget('Walk', 0);
      this.setTarget(stanceWalk, 0);
      this.setTarget('Run', 0);
      this.setTarget(stanceRun, 0);
      this.setTarget('Sprint', 0);
    } else {
      // speed01: 0.5 = walk, 1.0 = run, >1.0 routes Run→Sprint.
      const sprintMix = THREE.MathUtils.clamp((speed01 - 1.0) / 0.4, 0, 1);
      const runMixAdj = runMix * (1 - sprintMix);
      this.setTarget(stanceWalk, fwdWeight * walkMix);
      this.setTarget(stanceRun,  fwdWeight * runMixAdj);
      this.setTarget('Sprint',   fwdWeight * sprintMix);
      // Zero out clips we're NOT using (default Walk/Run when stance overrides them)
      if (stanceWalk !== 'Walk') this.setTarget('Walk', 0);
      if (stanceRun  !== 'Run')  this.setTarget('Run', 0);
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

    // Idle fades out while moving (including stance idle).
    this.setTarget(stanceIdle, 0);
    if (stanceIdle !== 'Idle') this.setTarget('Idle', 0);
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
    for (const name of this.actions.keys()) {
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

    for (const [name, action] of this.actions) {
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

    this.updateAimLayer(dt);
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

  // ── Root motion extraction ────────────────────────────────────────────
  //
  // For clips whose names end with '_RM', the root bone's position delta is
  // extracted each frame and made available via getRootMotionDelta().
  // PlayerController zeroes lungeVelocity and instead applies the delta to
  // the Rapier character controller while an RM clip is the active one-shot.
  //
  // The root bone is discovered lazily the first time an _RM clip plays.
  // We capture the world position *before* mixer.update() (done externally in
  // PlayerController) and diff it *after*. To keep the API simple we instead
  // read the bone before and after the one-shot action time advances inside
  // LocomotionAnimator.update() — we can't do that without the bone ref.
  //
  // Practical approach: PlayerController calls captureRootPos() before
  // mixer.update(), then reads getRootMotionDelta() after — zero if no RM
  // clip is active, otherwise (newPos - capturedPos) rotated into world space.

  private rootBone: THREE.Bone | null = null;
  private rootPosCapture = new THREE.Vector3();
  private rootMotionDelta = new THREE.Vector3();
  private _rmActive = false;

  /**
   * Provide a reference to the skeleton's root (hip) bone so root motion can
   * be extracted. Called by PlayerController after the model loads.
   */
  setRootBone(bone: THREE.Bone): void {
    this.rootBone = bone;
  }

  /** Returns true if the currently playing one-shot is an _RM clip. */
  get isRootMotionActive(): boolean {
    return this._rmActive;
  }

  /**
   * Call BEFORE mixer.update() each frame to snapshot the root bone position.
   * Must be called even when no RM clip is active (no-op in that case).
   */
  captureRootPos(): void {
    this._rmActive = !!(
      this.rootBone &&
      this.oneShotName?.endsWith('_RM') &&
      this.oneShotAction &&
      performance.now() < this.oneShotEndTime
    );
    if (this._rmActive && this.rootBone) {
      this.rootBone.getWorldPosition(this.rootPosCapture);
    }
  }

  /**
   * Call AFTER mixer.update() to compute the root bone displacement this
   * frame. Returns the world-space delta (x/z only — y is discarded to avoid
   * fighting gravity).
   */
  computeRootMotionDelta(): THREE.Vector3 {
    this.rootMotionDelta.set(0, 0, 0);
    if (!this._rmActive || !this.rootBone) return this.rootMotionDelta;
    const after = this.rootBone.getWorldPosition(new THREE.Vector3());
    this.rootMotionDelta.x = after.x - this.rootPosCapture.x;
    this.rootMotionDelta.z = after.z - this.rootPosCapture.z;
    return this.rootMotionDelta;
  }

  // ── Additive aim layer ────────────────────────────────────────────────
  //
  // An additive layer runs on the same AnimationMixer but uses
  // AdditiveAnimationBlendMode so it composites on top of locomotion without
  // replacing it. We maintain three aim actions per weapon class
  // (Up / Neutral / Down) and crossfade between them based on pitch.
  // The entire layer is faded in/out by setAimActive().
  //
  // We use a *single* normalised weight across the three clips so that
  // pitch blending is just lerping between them; the layer weight governs
  // overall visibility.

  /** Currently active aim weapon type ('pistol' | 'rifle' | null). */
  private aimWeaponType: string | null = null;
  /** Blended weight of the whole aim layer (0 = off, 1 = full). */
  private aimLayerWeight = 0;
  /** Target for aimLayerWeight. */
  private aimLayerTarget = 0;
  /** Pitch blend position: -1 = aim down, 0 = neutral, 1 = aim up. */
  private aimPitch = 0;

  /** Suffix → additive action */
  private aimActions: Map<string, THREE.AnimationAction> = new Map();

  /** Aim clip names for each weapon class. */
  private static readonly AIM_SETS: Record<string, [string, string, string]> = {
    pistol: ['Pistol_Aim_Down', 'Pistol_Aim_Neutral', 'Pistol_Aim_Up'],
    gun:    ['Pistol_Aim_Down', 'Pistol_Aim_Neutral', 'Pistol_Aim_Up'],
    rifle:  ['Rifle_Aim_Down',  'Rifle_Aim_Neutral',  'Rifle_Aim_Up'],
    shotgun:['Rifle_Aim_Down',  'Rifle_Aim_Neutral',  'Rifle_Aim_Up'],
    smg:    ['Rifle_Aim_Down',  'Rifle_Aim_Neutral',  'Rifle_Aim_Up'],
  };

  /**
   * Initialise or swap the aim clip set for the given weapon type.
   * Called by PlayerController on weapon equip / startAiming.
   */
  setAimWeapon(weaponType: string): void {
    const key = LocomotionAnimator.AIM_SETS[weaponType] ? weaponType : null;
    if (key === this.aimWeaponType) return;
    // Fade out old aim actions.
    for (const action of this.aimActions.values()) {
      action.fadeOut(0.12);
    }
    this.aimActions.clear();
    this.aimWeaponType = key;
    if (!key) return;
    const clipNames = LocomotionAnimator.AIM_SETS[key];
    for (const name of clipNames) {
      const clip = THREE.AnimationClip.findByName(this.allClips, name);
      if (!clip) continue;
      const action = this.mixer.clipAction(clip);
      action.blendMode = THREE.AdditiveAnimationBlendMode;
      action.setLoop(THREE.LoopRepeat, Infinity);
      action.weight = 0;
      action.play();
      this.aimActions.set(name, action);
    }
  }

  /**
   * Fade the additive aim layer in (active=true) or out (active=false).
   * Call from PlayerController.startAiming / stopAiming.
   */
  setAimActive(active: boolean): void {
    this.aimLayerTarget = active ? 1 : 0;
  }

  /**
   * Set vertical aim pitch so the aim layer blends between Down/Neutral/Up.
   * @param pitch  -1 = fully looking down, 0 = level, 1 = fully looking up.
   */
  setAimPitch(pitch: number): void {
    this.aimPitch = Math.max(-1, Math.min(1, pitch));
  }

  /** Called inside update() to tick additive aim weights. */
  private updateAimLayer(dt: number): void {
    if (this.aimActions.size === 0) return;
    const k = 10;
    const t = 1 - Math.exp(-k * dt);
    this.aimLayerWeight = THREE.MathUtils.lerp(this.aimLayerWeight, this.aimLayerTarget, t);

    const key = this.aimWeaponType;
    if (!key) return;
    const [downName, neutralName, upName] = LocomotionAnimator.AIM_SETS[key];

    // Pitch: -1→down, 0→neutral, 1→up.
    // We allocate weight across the three clips so total = aimLayerWeight.
    const pitch = this.aimPitch;
    let downW = 0, neutralW = 0, upW = 0;
    if (pitch <= 0) {
      // Blend neutral ↔ down
      downW    = this.aimLayerWeight * (-pitch);
      neutralW = this.aimLayerWeight * (1 + pitch);
    } else {
      // Blend neutral ↔ up
      neutralW = this.aimLayerWeight * (1 - pitch);
      upW      = this.aimLayerWeight * pitch;
    }

    const setW = (name: string, w: number) => {
      const a = this.aimActions.get(name);
      if (a) a.weight = w;
    };
    setW(downName,    downW);
    setW(neutralName, neutralW);
    setW(upName,      upW);
  }
}
