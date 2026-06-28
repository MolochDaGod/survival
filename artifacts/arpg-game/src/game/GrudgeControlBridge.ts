import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { playerController } from 'grudge-control';
import type { PlayerControllerOptions } from 'grudge-control';
import {
  BODY_TYPES,
  STARTING_MODEL,
  type CharacterConfig,
} from './CharacterConfig';
import type { PlayerController } from './PlayerController';
import { engineAssets } from './EngineAssets';
import { toGrudgeControlUnits } from '@workspace/grudge-engine';

export interface GrudgeControlInit {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  domElement: HTMLElement;
  config: CharacterConfig;
  initPos: THREE.Vector3;
  staticCollider?: THREE.Object3D | THREE.Object3D[];
}

function resolveModelPath(config: CharacterConfig): string {
  const body = BODY_TYPES.find(
    (b) => b.id === config.bodyProportion && b.gender === config.gender,
  );
  return body?.gltfPath ?? STARTING_MODEL[config.gender];
}

/**
 * Thin adapter around MolochDaGod/grudgecontrol (grudge-control).
 * Owns third-person locomotion, capsule collision, and camera while the
 * legacy PlayerController keeps combat, inventory, and first-person mode.
 */
export class GrudgeControlBridge {
  readonly controller = new playerController();
  private controls: OrbitControls | null = null;
  private _active = false;
  private _ready = false;

  get isActive(): boolean {
    return this._active && this._ready;
  }

  get isReady(): boolean {
    return this._ready;
  }

  async init(opts: GrudgeControlInit): Promise<void> {
    await engineAssets.ensureManifest();
    const manifest = engineAssets.getManifest();
    const ctrl = engineAssets.getController('grudge-control-tps') ?? manifest.controllers[0]!;
    const cam = engineAssets.getCameraForMode('third-person') ?? manifest.cameras[0]!;
    const animLib = engineAssets.getAnimLibrary(ctrl.animationLibraryId);
    const worldScale = ctrl.worldScale;
    const modelUrl = engineAssets.resolveModelPath(resolveModelPath(opts.config));

    this.controls = new OrbitControls(opts.camera, opts.domElement);
    this.controls.enableDamping = false;
    this.controls.enablePan = false;
    this.controls.enabled = true;

    const clip = (semantic: string) => animLib?.clipMap[semantic] ?? semantic;

    const initOpts: PlayerControllerOptions = {
      scene: opts.scene,
      camera: opts.camera,
      controls: this.controls,
      initPos: opts.initPos.clone(),
      staticCollider: opts.staticCollider,
      isFirstPerson: false,
      enableOverShoulderView: true,
      thirdMouseMode: 1,
      enableZoom: false,
      enableSpringCamera: cam.springCamera,
      springCameraTime: cam.springTime,
      mouseSensitivity: cam.mouseSensitivity,
      minCamDistance: toGrudgeControlUnits(cam.minDistance, worldScale),
      maxCamDistance: toGrudgeControlUnits(cam.maxDistance, worldScale),
      camLookAtHeightRatio: cam.lookAtHeightRatio,
      isShowMobileControls: false,
      keyMap: {
        toggleFly: null,
        toggleVehicle: null,
        toggleView: null,
      },
      playerModelConfig: {
        url: modelUrl,
        scale: worldScale,
        idleAnim: clip('Idle'),
        walkAnim: clip('Walk'),
        runAnim: clip('Run'),
        jumpAnim: clip('Jump'),
        leftWalkAnim: clip('Run_Left'),
        rightWalkAnim: clip('Run_Right'),
        backwardAnim: clip('Walk'),
        headBoneName: ctrl.headBoneName,
        firstPersonCameraOffset: [
          0,
          toGrudgeControlUnits(0.12, worldScale),
          toGrudgeControlUnits(0.18, worldScale),
        ],
        gravity: toGrudgeControlUnits(ctrl.gravity, worldScale),
        jumpHeight: toGrudgeControlUnits(ctrl.jumpHeight, worldScale),
        speed: toGrudgeControlUnits(ctrl.speed, worldScale),
        flySpeed: toGrudgeControlUnits(ctrl.flySpeed, worldScale),
        acceleration: toGrudgeControlUnits(ctrl.acceleration, worldScale),
        deceleration: toGrudgeControlUnits(ctrl.deceleration, worldScale),
        rotateY: ctrl.rotateY,
      },
    };

    await new Promise<void>((resolve) => {
      void this.controller.init(initOpts, () => resolve());
    });

    this.controller.input.combatMouse = false;
    this._ready = true;
    this._active = true;
  }

  setActive(active: boolean): void {
    this._active = active && this._ready;
    if (!this._ready) return;
    if (active) {
      this.controller.onAllEvent();
    } else {
      this.controller.offAllEvent();
      document.exitPointerLock();
    }
  }

  update(dt: number): void {
    if (!this.isActive) return;
    this.controller.update(dt);
  }

  /** Map grudge-control capsule position → PlayerController logical position. */
  syncToPlayer(player: PlayerController): void {
    if (!this._ready) return;
    const cap = this.controller.getPlayerCapsule?.() ?? this.controller.playerCapsule;
    if (!cap) return;

    const pos = cap.position;
    const height = engineAssets.getController('grudge-control-tps')?.targetHeightM ?? 1.8;
    player.position.set(pos.x, pos.y + height, pos.z);
    player.isGrounded = this.controller.getIsOnGround?.() ?? this.controller.playerIsOnGround;

    const vel = this.controller.getVelocity();
    player.velocity.copy(vel);

    const q = cap.quaternion;
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
    player.yaw = Math.atan2(fwd.x, fwd.z);
    player.bodyYaw = player.yaw;
  }

  teleport(pos: THREE.Vector3): void {
    if (!this._ready) return;
    const feet = pos.clone();
    const height = engineAssets.getController('grudge-control-tps')?.targetHeightM ?? 1.8;
    feet.y -= height;
    this.controller.reset(feet);
  }

  destroy(): void {
    if (!this._ready) return;
    this.controller.destroy();
    this.controls?.dispose();
    this.controls = null;
    this._ready = false;
    this._active = false;
  }
}