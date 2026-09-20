/**
 * FeetPlantIK — plant feet on terrain after the mixer (and SpineIK).
 *
 * SSOT rules (fleet character correctness):
 *  - Ground from **foot / body mesh**, never pelvis.y as "feet"
 *  - 1 unit = 1 m; hero ~1.8 m — do not scale-stretch bones
 *  - Sample terrain via GroundSampler (BVH) so feet match visible ground
 *  - Adjust **hips/root local Y** + optional foot pitch — no non-uniform bone scale
 *
 * Frame order:
 *   restore spine → mixer → spine aim → **feet plant** → read weapon sockets
 *
 * @see grudge-character-correctness · GroundSampler · SpineIK
 */

import * as THREE from 'three';
import { groundY } from '../GroundSampler';

const FOOT_NAME_L =
  /leftfoot|lfoot|foot\.l|foot_l|l_foot|bip001lfoot|mixamorigleftfoot|toebase\.l|lefttoe/i;
const FOOT_NAME_R =
  /rightfoot|rfoot|foot\.r|foot_r|r_foot|bip001rfoot|mixamorigrightfoot|toebase\.r|righttoe/i;
const HIPS_NAME = /hips|pelvis|bip001\s*pelvis|mixamorighips|^root$/i;

const _lf = new THREE.Vector3();
const _rf = new THREE.Vector3();
const _hips = new THREE.Vector3();
const _qFoot = new THREE.Quaternion();
const _eFoot = new THREE.Euler();
const _parentQ = new THREE.Quaternion();

export type FeetIKOptions = {
  /** Max pelvis lift/drop per frame (m). Default 0.08 */
  maxAdjustM?: number;
  /** Soft blend toward plant (1 = snap). Default 0.45 */
  blend?: number;
  /** Plant pitch on feet for slopes (radians scale). Default 0.35 */
  footPitchGain?: number;
  /** Ignore plant if |delta| below this (m). Default 0.008 */
  deadzoneM?: number;
};

/**
 * Two-foot plant IK. Finds L/R feet + hips on any Mixamo / Bip001 / Quaternius rig.
 */
export class FeetPlantIK {
  leftFoot: THREE.Bone | null = null;
  rightFoot: THREE.Bone | null = null;
  hips: THREE.Bone | null = null;

  private readonly root: THREE.Object3D;
  private readonly maxAdjust: number;
  private readonly blend: number;
  private readonly footPitchGain: number;
  private readonly deadzone: number;

  constructor(root: THREE.Object3D, opts: FeetIKOptions = {}) {
    this.root = root;
    this.maxAdjust = opts.maxAdjustM ?? 0.08;
    this.blend = opts.blend ?? 0.45;
    this.footPitchGain = opts.footPitchGain ?? 0.35;
    this.deadzone = opts.deadzoneM ?? 0.008;
    this.discover(root);
  }

  get isActive(): boolean {
    return !!(this.leftFoot && this.rightFoot);
  }

  private discover(root: THREE.Object3D): void {
    const feetL: THREE.Bone[] = [];
    const feetR: THREE.Bone[] = [];
    let hips: THREE.Bone | null = null;

    root.traverse((o) => {
      if (!(o as THREE.Bone).isBone) return;
      const b = o as THREE.Bone;
      const n = b.name;
      if (FOOT_NAME_L.test(n) && !/end|nub|top/i.test(n)) feetL.push(b);
      if (FOOT_NAME_R.test(n) && !/end|nub|top/i.test(n)) feetR.push(b);
      if (!hips && HIPS_NAME.test(n)) hips = b;
    });

    // Prefer "Foot" over "ToeBase" (shorter name often = ankle)
    const pick = (arr: THREE.Bone[]) =>
      arr.sort((a, b) => a.name.length - b.name.length)[0] ?? null;

    this.leftFoot = pick(feetL);
    this.rightFoot = pick(feetR);
    this.hips = hips;

    if (this.isActive) {
      console.log(
        `[FeetPlantIK] L=${this.leftFoot!.name} R=${this.rightFoot!.name}` +
          (this.hips ? ` hips=${this.hips.name}` : ' (no hips — root Y only)'),
      );
    } else {
      console.warn('[FeetPlantIK] No L/R foot bones — plant disabled');
    }
  }

  /**
   * Plant feet on GroundSampler surface. Call **after** mixer + SpineIK.
   * Does not non-uniformly scale bones (avoids mesh stretch).
   */
  apply(_dt: number): void {
    if (!this.leftFoot || !this.rightFoot) return;

    this.leftFoot.updateWorldMatrix(true, false);
    this.rightFoot.updateWorldMatrix(true, false);
    this.leftFoot.getWorldPosition(_lf);
    this.rightFoot.getWorldPosition(_rf);

    const gL = groundY(_lf.x, _lf.z);
    const gR = groundY(_rf.x, _rf.z);

    // How far each foot is above (+) or below (−) the ground sample
    const errL = _lf.y - gL;
    const errR = _rf.y - gR;
    // Plant: lower the body so the lower foot reaches ground (average of errors)
    // Positive err = floating → need negative hip offset
    const errAvg = (errL + errR) * 0.5;
    if (Math.abs(errAvg) < this.deadzone) {
      // Still apply light foot pitch on slopes
      this.pitchFoot(this.leftFoot, gL - gR);
      this.pitchFoot(this.rightFoot, gR - gL);
      return;
    }

    // Post-mixer correction only (mixer rewrites hip pose each frame — do not accumulate)
    let delta = -errAvg * this.blend;
    delta = THREE.MathUtils.clamp(delta, -this.maxAdjust, this.maxAdjust);

    if (this.hips) {
      // Translate hips in parent local +Y — never non-uniform bone scale (stretch ban)
      this.hips.position.y += delta;
    } else {
      this.root.position.y += delta;
    }

    this.pitchFoot(this.leftFoot, gL - gR);
    this.pitchFoot(this.rightFoot, gR - gL);
  }

  /** Small foot pitch toward uphill so soles follow slope without stretch. */
  private pitchFoot(foot: THREE.Bone, slopeDelta: number): void {
    if (!foot.parent) return;
    // slopeDelta > 0 → this foot's ground is higher → pitch toe up slightly
    const pitch = THREE.MathUtils.clamp(slopeDelta * this.footPitchGain, -0.2, 0.2);
    if (Math.abs(pitch) < 0.002) return;
    foot.parent.updateWorldMatrix(true, false);
    foot.parent.getWorldQuaternion(_parentQ);
    // Local X pitch relative to parent
    _eFoot.set(pitch * 0.15, 0, 0, 'XYZ');
    _qFoot.setFromEuler(_eFoot);
    foot.quaternion.multiply(_qFoot);
  }

  /** No persistent state — safe to call on respawn. */
  reset(): void {
    /* post-mixer only; nothing to clear */
  }
}
