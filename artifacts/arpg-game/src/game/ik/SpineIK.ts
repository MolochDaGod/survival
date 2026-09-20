/**
 * SpineIK — post-mixer upper-body aim for FPS/TPS gunplay.
 *
 * Ported / hardened from the shared FPS spine-aim recipe:
 *   - Module-level scratch quats/vecs (zero GC on the hot path)
 *   - Save "clean" mixer pose → restore next frame before mixer → re-apply IK after mixer
 *   - 1P: distribute pitch across spine bones (arms/camera follow mouse)
 *   - 3P: pitch + slight yaw bias toward screen center + optional camera visual offset
 *   - clearHeadRoll: strip head world-roll so FP camera parent doesn't lean with clips
 *
 * Frame order (CRITICAL — same as AdditiveAnimLayer lateUpdate contract):
 *
 *   1. spineIK.restoreBones()     // undo last frame's IK so mixer blends cleanly
 *   2. locomotion / mixer.update  // pure animation pose
 *   3. spineIK.applyAim1P / 3P    // post-multiply aim on spine
 *   4. (optional) AdditiveAnimLayer.lateUpdate for breath — or fold breath into this class
 *
 * Do NOT mutate bone quats between restore and mixer, or double-apply IK without restore.
 *
 * vs AdditiveAnimLayer (AnimBlendLayer.ts):
 *   AdditiveAnimLayer  — simple local-X pitch + breath, post-multiply, no restore buffer
 *   SpineIK            — camera-axis pitch, parent-space conjugation, restore buffer, 1P head roll
 * Prefer SpineIK for gun-engaged FP/TP ADS; keep AdditiveAnimLayer for light ARPG aim/breath.
 *
 * @see docs/FLEET_ARPG_STACK.md — three.js reliability / zero-alloc tick
 */

import { Euler, Quaternion, Vector3, type Bone, type Camera, type Object3D, MathUtils } from "three";

// ── Scratch (module-level — never allocate in apply*) ─────────────────────────
const _aimQ = new Quaternion();
const _yawQ = new Quaternion();
const _localPitchQ = new Quaternion();
const _parentWorldQ = new Quaternion();
const _cameraWorldQ = new Quaternion();
const _aimAxis = new Vector3(1, 0, 0);
const _yawAxis = new Vector3(0, 1, 0);

const _headWorldQ = new Quaternion();
const _headParentWorldQ = new Quaternion();
const _headEuler = new Euler();

/** Soft clamp for 3P pitch normalization (matches ~50° gun pitch window). */
const DEFAULT_PITCH_SOFT_LIMIT = Math.PI * (50 / 180);

export type SpineIKOptions = {
  /** Max |camera.rotation.x| used to normalize pitch curves in 3P. Default ~50°. */
  pitchSoftLimit?: number;
  /** Extra camera pitch when looking down (gun engaged 3P). Default 0.35 */
  downCamBias?: number;
  /** Extra camera pitch when looking up (gun engaged 3P). Default 0.1 */
  upCamBias?: number;
  /** Base body yaw bias toward screen center (radians scale via degrees). Default 10° */
  yawBiasDeg?: number;
  /** When true, applyAim3P mutates camera.rotation.x for visual compensation. Default true */
  mutateCameraPitch?: boolean;
};

/**
 * Procedural spine aim IK. Holds bone refs + per-bone base quats from the last
 * clean mixer pose.
 */
export class SpineIK {
  readonly spineBones: Bone[];
  readonly headBone: Bone | null;

  /** Clean animation pose captured just before IK was applied (per spine bone). */
  private readonly baseQuats: Quaternion[];

  private readonly pitchSoftLimit: number;
  private readonly downCamBias: number;
  private readonly upCamBias: number;
  private readonly yawBiasDeg: number;
  private readonly mutateCameraPitch: boolean;

  /** True after at least one successful apply* that wrote baseQuats. */
  private hasBase = false;

