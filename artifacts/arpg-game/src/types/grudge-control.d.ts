declare module 'grudge-control' {
  import type * as THREE from 'three';
  import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

  export type PlayerModelOptions = {
    url: string;
    scale: number;
    idleAnim: string;
    walkAnim: string;
    runAnim: string;
    jumpAnim: string | [string, string, string];
    leftWalkAnim?: string;
    rightWalkAnim?: string;
    backwardAnim?: string;
    headBoneName?: string;
    firstPersonCameraOffset?: [number, number, number];
    gravity?: number;
    jumpHeight?: number;
    speed?: number;
    flySpeed?: number;
    rotateY?: number;
    acceleration?: number;
    deceleration?: number;
    [key: string]: unknown;
  };

  export type PlayerControllerOptions = {
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    playerModelConfig: PlayerModelOptions;
    initPos?: THREE.Vector3;
    staticCollider?: THREE.Object3D | THREE.Object3D[];
    isFirstPerson?: boolean;
    enableOverShoulderView?: boolean;
    thirdMouseMode?: 0 | 1 | 2 | 3 | 4 | 5;
    enableZoom?: boolean;
    enableSpringCamera?: boolean;
    springCameraTime?: number;
    mouseSensitivity?: number;
    minCamDistance?: number;
    maxCamDistance?: number;
    camLookAtHeightRatio?: number;
    isShowMobileControls?: boolean;
    keyMap?: Record<string, string | string[] | null | undefined>;
    [key: string]: unknown;
  };

  export class playerController {
    playerCapsule: THREE.Mesh;
    playerIsOnGround: boolean;
    input: { combatMouse: boolean };
    constructor();
    init(opts: PlayerControllerOptions, onReady?: () => void): void;
    update(dt: number): void;
    destroy(): void;
    reset(pos: THREE.Vector3): void;
    getVelocity(): THREE.Vector3;
    getIsOnGround?(): boolean;
    getPlayerCapsule?(): THREE.Mesh;
    onAllEvent(): void;
    offAllEvent(): void;
  }
}