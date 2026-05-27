import * as THREE from 'three';
import { MASK_WORLD } from './Layers';

/**
 * Cinematic third-person camera with damped follow.
 * Based on the pattern from https://discourse.threejs.org/t/third-person-camera/18624
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

// True over-the-shoulder: parked behind and slightly to the right of the
// player at chest height, with the look-at biased a touch past the player
// (z=0.6) rather than 3 m ahead. The previous (0,1.55,3) lookat aimed
// the camera at empty space in front of the character, so the player's
// own back was at the bottom edge of the frame; this preset puts them
// firmly in the centre of the screen.
export const TUNING_THIRD_PERSON: CameraTuning = {
  idealOffset: new THREE.Vector3(0.30, 1.65, -3.2),
  idealLookat: new THREE.Vector3(0,    1.55, 0.6),
  follow: 10,
  look:   12,
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
  initialized: boolean = false;

  // dynamic camera-orbit rotation (set externally from mouse)
  yawOffset: number = 0;
  pitchOffset: number = 0;

  /** World meshes the camera should not clip into (walls, pillars, terrain). */
  occluders: THREE.Object3D[] = [];
  /** How far in front of a wall hit to park the camera (avoids near-plane clipping). */
  occlusionInset: number = 0.35;

  private raycaster: THREE.Raycaster = new THREE.Raycaster();
  private rayDir: THREE.Vector3 = new THREE.Vector3();
  private rayOrigin: THREE.Vector3 = new THREE.Vector3();

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
    this.raycaster.firstHitOnly = true; // BVH fast-path
    // Three.js r183+ requires camera for Sprite raycasting. Even though
    // we filter by MASK_WORLD (no Sprites), set it defensively.
    (this.raycaster as any).camera = camera;
    // Camera occlusion only cares about solid world geometry — never enemies,
    // loot, VFX, or projectiles. Layer mask filtering happens before any
    // triangle math, so this is essentially free.
    this.raycaster.layers.mask = MASK_WORLD;
  }

  setOccluders(meshes: THREE.Object3D[]) {
    this.occluders = meshes;
  }

  /**
   * Compute the world-space ideal offset by rotating the local-space
   * idealOffset by the player's yaw + the camera's yawOffset (mouse orbit).
   */
  private calcIdealOffset(playerPos: THREE.Vector3, playerYaw: number, tuning: CameraTuning): THREE.Vector3 {
    const offset = tuning.idealOffset.clone();
    // apply pitch (rotate around X)
    offset.applyAxisAngle(new THREE.Vector3(1, 0, 0), this.pitchOffset);
    // apply yaw (rotate around Y) — combined player + orbit
    offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), playerYaw + this.yawOffset);
    offset.add(playerPos);
    return offset;
  }

  private calcIdealLookat(playerPos: THREE.Vector3, playerYaw: number, tuning: CameraTuning): THREE.Vector3 {
    const lookat = tuning.idealLookat.clone();
    lookat.applyAxisAngle(new THREE.Vector3(1, 0, 0), this.pitchOffset * 0.5);
    lookat.applyAxisAngle(new THREE.Vector3(0, 1, 0), playerYaw + this.yawOffset);
    lookat.add(playerPos);
    return lookat;
  }

  /**
   * Frame-rate independent damped follow.
   * @param dt delta time in seconds
   */
  update(dt: number, playerPos: THREE.Vector3, playerYaw: number, tuning: CameraTuning) {
    const idealOffset = this.calcIdealOffset(playerPos, playerYaw, tuning);
    const idealLookat = this.calcIdealLookat(playerPos, playerYaw, tuning);

    if (!this.initialized) {
      this.currentPosition.copy(idealOffset);
      this.currentLookat.copy(idealLookat);
      this.initialized = true;
    }

    // exponential smoothing: factor = 1 - exp(-k * dt)
    const tFollow = 1 - Math.exp(-tuning.follow * dt);
    const tLook = 1 - Math.exp(-tuning.look * dt);

    this.currentPosition.lerp(idealOffset, tFollow);
    this.currentLookat.lerp(idealLookat, tLook);

    // Wall occlusion: cast a ray from the player's head toward the desired
    // camera position. If anything blocks line-of-sight, dolly the camera in
    // to the hit point (minus inset). Uses three-mesh-bvh under the hood when
    // available, so this is essentially free even with thousands of triangles.
    const finalPos = this.currentPosition.clone();
    if (this.occluders.length > 0) {
      this.rayOrigin.copy(playerPos).y += 1.5;
      this.rayDir.copy(finalPos).sub(this.rayOrigin);
      const targetDist = this.rayDir.length();
      if (targetDist > 0.001) {
        this.rayDir.divideScalar(targetDist);
        this.raycaster.set(this.rayOrigin, this.rayDir);
        this.raycaster.far = targetDist;
        const hits = this.raycaster.intersectObjects(this.occluders, true);
        if (hits.length > 0) {
          const safeDist = Math.max(0.5, hits[0].distance - this.occlusionInset);
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