  /**
   * @param spineBones  Spine chain root→leaf (e.g. Spine, Spine1, Spine2). 2–3 is ideal.
   * @param headBone    Optional head for FP roll strip (camera often parented under head/neck).
   */
  constructor(spineBones: Bone[], headBone: Bone | null = null, opts: SpineIKOptions = {}) {
    this.spineBones = spineBones;
    this.headBone = headBone;
    this.baseQuats = spineBones.map((b) => b.quaternion.clone());
    this.pitchSoftLimit = opts.pitchSoftLimit ?? DEFAULT_PITCH_SOFT_LIMIT;
    this.downCamBias = opts.downCamBias ?? 0.35;
    this.upCamBias = opts.upCamBias ?? 0.1;
    this.yawBiasDeg = opts.yawBiasDeg ?? 10;
    this.mutateCameraPitch = opts.mutateCameraPitch !== false;
    this.hasBase = spineBones.length > 0;
  }

  get isActive(): boolean {
    return this.spineBones.length > 0;
  }

  // ── Auto-discover (Mixamo / Bip001 / Unreal-ish names) ─────────────────────

  /**
   * Walk a model root and build SpineIK from common spine/head names.
   * Returns null if no spine bones found (safe no-op for wrong rigs).
   */
  static fromModel(root: Object3D, opts?: SpineIKOptions): SpineIK | null {
    const spines: Bone[] = [];
    let head: Bone | null = null;

    root.traverse((o) => {
      if (!(o as Bone).isBone) return;
      const b = o as Bone;
      const n = b.name.toLowerCase().replace(/[\s_\-.:]/g, "");
      // Prefer explicit spine chain; avoid "spine" false positives on accessories
      if (
        n.includes("spine") ||
        n === "chest" ||
        n.includes("thorax") ||
        (n.includes("torso") && !n.includes("cloth"))
      ) {
        spines.push(b);
      }
      if (
        !head &&
        (n === "head" ||
          n.endsWith("head") ||
          n.includes("mixamorighead") ||
          n.includes("bip001head"))
      ) {
        // Prefer exact head over head_end / headTop
        if (!n.includes("end") && !n.includes("top") && !n.includes("nub")) {
          head = b;
        }
      }
    });

    // Root→leaf: shorter hierarchy depth first often wrong; sort by name index if Mixamo
    spines.sort((a, b) => spineSortKey(a.name) - spineSortKey(b.name));
    // Cap chain — 4+ bones over-bends most game rigs
    const chain = spines.slice(0, 3);
    if (!chain.length) return null;
    return new SpineIK(chain, head, opts);
  }

  // ── Save / restore ─────────────────────────────────────────────────────────

  /**
   * Restore spine bones to the last clean mixer pose.
   * Call **before** player/mixer update so IK residue does not poison clip blending.
   */
  restoreBones(): void {
    if (!this.hasBase) return;
    for (let i = 0; i < this.spineBones.length; i++) {
      this.spineBones[i]!.quaternion.copy(this.baseQuats[i]!);
    }
  }

  /**
   * Strip head world-space roll (Z in YXZ). Keeps yaw/pitch so FP camera
   * parented under head does not lean with run/hit clips.
   */
  clearHeadRoll(): void {
    const head = this.headBone;
    if (!head?.parent) return;

    head.updateWorldMatrix(true, false);
    head.getWorldQuaternion(_headWorldQ);
    _headEuler.setFromQuaternion(_headWorldQ, "YXZ");
    _headEuler.z = 0;
    _headWorldQ.setFromEuler(_headEuler);
    head.parent.getWorldQuaternion(_headParentWorldQ);
    // local = inv(parentWorld) * world
    head.quaternion.copy(_headParentWorldQ).invert().multiply(_headWorldQ);
    head.updateWorldMatrix(false, false);
  }

  // ── Apply ──────────────────────────────────────────────────────────────────

