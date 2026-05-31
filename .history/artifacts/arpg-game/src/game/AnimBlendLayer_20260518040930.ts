/**
 * AdditiveAnimLayer — procedural additive animation layer for player rigs.
 *
 * Runs AFTER the AnimationMixer has ticked (call `lateUpdate` in the same
 * frame as `mixer.update`). Directly manipulates spine/chest bone quaternions
 * to overlay two procedural motions:
 *
 *   1. **Breathing idle** — subtle spine oscillation (~0.45 Hz) that makes
 *      a standing character look alive. Amplitude is attenuated when the
 *      character is moving so it doesn't fight locomotion poses.
 *
 *   2. **Aim pitch** — tilts the upper body up/down based on the camera's
 *      vertical angle so ranged-weapon arms follow the crosshair. Controlled
 *      by `aimBlend` (0 = disabled, 1 = full). Distributed across the found
 *      spine bones so no single joint bends unnaturally far.
 *
 * Bone discovery:
 *   The layer fuzzy-searches the model root for bones whose name includes
 *   'spine', 'chest', 'thorax', or 'torso'.  The first 1-2 matches are used.
 *   If none are found the layer silently no-ops — safe to attach to any rig.
 *   You can override with `setSpineBones([...])` if the auto-detect is wrong.
 *
 * Usage:
 *   const layer = new AdditiveAnimLayer(mixer, playerModel);
 *   // optional: override bone list
 *   // layer.setSpineBones(myFoundBones);
 *
 *   // After mixer.update(dt) every frame:
 *   const isMoving   = playerSpeed > 0.5;
 *   const aimBlend   = activeWeapon.isRanged ? 1.0 : 0.0;
 *   const pitchRad   = -camera.rotation.x;  // negative = look-up maps to +X tilt
 *   layer.lateUpdate(dt, pitchRad, isMoving, aimBlend);
 *
 * Implementation notes:
 *   - Post-multiplies our quaternion onto the bone's quaternion set by the
 *     AnimationMixer, rather than blending with the bind pose. This lets the
 *     locomotion clips remain fully intact while we add on top.
 *   - Uses pre-allocated THREE.Quaternion instances — zero heap allocations
 *     on the hot path.
 */

import * as THREE from 'three';

// ── Scratch quaternions / vectors (zero allocations on hot path) ──────────────
const _qBreath    = new THREE.Quaternion();
const _qAim       = new THREE.Quaternion();
const _qResult    = new THREE.Quaternion();
const _euler      = new THREE.Euler();
const _pitchAxis  = new THREE.Vector3(1, 0, 0); // local X = pitch

// ── Class ─────────────────────────────────────────────────────────────────────

export class AdditiveAnimLayer {
  private readonly _mixer:  THREE.AnimationMixer;
  private _spineBones: THREE.Bone[] = [];
  private _time          = 0;
  private _breathSmooth  = 0;  // exponential smoothing toward target amplitude

  constructor(mixer: THREE.AnimationMixer, root: THREE.Object3D) {
    this._mixer = mixer;
    this._autoFindBones(root);
  }

  // ── Configuration ──────────────────────────────────────────────────────────

  /**
   * Override the automatically discovered spine bones.
   * Provide bones in root→leaf order (spine → chest).
   * Driving more than 2 bones can look exaggerated; 1-2 is recommended.
   */
  setSpineBones(bones: THREE.Bone[]): void {
    this._spineBones = bones;
  }

  // ── Public tick ────────────────────────────────────────────────────────────

  /**
   * Apply breathing and aim-pitch offsets on top of the current mixer pose.
   * Must be called AFTER `mixer.update(dt)` every frame.
   *
   * @param dt          Delta time in seconds.
   * @param pitchRad    Camera vertical angle in radians. Negative values
   *                    typically mean looking up (depends on camera convention).
   *                    Pass 0 to disable aim pitch without changing aimBlend.
   * @param isMoving    True when the character has significant horizontal speed.
   *                    Dampens breathing amplitude so it doesn't fight run cycles.
   * @param aimBlend    0–1 blend weight for the aim-pitch offset. Set to 1.0
   *                    when a ranged weapon is active, 0.0 for melee/unarmed.
   */
  lateUpdate(
    dt:       number,
    pitchRad: number,
    isMoving: boolean,
    aimBlend: number = 0,
  ): void {
    if (this._spineBones.length === 0) return;

    this._time += dt;

    // Breathing amplitude: 30% of full when moving, 100% when idle
    const targetBreath = isMoving ? 0.3 : 1.0;
    this._breathSmooth += (targetBreath - this._breathSmooth) * Math.min(1, dt * 4);

    const boneCount    = this._spineBones.length;
    // Pitch is distributed evenly so no single bone twists harshly
    const pitchPerBone = (pitchRad * THREE.MathUtils.clamp(aimBlend, 0, 1)) / boneCount;
    // ~0.012 rad (~0.7°) of breathing sway at full amplitude
    const breathAmp    = 0.012 * this._breathSmooth;
    const breathPhase  = this._time * 0.45 * Math.PI * 2; // 0.45 Hz

    for (let i = 0; i < boneCount; i++) {
      const bone     = this._spineBones[i]!;
      const breathOff = Math.sin(breathPhase) * breathAmp;

      // Breathing: tiny rock around local X
      _euler.set(breathOff, 0, 0, 'XYZ');
      _qBreath.setFromEuler(_euler);

      // Aim pitch: rotation around local X proportional to camera pitch
      _qAim.setFromAxisAngle(_pitchAxis, pitchPerBone);

      // Post-multiply on top of the mixer's bone result
      // (bone.quaternion was written by the AnimationMixer; we add our offset)
      _qResult.multiplyQuaternions(bone.quaternion, _qBreath).multiply(_qAim);
      bone.quaternion.copy(_qResult);
    }
  }

  // ── Utility ────────────────────────────────────────────────────────────────

  /** Reset accumulator state (call on player respawn / scene reload). */
  reset(): void {
    this._time         = 0;
    this._breathSmooth = 0;
  }

  /** Returns true if at least one spine bone was found. */
  get isActive(): boolean {
    return this._spineBones.length > 0;
  }

  // ── Private ────────────────────────────────────────────────────────────────

  /**
   * Walk the model root and collect the first 1-2 bones whose name fuzzy-
   * matches common spine/chest naming conventions across major exporters:
   *   Mixamo:   Spine, Spine1, Spine2
   *   Blender:  spine, spine.001, chest
   *   Unreal:   spine_01, spine_02, clavicle_spine
   */
  private _autoFindBones(root: THREE.Object3D): void {
    const candidates: THREE.Bone[] = [];
    root.traverse((child) => {
      if (!(child instanceof THREE.Bone)) return;
      const n = child.name.toLowerCase();
      if (
        n.includes('spine')   ||
        n.includes('chest')   ||
        n.includes('thorax')  ||
        n.includes('torso')
      ) {
        candidates.push(child);
      }
    });
    // Limit to first 2 — more causes exaggerated bending
    this._spineBones = candidates.slice(0, 2);
  }
}
