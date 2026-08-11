import * as THREE from 'three';
import { bindWorldRaycaster } from './Layers';
import { expFactor } from './math/MathUtils';

/**
 * Cinematic third-person camera with damped follow.
 * Pattern: ideal offset/lookat in player local frame + exponential smoothing
 * (discourse.threejs.org/t/third-person-camera + modern TPS over-shoulder).
 *
 * The camera lerps toward an "ideal" offset and lookat in the player's local
 * frame, producing smooth, weighted movement instead of rigid attachment.
 */
export interface CameraTuning {
  /** Offset behind/above the player in local space (x=right, y=up, z=forward) */
  idealOffset: THREE.Vector3;
  /** Look-at point relative to player in local space */
  idealLookat: THREE.Vector3;
  /** Higher = snappier follow, lower = smoother lag (per-second smoothing constant) */
  follow: number;
  /** Higher = snappier look-at */
  look: number;
}

/**
 * TPS remake default (over-the-shoulder).
 * Tuned for third-person shooter best practices:
 *  - Shoulder bias so the gun/reticle reads cleanly
 *  - Look-at slightly past the body so the character stays framed mid-screen
 *  - Snappy follow for combat responsiveness (ADS multiplies further)
 * Values may be overwritten at runtime by SurvivalRemakeBootstrap / EngineAssets.
 */
export const TUNING_THIRD_PERSON: CameraTuning = {
  idealOffset: new THREE.Vector3(0.55, 1.55, -3.4),
  idealLookat: new THREE.Vector3(0.15, 1.45, 0.85),
  follow: 14,
  look: 16,
};

export const TUNING_ARPG: CameraTuning = {
  idealOffset: new THREE.Vector3(0, 4.0, -3.8),
  idealLookat: new THREE.Vector3(0, 1.2, 2),
  follow: 6,
  look: 7,
};

export class ThirdPersonCamera {
  camera: THREE.PerspectiveCamera;
  currentPosition: THREE.Vector3 = new THREE.Vector3();
  currentLookat: THREE.Vector3 = new THREE.Vector3();
  initialized = false;

  /** Dynamic camera-orbit rotation (set externally from mouse). */
  yawOffset = 0;
  pitchOffset = 0;

  /** World meshes the camera should not clip into (walls, pillars, terrain). */
  occluders: THREE.Object3D[] = [];
  /** How far in front of a wall hit to park the camera (avoids near-plane clipping). */
  occlusionInset = 0.35;
  /** Head height above logical player position for occlusion ray origin. */
  headHeight = 1.5;
  /** Never pull the camera closer than this (metres from head). */
  minOcclusionDistance = 0.5;

  private raycaster: THREE.Raycaster = new THREE.Raycaster();
  private rayDir: THREE.Vector3 = new THREE.Vector3();
  private rayOrigin: THREE.Vector3 = new THREE.Vector3();
  private _idealOffset = new THREE.Vector3();
  private _idealLookat = new THREE.Vector3();
  private _finalPos = new THREE.Vector3();
  private static readonly _AXIS_X = new THREE.Vector3(1, 0, 0);
  private static readonly _AXIS_Y = new THREE.Vector3(0, 1, 0);

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
    bindWorldRaycaster(this.raycaster, camera);
  }

  setOccluders(meshes: THREE.Object3D[]) {
    this.occluders = meshes;
  }

  /**
   * Compute the world-space ideal offset by rotating the local-space
   * idealOffset by the player's yaw + the camera's yawOffset (mouse orbit).
   */
  private calcIdealOffset(
    playerPos: THREE.Vector3,
    playerYaw: number,
    tuning: CameraTuning,
    out: THREE.Vector3,
  ): THREE.Vector3 {
    out.copy(tuning.idealOffset);
    out.applyAxisAngle(ThirdPersonCamera._AXIS_X, this.pitchOffset);
    out.applyAxisAngle(ThirdPersonCamera._AXIS_Y, playerYaw + this.yawOffset);
    out.add(playerPos);
    return out;
  }

  private calcIdealLookat(
    playerPos: THREE.Vector3,
    playerYaw: number,
    tuning: CameraTuning,
    out: THREE.Vector3,
  ): THREE.Vector3 {
    out.copy(tuning.idealLookat);
    out.applyAxisAngle(ThirdPersonCamera._AXIS_X, this.pitchOffset * 0.5);
    out.applyAxisAngle(ThirdPersonCamera._AXIS_Y, playerYaw + this.yawOffset);
    out.add(playerPos);
    return out;
  }

  /**
   * Frame-rate independent damped follow.
   * @param dt delta time in seconds
   */
  update(dt: number, playerPos: THREE.Vector3, playerYaw: number, tuning: CameraTuning) {
    const idealOffset = this.calcIdealOffset(
      playerPos, playerYaw, tuning, this._idealOffset,
    );
    const idealLookat = this.calcIdealLookat(
      playerPos, playerYaw, tuning, this._idealLookat,
    );

    if (!this.initialized) {
      this.currentPosition.copy(idealOffset);
      this.currentLookat.copy(idealLookat);
      this.initialized = true;
    }

    const tFollow = expFactor(tuning.follow, dt);
    const tLook = expFactor(tuning.look, dt);

    this.currentPosition.lerp(idealOffset, tFollow);
    this.currentLookat.lerp(idealLookat, tLook);

    // Wall occlusion: ray from head toward desired camera. BVH-accelerated
    // when three-mesh-bvh is installed on the scene.
    const finalPos = this._finalPos.copy(this.currentPosition);
    if (this.occluders.length > 0) {
      this.rayOrigin.copy(playerPos).y += this.headHeight;
      this.rayDir.copy(finalPos).sub(this.rayOrigin);
      const targetDist = this.rayDir.length();
      if (targetDist > 0.001) {
        this.rayDir.divideScalar(targetDist);
        this.raycaster.set(this.rayOrigin, this.rayDir);
        this.raycaster.far = targetDist;
        const hits = this.raycaster.intersectObjects(this.occluders, true);
        if (hits.length > 0) {
          const safeDist = Math.max(
            this.minOcclusionDistance,
            hits[0].distance - this.occlusionInset,
          );
          finalPos.copy(this.rayOrigin).addScaledVector(this.rayDir, safeDist);
        }
      }
    }

    this.camera.position.copy(finalPos);
    this.camera.lookAt(this.currentLookat);
  }

  reset() {
    this.initialized = false;
    this.yawOffset = 0;
    this.pitchOffset = 0;
  }
}