  /**
   * First-person spine pitch IK.
   * @param camera       Active play camera (world quat used for pitch axis)
   * @param pitchTarget  Total pitch to distribute across the spine (radians)
   */
  applyAim1P(camera: Camera, pitchTarget: number): void {
    if (!this.spineBones.length) return;

    this.clearHeadRoll();

    camera.getWorldQuaternion(_cameraWorldQ);
    _aimAxis.set(1, 0, 0).applyQuaternion(_cameraWorldQ);
    const n = this.spineBones.length;
    _aimQ.setFromAxisAngle(_aimAxis, pitchTarget / n);

    const rootParent = this.spineBones[0]!.parent;
    if (rootParent) rootParent.updateWorldMatrix(true, false);

    for (let i = 0; i < n; i++) {
      const bone = this.spineBones[i]!;
      this.baseQuats[i]!.copy(bone.quaternion);

      if (!bone.parent) continue;
      bone.parent.getWorldQuaternion(_parentWorldQ);
      // Conjugate world pitch into parent local space, then premultiply
      _localPitchQ.copy(_parentWorldQ).invert().multiply(_aimQ).multiply(_parentWorldQ);
      bone.quaternion.premultiply(_localPitchQ);
      bone.updateWorldMatrix(false, false);
    }

    // Propagate to head / camera sockets under the chain tip
    this.spineBones[n - 1]!.updateWorldMatrix(false, true);
    this.hasBase = true;
  }

  /**
   * Third-person spine pitch + yaw bias while gun-engaged.
   * Optionally nudges camera.rotation.x for a more natural ADS feel.
   *
   * @param camera         Orbit / TPS camera (uses **world** quaternion for pitch axis)
   * @param isGunEngaged   When false, IK targets zero (spine returns via restore + mixer)
   * @param pitchOverride  Optional total pitch (rad). Default: camera.rotation.x when engaged
   */
  applyAim3P(
    camera: Camera,
    isGunEngaged: boolean,
    pitchOverride?: number,
  ): void {
    if (!this.spineBones.length) return;

    const soft = Math.max(1e-4, this.pitchSoftLimit);
    const camPitch = camera.rotation.x;
    const normalizedPitch = MathUtils.clamp(camPitch / soft, -1, 1);
    const pitchSq = normalizedPitch * normalizedPitch; // abs^2 without Math.pow

    const pitchTarget = isGunEngaged
      ? pitchOverride !== undefined
        ? pitchOverride
        : camPitch
      : 0;

    if (this.mutateCameraPitch && isGunEngaged) {
      // Look down: lift view slightly; look up: press slightly
      camera.rotation.x +=
        normalizedPitch > 0 ? pitchSq * this.downCamBias : -pitchSq * this.upCamBias;
    }

    // Yaw bias toward screen center (stronger when looking down)
    const yawTarget = isGunEngaged
      ? -Math.PI * ((this.yawBiasDeg * (1 + pitchSq * this.downCamBias)) / 180)
      : 0;

    // World camera orientation — more stable than local .quaternion when nested
    camera.getWorldQuaternion(_cameraWorldQ);
    _aimAxis.set(1, 0, 0).applyQuaternion(_cameraWorldQ);
    const n = this.spineBones.length;
    _aimQ.setFromAxisAngle(_aimAxis, pitchTarget / n);
    _yawQ.setFromAxisAngle(_yawAxis, yawTarget);
    _aimQ.premultiply(_yawQ);

    const rootParent = this.spineBones[0]!.parent;
    if (rootParent) rootParent.updateWorldMatrix(true, false);

    for (let i = 0; i < n; i++) {
      const bone = this.spineBones[i]!;
      this.baseQuats[i]!.copy(bone.quaternion);

      if (!bone.parent) continue;
      bone.parent.getWorldQuaternion(_parentWorldQ);
      _localPitchQ.copy(_parentWorldQ).invert().multiply(_aimQ).multiply(_parentWorldQ);
      bone.quaternion.premultiply(_localPitchQ);
      bone.updateWorldMatrix(false, false);
    }
    this.hasBase = true;
  }
}

/** Mixamo Spine / Spine1 / Spine2 ordering; unknown names keep stable relative order. */
function spineSortKey(name: string): number {
  const n = name.toLowerCase();
  const m = n.match(/spine(\d*)/);
  if (m) return m[1] ? parseInt(m[1], 10) : 0;
  if (n.includes("chest") || n.includes("spine2") || n.includes("spine02")) return 2;
  if (n.includes("spine1") || n.includes("spine01")) return 1;
  return 0;
}
