import * as THREE from 'three';
import { createGLTFLoader } from '@/game/loaders/createGLTFLoader';
import type RAPIER from '@dimforge/rapier3d-compat';
import { CameraMode, PlayerStats, WeaponStats } from './types';
import { WEAPONS, KEYBINDS } from './constants';
import { AssetManager } from './AssetManager';
import { ANIM, PRIMARY_ATTACK_CLIP, BLOCK_CLIP, DASH_ATTACK_CLIP, RELOAD_CLIP, AIM_CLIP, getComboChain, IDLE_OVERRIDE_CLIP } from './AnimationRegistry';
import { Inventory } from './Inventory';
import { ThirdPersonCamera, TUNING_THIRD_PERSON, TUNING_ARPG } from './ThirdPersonCamera';
import { groundY as groundFloor } from './GroundSampler';
import { LocomotionAnimator } from './LocomotionAnimator';
import { PhysicsWorld } from './physics/PhysicsWorld';
import { StatProgressionService } from './progression/StatProgressionService';
import { WeaponAttachment } from './WeaponAttachment';

/** Player capsule height — `this.position.y` sits this far above the feet. */
const EYE_HEIGHT = 1.65; // approx — head mesh sits at local y=1.7
const PLAYER_HEIGHT = 1.8;
/** Gravity in m/s² — used only by the legacy fallback path when no Rapier
 * world is wired in. The hybrid path lets Rapier's world gravity drive
 * falls. */
const GRAVITY = 22;
/** Capsule shape used for both the kinematic body and the controller.
 * Half-height of the cylindrical part (top + bottom hemispheres add the
 * radius back), so total height = 2*(halfHeight + radius) = 1.8 m. */
const CAPSULE_HALF_HEIGHT = 0.5;
const CAPSULE_RADIUS = 0.4;

export class PlayerController {
  /** Metres below the last known safe position before the kill-plane fires
   * and respawns the player. Sized generously so legitimate falls (off a
   * cliff, into a canyon) still play out, but unbounded freefall through a
   * hole in the world is caught quickly. */
  private static readonly FALL_RECOVERY_THRESHOLD = 50;

  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;

  velocity: THREE.Vector3 = new THREE.Vector3();
  /** Smoothed input vector — lerps toward the raw WASD direction for soft accel/decel. */
  private smoothedMove: THREE.Vector3 = new THREE.Vector3();
  position: THREE.Vector3 = new THREE.Vector3(0, 1.8, 0);
  yaw: number = 0;
  pitch: number = 0;
  moveSpeed: number = 8;
  isGrounded: boolean = true;
  jumpVelocity: number = 0;
  isRolling: boolean = false;
  rollTimer: number = 0;
  rollDir: THREE.Vector3 = new THREE.Vector3();

  keys: Record<string, boolean> = {};
  mouseButtons: Record<number, boolean> = {};
  mouseDelta: { x: number; y: number } = { x: 0, y: 0 };
  mouseLocked: boolean = false;

  isAttacking: boolean = false;
  attackTimer: number = 0;
  isBlocking: boolean = false;
  isParrying: boolean = false;
  isAiming: boolean = false;

  /** First-person hands model + animations (fists_fp.glb). */
  private fpHandsGroup: THREE.Group | null = null;
  private fpHandsMixer: THREE.AnimationMixer | null = null;
  private fpHandsIdleAction: THREE.AnimationAction | null = null;
  private fpHandsPunchAction: THREE.AnimationAction | null = null;
  parryTimer: number = 0;
  comboStep: number = 0;
  comboTimer: number = 0;
  // True only for the active swing window of the current combo step. Reset
  // to false once damage has been applied so a single swing only hits each
  // enemy once. GameEngine reads this in update().
  meleeHitPending: boolean = false;
  // Forward push applied during the windup/early-swing of melee attacks
  // ("lunge"). Per-frame velocity in m/s, decayed by friction in update().
  lungeVelocity: THREE.Vector3 = new THREE.Vector3();
  lungeTimer: number = 0;
  lastAttackTime: number = 0;
  berserkerActive: boolean = false;
  berserkerTimer: number = 0;
  gunFirePending: boolean = false;
  gunRecoilTimer: number = 0;

  // ── Water / vehicle state (written by SwimController + BoatSystem) ─────
  /** True when the SwimController has the player in the swimming or submerged
   *  band. Disables jump and is read by animation / camera tilt. */
  isSwimming: boolean = false;
  /** Subset of isSwimming — head is below the surface. SwimController also
   *  drains oxygen / applies drowning damage when this is true. */
  isSubmerged: boolean = false;
  /** Boat id when mounted, else null. While set, handleMovement short-circuits
   *  — BoatSystem rewrites `position` from the seat anchor each frame. */
  mountedBoat: string | null = null;
  /** External multiplicative speed modifier (currently driven by SwimController:
   *  wading slows to 0.7×, swimming to 0.45×). 1 means no modifier. */
  externalSpeedMultiplier: number = 1;

  equippedWeapons: [WeaponStats, WeaponStats];
  activeWeaponIndex: 0 | 1 = 0;
  weaponSwapCooldown: number = 0;

  cameraMode: CameraMode = 'third-person';
  cameraModes: CameraMode[] = ['first-person', 'third-person', 'arpg'];
  cameraModeIndex: number = 1;

  // Over-the-shoulder camera bias. +1 = right shoulder (default), -1 = left.
  // shoulderLerp animates between the two so toggling doesn't snap. Used as
  // the multiplier on the third-person camera's local-space X offset.
  private shoulderSide: 1 | -1 = 1;
  private shoulderLerp: number = 1;

  // Visual recoil "kick": each gun shot bumps recoilPitch upward in radians.
  // Decays exponentially. Added to the third-person pitchOffset and the
  // first-person camera pitch every frame so guns punch the view up like
  // they should, then settle back. Independent of bodyYaw / aim — this
  // affects only the *camera*, so the bullet that already left the barrel
  // still went where the crosshair was at the time of firing.
  private recoilPitch: number = 0;

  cameraAngleH: number = 0;
  cameraAngleV: number = 0.3;
  // Visual body facing yaw — lerps toward the movement direction in
  // third-person/ARPG so the character turns to face where they're
  // walking instead of snapping with every mouse twitch.
  bodyYaw: number = 0;
  cameraDistance: number = 6;
  cameraTarget: THREE.Vector3 = new THREE.Vector3();

  playerGroup: THREE.Group;
  bodyMesh: THREE.Mesh | null = null;
  headMesh: THREE.Mesh | null = null;
  leftArmGroup: THREE.Group | null = null;
  rightArmGroup: THREE.Group | null = null;
  leftLegGroup: THREE.Group | null = null;
  rightLegGroup: THREE.Group | null = null;
  weaponMesh: THREE.Mesh | null = null;
  /** Bone-based weapon attachment system for skeleton-rigged models. */
  weaponAttachment: WeaponAttachment = new WeaponAttachment();

  private modelGroup: THREE.Group | null = null;
  private modelMixer: THREE.AnimationMixer | null = null;
  private modelAnimations: THREE.AnimationClip[] = [];
  private currentAnimAction: THREE.AnimationAction | null = null;
  private useRealModel: boolean = false;
  /** Public so SwimController / inventory carry-state / crouch can flip the
   *  isSwimming / isCarrying / isCrouching mode flags directly. */
  locomotion: LocomotionAnimator | null = null;
  // Most recent locomotion input — set every frame in handleMovement so
  // updateLocomotion can blend without reading keys twice.
  private lastLocoForward: number = 0;
  private lastLocoStrafe: number = 0;
  private lastLocoSpeed01: number = 0;

  fpWeaponGroup: THREE.Group;
  fpCamera: THREE.PerspectiveCamera;

  tpCamera: ThirdPersonCamera;
  inventory: Inventory | null = null;
  private baseMoveSpeed: number = 8;
  private baseMaxHealth: number = 100;
  private baseMaxMana: number = 80;

  walkCycle: number = 0;
  attackAnimTimer: number = 0;
  bobTimer: number = 0;

  // ---- Rapier hybrid physics (player capsule only) ----
  // When `physics` is non-null we route gravity, ground detection, slope
  // handling and step-up through Rapier's KinematicCharacterController.
  // When null we fall back to the legacy BVH-raycast path so this module
  // still works in tests/tools that don't bring up a physics world.
  private physics: PhysicsWorld | null = null;
  private rapierBody: RAPIER.RigidBody | null = null;
  private rapierCollider: RAPIER.Collider | null = null;
  private rapierController: RAPIER.KinematicCharacterController | null = null;
  /**
   * Last known safe position. Updated every time the engine calls
   * `teleportTo` (initial spawn, debug reset, fast-travel, etc.) and used
   * by `handleGravity` as a "kill plane" anchor — if the capsule plummets
   * more than `FALL_RECOVERY_THRESHOLD` metres below this anchor we yank
   * them back instead of letting them fall to -infinity through a hole in
   * the map's collider mesh.
   */
  private respawnPoint = new THREE.Vector3(0, 2, 0);
  /** Vertical velocity (m/s) maintained by the Rapier path — separate from
   * the legacy `jumpVelocity` so we can swap modes without one polluting
   * the other. Negative = falling. */
  private vy: number = 0;
  /** Horizontal motion (in metres, already multiplied by dt) staged by
   * `handleMovement` and consumed once per frame by the Rapier path in
   * `handleGravity`. Lets the controller resolve XYZ collisions in one
   * call so wall slides project the player along the wall instead of
   * letting them clip through after gravity moves them down a frame. */
  private _pendingMoveX: number = 0;
  private _pendingMoveZ: number = 0;

  stats: PlayerStats;
  onStatChange: (() => void) | null = null;
  onAbilityUse: ((id: string) => void) | null = null;

  constructor(
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    stats: PlayerStats,
    assetManager?: AssetManager,
    inventory?: Inventory,
    startingWeapons?: [WeaponStats, WeaponStats],
    physics?: PhysicsWorld | null,
  ) {
    this.scene = scene;
    this.camera = camera;
    this.stats = stats;
    this.physics = physics ?? null;
    this.inventory = inventory ?? null;
    this.baseMaxHealth = stats.maxHealth;
    this.baseMaxMana = stats.maxMana;
    this.tpCamera = new ThirdPersonCamera(camera);
    // Origin (background) on the Character Creation screen dictates the
    // starting two-weapon set. Fallback pair preserves the historical
    // sword + dagger combo for any callsite that doesn't pass weapons.
    this.equippedWeapons = startingWeapons ?? [WEAPONS[0], WEAPONS[2]];

    if (this.inventory) {
      this.inventory.onChange = () => {
        this.applyEquipmentStats();
        this.syncWeaponAttachments();
      };
    }

    this.playerGroup = new THREE.Group();
    this.scene.add(this.playerGroup);

    if (assetManager) {
      const loaded = assetManager.clonePlayerTemplate();
      if (loaded) {
        this.useRealModel = true;
        this.modelGroup = loaded.group;
        this.modelMixer = loaded.mixer;
        this.modelAnimations = loaded.animations;

        // Auto-normalize the player model to a real-world human height
        // regardless of the source units the artist exported in. The old
        // Superhero base body shipped at ~1.8 m so a 1:1 scale worked, but
        // the survivor and Quaternius body-type meshes export at much
        // larger units (the survivor mesh measures ~17 m tall raw). Without
        // normalization the player ends up as a 17-m giant in the world.
        const PLAYER_TARGET_HEIGHT_M = 1.8;
        this.modelGroup.scale.setScalar(1.0);
        this.modelGroup.updateMatrixWorld(true);
        const rawBox = new THREE.Box3().setFromObject(this.modelGroup);
        const rawHeight = rawBox.max.y - rawBox.min.y;
        const fitScale = (rawHeight > 0.01)
          ? PLAYER_TARGET_HEIGHT_M / rawHeight
          : 1.0;
        this.modelGroup.scale.setScalar(fitScale);
        // Recompute the foot offset *after* scaling so feet land exactly
        // on y=0 in playerGroup local space. The precomputed offset from
        // the AssetManager is in unscaled units and would mis-plant the
        // model after we apply fitScale here.
        this.modelGroup.updateMatrixWorld(true);
        const scaledBox = new THREE.Box3().setFromObject(this.modelGroup);
        this.modelGroup.position.y = -scaledBox.min.y;
        // One-time sanity log so we can see the actual rendered size of
        // the player model relative to the world (1 unit ≈ 1 metre).
        const bb = new THREE.Box3().setFromObject(this.modelGroup);
        const sz = new THREE.Vector3(); bb.getSize(sz);
        console.log(
          `[PlayerController] Model bbox: ${sz.x.toFixed(2)} × ${sz.y.toFixed(2)} × ${sz.z.toFixed(2)} m`,
          `(rawHeight=${rawHeight.toFixed(2)} fitScale=${fitScale.toFixed(3)} footY=${this.modelGroup.position.y.toFixed(2)})`,
        );
        // Mixamo characters bind facing +Z, but our `getForwardDir`
        // returns -Z (camera-style "into the screen") at yaw=0. Without
        // this 180° flip the body would face away from the movement
        // direction whenever the player presses W.
        this.modelGroup.rotation.y = Math.PI;
        this.playerGroup.add(this.modelGroup);

        // Bind the weapon attachment system to the skeleton bones
        this.weaponAttachment.bindSkeleton(this.modelGroup);

        // Build the directional locomotion blender if we got a mixer +
        // multiple clips. Falls back to the simple playAnimation() path
        // for models that ship a single clip.
        if (this.modelMixer && this.modelAnimations.length >= 2) {
          this.locomotion = new LocomotionAnimator(this.modelMixer, this.modelAnimations);
        } else {
          this.playAnimation('Idle');
        }
      }
    }

    if (!this.useRealModel) {
      this.buildProceduralBody();
    }

    this.playerGroup.position.copy(this.position);
    this.playerGroup.position.y = 0;

    this.fpCamera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.01, 240);
    this.fpWeaponGroup = new THREE.Group();
    this.fpCamera.add(this.fpWeaponGroup);
    scene.add(this.fpCamera);

    this.buildWeaponMesh();
    this.loadFPHands();
    this.setupInput();

    // Backpacks are equippable gear via the Inventory/SurvivalItems system
    // (see Backpack.fbx, Backpack2.fbx, FoodBackpack.fbx). The old guitar-
    // backpack GLB renderer was removed.

    // Bring up the Rapier body once the rest of the controller is wired so
    // the body's initial pose matches `this.position`. The engine can later
    // call `teleportTo()` to move the capsule to the map spawn marker.
    if (this.physics) this.initRapierBody();
  }

  /**
   * Create the kinematic capsule + character controller for the player.
   * Idempotent — if called twice the existing body/collider/controller
   * are torn down first. Safe to call after a teleport that wants to
   * "reset" physics state (we currently don't, but the door is open).
   */
  private initRapierBody(): void {
    if (!this.physics) return;
    const RAPIER = this.physics.RAPIER;
    const world = this.physics.world;

    // Tear down any prior body so re-init doesn't leak into the world.
    if (this.rapierController) {
      world.removeCharacterController(this.rapierController);
      this.rapierController = null;
    }
    if (this.rapierBody) {
      world.removeRigidBody(this.rapierBody);
      this.rapierBody = null;
      this.rapierCollider = null;
    }

    // Body translation is the capsule CENTRE. `this.position` is the
    // logical "feet+eye" reference (feet at y=position.y - PLAYER_HEIGHT,
    // because the legacy code set position.y = ground + PLAYER_HEIGHT
    // when grounded). We sync the centre = feet + (halfHeight + radius).
    const feetY = this.position.y - PLAYER_HEIGHT;
    const centreY = feetY + CAPSULE_HALF_HEIGHT + CAPSULE_RADIUS;

    const bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased()
      .setTranslation(this.position.x, centreY, this.position.z);
    this.rapierBody = world.createRigidBody(bodyDesc);

    const colliderDesc = RAPIER.ColliderDesc.capsule(
      CAPSULE_HALF_HEIGHT,
      CAPSULE_RADIUS,
    );
    this.rapierCollider = world.createCollider(colliderDesc, this.rapierBody);

    // Character controller — Rapier owns slope handling, autostep, and
    // snap-to-ground. Production-tuned for MMO feel: generous step-up
    // so city kerbs/stairs never snag, strong snap-to-ground so downhill
    // movement stays grounded, and 50° slope climb for rugged terrain.
    const ctrl = world.createCharacterController(0.04); // 4cm skin width
    ctrl.setMaxSlopeClimbAngle((50 * Math.PI) / 180);   // climb up to 50°
    ctrl.setMinSlopeSlideAngle((35 * Math.PI) / 180);   // slide above 35°
    // Autostep: step over obstacles up to 0.45m (stair height) with 0.15m
    // min free width. Include dynamic colliders for future physics objects.
    ctrl.enableAutostep(0.45, 0.15, true);
    // Snap to ground within 0.6m — prevents bouncing on slopes and stairs.
    // Slightly larger than autostep height so we stick after stepping up.
    ctrl.enableSnapToGround(0.6);
    ctrl.setApplyImpulsesToDynamicBodies(false);
    // Slide on walls instead of sticking — prevents getting stuck on corners.
    ctrl.setSlideEnabled(true);
    this.rapierController = ctrl;
  }

  /**
   * Re-position the kinematic capsule to match `this.position`. Call after
   * the engine writes a spawn point or fast-travel destination into
   * `this.position` so Rapier doesn't try to interpolate the player
   * across the world.
   */
  teleportTo(pos: THREE.Vector3): void {
    this.position.copy(pos);
    this.vy = 0;
    this.jumpVelocity = 0;
    // Anchor the kill-plane recovery to wherever we just teleported to.
    // Every legitimate teleport (initial spawn, debug reset, fast-travel)
    // is by definition a known-good position, so falling far below it is
    // proof we've slipped through the world.
    this.respawnPoint.copy(pos);
    if (this.rapierBody) {
      const feetY = this.position.y - PLAYER_HEIGHT;
      const centreY = feetY + CAPSULE_HALF_HEIGHT + CAPSULE_RADIUS;
      this.rapierBody.setNextKinematicTranslation({
        x: this.position.x,
        y: centreY,
        z: this.position.z,
      });
      this.rapierBody.setTranslation(
        { x: this.position.x, y: centreY, z: this.position.z },
        true,
      );
    }
  }

  private playAnimation(name: string) {
    // Route named actions through the locomotion blender's one-shot layer.
    // For weapon-aware actions we resolve the clip from AnimationRegistry
    // using the equipped weapon type so the correct animation plays.
    if (this.locomotion) {
      let clipName = name;
      const weaponType = this.equippedWeapons[this.activeWeaponIndex]?.type ?? 'unarmed';

      // Weapon-aware clip resolution for every action type
      switch (name) {
        case 'Attack':    clipName = PRIMARY_ATTACK_CLIP[weaponType] ?? name; break;
        case 'Block':     clipName = BLOCK_CLIP[weaponType] ?? name; break;
        case 'Reload':    clipName = RELOAD_CLIP[weaponType] ?? name; break;
        case 'Aim':       clipName = AIM_CLIP[weaponType] ?? name; break;
        case 'DashAttack':clipName = DASH_ATTACK_CLIP[weaponType] ?? PRIMARY_ATTACK_CLIP[weaponType] ?? name; break;
      }

      const hasClip = !!THREE.AnimationClip.findByName(this.modelAnimations, clipName)
        || !!THREE.AnimationClip.findByName(this.modelAnimations, clipName.toLowerCase());
      if (hasClip) {
        const def = ANIM.byClip.get(clipName);
        const dur = def?.duration ?? (name === 'Jump' ? 0.6 : name === 'Block' ? 0.4 : name === 'Reload' ? 1.4 : 0.45);
        this.locomotion.playOneShot(clipName, this.modelAnimations, dur);
        return;
      }
      // Fall through to the legacy single-action path below.
    }
    if (!this.modelMixer || this.modelAnimations.length === 0) return;

    const clip = THREE.AnimationClip.findByName(this.modelAnimations, name)
      || THREE.AnimationClip.findByName(this.modelAnimations, name.toLowerCase())
      || null;

    if (this.currentAnimAction) {
      this.currentAnimAction.fadeOut(0.2);
    }

    if (clip) {
      const action = this.modelMixer.clipAction(clip);
      action.reset().fadeIn(0.2).play();
      this.currentAnimAction = action;
    } else if (this.modelAnimations.length > 0) {
      const action = this.modelMixer.clipAction(this.modelAnimations[0]);
      action.reset().fadeIn(0.2).play();
      this.currentAnimAction = action;
    }
  }

  private buildProceduralBody() {
    const torsoGeo = new THREE.BoxGeometry(0.6, 0.9, 0.28);
    const torsoMat = new THREE.MeshStandardMaterial({ color: 0x2e4a1e, roughness: 0.85, metalness: 0.05 });
    const torso = new THREE.Mesh(torsoGeo, torsoMat);
    torso.position.y = 1.05;
    torso.castShadow = true;

    const armorGeo = new THREE.BoxGeometry(0.65, 0.5, 0.3);
    const armorMat = new THREE.MeshStandardMaterial({ color: 0x4a5568, roughness: 0.6, metalness: 0.3 });
    const armor = new THREE.Mesh(armorGeo, armorMat);
    armor.position.y = 0.15;
    torso.add(armor);

    const beltGeo = new THREE.BoxGeometry(0.65, 0.08, 0.31);
    const beltMat = new THREE.MeshStandardMaterial({ color: 0x7b3f00, roughness: 0.9 });
    const belt = new THREE.Mesh(beltGeo, beltMat);
    belt.position.y = -0.15;
    torso.add(belt);
    this.bodyMesh = torso;
    this.playerGroup.add(torso);

    const headGeo = new THREE.BoxGeometry(0.4, 0.4, 0.35);
    const headMat = new THREE.MeshStandardMaterial({ color: 0xc68642, roughness: 0.9 });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 1.7;
    head.castShadow = true;

    const helmetGeo = new THREE.BoxGeometry(0.44, 0.22, 0.38);
    const helmetMat = new THREE.MeshStandardMaterial({ color: 0x4a5568, roughness: 0.5, metalness: 0.4 });
    const helmet = new THREE.Mesh(helmetGeo, helmetMat);
    helmet.position.y = 0.12;
    head.add(helmet);

    const visorGeo = new THREE.BoxGeometry(0.3, 0.07, 0.39);
    const visorMat = new THREE.MeshStandardMaterial({ color: 0xff9900, roughness: 0.3, metalness: 0.1, emissive: 0xff6600, emissiveIntensity: 0.3 });
    const visor = new THREE.Mesh(visorGeo, visorMat);
    visor.position.set(0, 0.02, 0.02);
    head.add(visor);
    this.headMesh = head;
    this.playerGroup.add(head);

    this.leftArmGroup = this.createArm(true);
    this.rightArmGroup = this.createArm(false);
    this.leftLegGroup = this.createLeg(true);
    this.rightLegGroup = this.createLeg(false);

    this.playerGroup.add(this.leftArmGroup);
    this.playerGroup.add(this.rightArmGroup);
    this.playerGroup.add(this.leftLegGroup);
    this.playerGroup.add(this.rightLegGroup);
  }

  private createArm(isLeft: boolean): THREE.Group {
    const group = new THREE.Group();
    const side = isLeft ? -1 : 1;

    const upperMat = new THREE.MeshStandardMaterial({ color: 0x2e4a1e, roughness: 0.85 });
    const upper = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.45, 0.18), upperMat);
    upper.position.y = -0.22;
    upper.castShadow = true;

    const foreMat = new THREE.MeshStandardMaterial({ color: 0xc68642, roughness: 0.9 });
    const fore = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.4, 0.15), foreMat);
    fore.position.y = -0.6;

    const gaunMat = new THREE.MeshStandardMaterial({ color: 0x4a5568, roughness: 0.5, metalness: 0.4 });
    const gaunt = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.2, 0.17), gaunMat);
    gaunt.position.y = -0.75;

    group.add(upper, fore, gaunt);
    group.position.set(side * 0.42, 1.35, 0);
    group.userData.isArm = true;
    group.userData.isLeft = isLeft;
    return group;
  }

  private createLeg(isLeft: boolean): THREE.Group {
    const group = new THREE.Group();
    const side = isLeft ? -1 : 1;

    const thighMat = new THREE.MeshStandardMaterial({ color: 0x1a3a0f, roughness: 0.85 });
    const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.45, 0.22), thighMat);
    thigh.position.y = -0.22;

    const shin = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.4, 0.18), thighMat.clone());
    shin.position.y = -0.6;

    const bootMat = new THREE.MeshStandardMaterial({ color: 0x3d2b1f, roughness: 0.9 });
    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.15, 0.28), bootMat);
    boot.position.set(0, -0.8, 0.05);

    const greaveMat = new THREE.MeshStandardMaterial({ color: 0x4a5568, roughness: 0.5, metalness: 0.4 });
    const greave = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.25, 0.2), greaveMat);
    greave.position.y = -0.55;

    group.add(thigh, shin, boot, greave);
    group.position.set(side * 0.17, 0.62, 0);
    group.userData.isLeg = true;
    group.userData.isLeft = isLeft;
    return group;
  }

  buildWeaponMesh() {
    if (this.weaponMesh && this.rightArmGroup) {
      this.rightArmGroup.remove(this.weaponMesh);
      this.weaponMesh = null;
    }

    while (this.fpWeaponGroup.children.length > 0) {
      this.fpWeaponGroup.remove(this.fpWeaponGroup.children[0]);
    }

    const weapon = this.equippedWeapons[this.activeWeaponIndex];

    if (this.rightArmGroup) {
      this.weaponMesh = this.buildWeaponModel(weapon, false);
      this.weaponMesh.position.set(0.05, -0.9, 0.12);
      this.weaponMesh.rotation.set(Math.PI / 2, 0, 0);
      this.rightArmGroup.add(this.weaponMesh);
    }

    const fpWeapon = this.buildWeaponModel(weapon, true);
    fpWeapon.position.set(0.3, -0.25, -0.5);
    this.fpWeaponGroup.add(fpWeapon);

    const armMat = new THREE.MeshStandardMaterial({ color: 0x2e4a1e, roughness: 0.85 });
    const fpArm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.35, 0.12), armMat);
    fpArm.position.set(0.22, -0.35, -0.4);
    this.fpWeaponGroup.add(fpArm);

    const foreMat = new THREE.MeshStandardMaterial({ color: 0xc68642, roughness: 0.9 });
    const fpFore = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.3, 0.1), foreMat);
    fpFore.position.set(0.22, -0.52, -0.38);
    this.fpWeaponGroup.add(fpFore);
  }

  private buildWeaponModel(weapon: WeaponStats, fp: boolean): THREE.Mesh {
    const s = fp ? 1.2 : 1;
    const metalMat = new THREE.MeshStandardMaterial({ color: weapon.color, roughness: 0.3, metalness: 0.8 });
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x7b3f00, roughness: 0.9, metalness: 0.0 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.6, metalness: 0.5 });

    switch (weapon.type) {
      case 'sword': {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.06 * s, 0.9 * s, 0.06 * s), metalMat);
        const guard = new THREE.Mesh(new THREE.BoxGeometry(0.3 * s, 0.06 * s, 0.08 * s), woodMat);
        guard.position.y = -0.35 * s;
        mesh.add(guard);
        return mesh;
      }
      case 'axe': {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.07 * s, 0.8 * s, 0.07 * s), woodMat);
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.35 * s, 0.3 * s, 0.05 * s), metalMat);
        head.position.y = 0.35 * s;
        mesh.add(head);
        return mesh;
      }
      case 'dagger': {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.05 * s, 0.5 * s, 0.04 * s), metalMat);
        const guard = new THREE.Mesh(new THREE.BoxGeometry(0.2 * s, 0.05 * s, 0.07 * s), darkMat);
        guard.position.y = -0.2 * s;
        mesh.add(guard);
        return mesh;
      }
      case 'mace': {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.07 * s, 0.7 * s, 0.07 * s), woodMat);
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.15 * s, 8, 8), metalMat);
        head.position.y = 0.4 * s;
        mesh.add(head);
        return mesh;
      }
      case 'gun': {
        const frame = new THREE.Mesh(new THREE.BoxGeometry(0.1 * s, 0.2 * s, 0.45 * s), metalMat);
        const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.06 * s, 0.06 * s, 0.5 * s), darkMat);
        barrel.position.set(0, 0.09 * s, -0.2 * s);
        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.09 * s, 0.22 * s, 0.12 * s), woodMat);
        grip.position.set(0, -0.19 * s, 0.1 * s);
        const tg = new THREE.Mesh(new THREE.BoxGeometry(0.04 * s, 0.06 * s, 0.16 * s), metalMat);
        tg.position.set(0, -0.1 * s, 0.02 * s);
        frame.add(barrel, grip, tg);
        return frame;
      }
      default:
        return new THREE.Mesh(new THREE.BoxGeometry(0.06 * s, 0.9 * s, 0.06 * s), metalMat);
    }
  }

  setCameraMode(mode: CameraMode) {
    // Keep aim continuous across mode switches:
    //   FP → TP : camera should look the way the body was facing
    //   TP → FP : body+pitch should aim where the camera was looking
    if (mode === 'first-person' && this.cameraMode !== 'first-person') {
      this.yaw = this.cameraAngleH;
    } else if (mode !== 'first-person' && this.cameraMode === 'first-person') {
      this.cameraAngleH = this.yaw;
    }
    this.cameraMode = mode;
    this.cameraModeIndex = this.cameraModes.indexOf(mode);
    this.playerGroup.visible = mode !== 'first-person';
    this.fpWeaponGroup.visible = mode === 'first-person';
    if (this.fpHandsGroup) this.fpHandsGroup.visible = mode === 'first-person';
    this.tpCamera.reset();
    this.buildWeaponMesh();
  }

  setupInput() {
    document.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
      // Prevent arrow keys from scrolling the page while playing.
      if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.code)) e.preventDefault();
      if (e.code === KEYBINDS.CAMERA_CYCLE && !e.repeat) this.cycleCameraMode();
      if (e.code === 'F1' && !e.repeat) { e.preventDefault(); this.setCameraMode('first-person'); }
      if (e.code === 'F2' && !e.repeat) { e.preventDefault(); this.setCameraMode('third-person'); }
      if (e.code === 'F3' && !e.repeat) { e.preventDefault(); this.setCameraMode('arpg'); }
      // T toggles which shoulder the third-person camera sits over.
      // Smoothly lerps via shoulderLerp so the swap feels like a camera
      // pan rather than a snap. No-op in first-person / ARPG modes
      // (they don't use the shoulder offset).
      if (e.code === 'KeyT' && !e.repeat) { this.shoulderSide = (this.shoulderSide === 1 ? -1 : 1); }
      if (e.code === KEYBINDS.SWAP_WEAPON && !e.repeat) this.swapWeapon();
      if (e.code === KEYBINDS.JUMP && this.isGrounded) this.jump();
      if (e.code === KEYBINDS.ROLL && !e.repeat && !this.isRolling) this.startRoll();
      if (e.code === 'KeyR' && !e.repeat) this.startReload();
    });

    document.addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    document.addEventListener('mousedown', (e) => {
      this.mouseButtons[e.button] = true;
      if (e.button === 0 && this.mouseLocked) this.startAttack();
      // RMB = ADS aim (zoom). Block is kept on B key or secondary keybind.
      if (e.button === 2 && this.mouseLocked) this.startAiming();
    });
    document.addEventListener('mouseup', (e) => {
      this.mouseButtons[e.button] = false;
      if (e.button === 2) this.stopAiming();
    });
    document.addEventListener('mousemove', (e) => {
      if (this.mouseLocked) {
        this.mouseDelta.x += e.movementX;
        this.mouseDelta.y += e.movementY;
      }
    });
    document.addEventListener('pointerlockchange', () => {
      this.mouseLocked = document.pointerLockElement !== null;
    });
    document.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  cycleCameraMode() {
    const nextIndex = (this.cameraModeIndex + 1) % this.cameraModes.length;
    this.setCameraMode(this.cameraModes[nextIndex]);
  }

  swapWeapon() {
    if (this.weaponSwapCooldown > 0) return;
    this.activeWeaponIndex = this.activeWeaponIndex === 0 ? 1 : 0;
    this.weaponSwapCooldown = 0.5;
    this.buildWeaponMesh();
  }

  jump() {
    if (!this.isGrounded) return;
    // Can't jump while in the water (SwimController owns vertical motion) or
    // while piloting a boat (BoatSystem owns the player position).
    if (this.isSwimming || this.mountedBoat) return;
    this.jumpVelocity = 8;
    this.isGrounded = false;
    this.playAnimation('Jump');
  }

  startRoll() {
    if (this.stats.stamina < 20) return;
    this.isRolling = true;
    this.rollTimer = 0.4;
    // Roll clip from UAL1 — drives the visual; physics motion still
    // comes from rollDir + rollTimer below.
    this.playAnimation('Roll');
    const forward = this.getForwardDir();
    const right = this.getRightDir();
    const dx = (this.keys[KEYBINDS.MOVE_RIGHT] ? 1 : 0) - (this.keys[KEYBINDS.MOVE_LEFT] ? 1 : 0);
    const dz = (this.keys[KEYBINDS.MOVE_FORWARD] ? -1 : 0) + (this.keys[KEYBINDS.MOVE_BACKWARD] ? 1 : 0);
    this.rollDir.copy(forward.multiplyScalar(-dz)).add(right.multiplyScalar(dx));
    // No directional input → default dodge is a quick step in the
    // direction the player is currently facing/aiming (forward).
    if (this.rollDir.lengthSq() < 0.01) this.rollDir.copy(this.getForwardDir());
    this.rollDir.normalize();
    this.stats.stamina = Math.max(0, this.stats.stamina - 20);
    this.onStatChange?.();
  }

  startAttack() {
    if (this.isAttacking) return;

    // FP hands punch animation
    if (this.cameraMode === 'first-person' && this.fpHandsMixer && this.fpHandsPunchAction) {
      this.fpHandsIdleAction?.fadeOut(0.06);
      this.fpHandsPunchAction.reset().fadeIn(0.06).play();
      this.fpHandsMixer.addEventListener('finished', () => {
        this.fpHandsPunchAction!.fadeOut(0.1);
        this.fpHandsIdleAction?.reset().fadeIn(0.1).play();
      });
    }

    const weapon = this.equippedWeapons[this.activeWeaponIndex];
    const isRanged = weapon.type === 'gun' || weapon.type === 'rifle' || weapon.type === 'shotgun'
      || weapon.type === 'smg' || weapon.type === 'bow' || weapon.type === 'crossbow';

    if (isRanged) {
      const fireCooldown = 0.6 / weapon.speed;
      this.isAttacking = true;
      this.attackTimer = fireCooldown;
      this.attackAnimTimer = fireCooldown;
      this.gunFirePending = true;
      this.gunRecoilTimer = 0.12;
      // Camera kick. ADS halves the recoil so aimed shots stay on
      // target. Rifles/shotguns have heavier kick than pistols.
      const baseKick = (weapon.type === 'rifle' || weapon.type === 'shotgun') ? 0.055 : 0.040;
      this.recoilPitch += this.isAiming ? baseKick * 0.5 : baseKick;
      return;
    }

    // Melee combo: use weapon-specific combo chain from AnimationRegistry
    const combo = getComboChain(weapon.type);
    const now = performance.now();
    const comboWindow = combo.steps[this.comboStep]?.windowMs ?? 1200;
    if (now - this.lastAttackTime > comboWindow) this.comboStep = 0;
    this.lastAttackTime = now;

    const attackDuration = 0.5 / weapon.speed * (this.berserkerActive ? 0.5 : 1);
    this.isAttacking = true;
    this.attackTimer = attackDuration;
    this.attackAnimTimer = attackDuration;
    this.comboTimer = attackDuration + 0.3;
    this.meleeHitPending = true;

    // Forward lunge in the windup. Heavy 2H weapons lunge further but slower.
    const isHeavy = weapon.type === 'axe' || weapon.type === 'mace' || weapon.type === 'hammer'
      || weapon.type === 'greatsword' || weapon.type === 'greataxe' || weapon.type === 'spear'
      || weapon.range >= 3;
    const lungeSpeed = isHeavy ? 9 : 6;
    this.lungeVelocity.copy(this.getForwardDir()).multiplyScalar(lungeSpeed);
    this.lungeTimer = attackDuration * 0.4;

    this.playAnimation('Attack');
  }

  /**
   * Per-combo-step parameters used by GameEngine when it calls
   * checkPlayerAttack. Step 0 = horizontal slash, step 1 = reverse slash,
   * step 2 = forward thrust (narrow + long + heavy damage).
   */
  getComboParams(): { arcDot: number; rangeMul: number; damageMul: number; isFinisher: boolean } {
    switch (this.comboStep) {
      case 0:  return { arcDot: 0.3,  rangeMul: 1.0, damageMul: 1.0, isFinisher: false };
      case 1:  return { arcDot: 0.3,  rangeMul: 1.0, damageMul: 1.1, isFinisher: false };
      case 2:  return { arcDot: 0.7,  rangeMul: 1.4, damageMul: 1.6, isFinisher: true  };
      default: return { arcDot: 0.3,  rangeMul: 1.0, damageMul: 1.0, isFinisher: false };
    }
  }

  startBlock() {
    this.isBlocking = true;
    this.isParrying = true;
    this.parryTimer = 0.25;
    this.playAnimation('Block');
  }

  stopBlock() {
    this.isBlocking = false;
    setTimeout(() => { this.isParrying = false; }, 250);
    this.playAnimation('Idle');
  }

  startAiming() {
    this.isAiming = true;
    // Play weapon-specific aim pose if available
    const weaponType = this.equippedWeapons[this.activeWeaponIndex]?.type ?? 'unarmed';
    if (AIM_CLIP[weaponType]) {
      this.playAnimation('Aim');
    }
  }

  stopAiming() {
    this.isAiming = false;
  }

  /** Trigger reload animation for the equipped ranged weapon. */
  startReload() {
    const weaponType = this.equippedWeapons[this.activeWeaponIndex]?.type ?? 'unarmed';
    if (RELOAD_CLIP[weaponType]) {
      this.playAnimation('Reload');
    }
  }

  private loadFPHands() {
    const loader = createGLTFLoader();
    loader.load('/models/fists_fp.glb', (gltf) => {
      this.fpHandsGroup = gltf.scene as THREE.Group;
      // Position hands in lower portion of FP view
      this.fpHandsGroup.position.set(0, -0.38, -0.52);
      this.fpHandsGroup.scale.setScalar(0.55);

      this.fpCamera.add(this.fpHandsGroup);
      this.fpHandsGroup.visible = this.cameraMode === 'first-person';

      if (gltf.animations.length > 0) {
        this.fpHandsMixer = new THREE.AnimationMixer(this.fpHandsGroup);

        const tryClip = (...names: string[]) => {
          for (const n of names) {
            const c = THREE.AnimationClip.findByName(gltf.animations, n)
              || THREE.AnimationClip.findByName(gltf.animations, n.toLowerCase());
            if (c) return c;
          }
          return null;
        };

        const idleClip = tryClip('Idle', 'idle', 'Armature|Idle') || gltf.animations[0];
        if (idleClip) {
          this.fpHandsIdleAction = this.fpHandsMixer.clipAction(idleClip);
          this.fpHandsIdleAction.play();
        }

        const punchClip = tryClip('Punch', 'Attack', 'punch', 'attack', 'Armature|Attack', 'Right_Punch')
          || (gltf.animations.length > 1 ? gltf.animations[1] : null);
        if (punchClip) {
          this.fpHandsPunchAction = this.fpHandsMixer.clipAction(punchClip);
          this.fpHandsPunchAction.setLoop(THREE.LoopOnce, 1);
          this.fpHandsPunchAction.clampWhenFinished = true;
        }
      }
      console.log('[FPHands] Loaded fists_fp.glb,', gltf.animations.length, 'clips');
    }, undefined, (err) => console.warn('[FPHands] Failed to load fists_fp.glb', err));
  }

  activateBerserker() {
    this.berserkerActive = true;
    this.berserkerTimer = 8;
  }

  /**
   * Yaw used as the basis for movement, attacks, and aim. In first-person
   * the player's body yaw IS the aim direction. In third-person / ARPG
   * the camera orbit drives aim — pressing W moves "into the screen"
   * regardless of which way the body is currently facing.
   */
  getAimYaw(): number {
    return this.cameraMode === 'first-person' ? this.yaw : this.cameraAngleH;
  }

  getForwardDir(): THREE.Vector3 {
    const y = this.getAimYaw();
    return new THREE.Vector3(-Math.sin(y), 0, -Math.cos(y)).normalize();
  }

  getRightDir(): THREE.Vector3 {
    const y = this.getAimYaw();
    return new THREE.Vector3(-Math.sin(y - Math.PI / 2), 0, -Math.cos(y - Math.PI / 2)).normalize();
  }

  getAttackRange(): number {
    const weapon = this.equippedWeapons[this.activeWeaponIndex];
    return weapon.range;
  }

  getAttackDamage(): number {
    const weapon = this.equippedWeapons[this.activeWeaponIndex];
    const eq = this.inventory?.getTotalStats();
    const equipBonus = eq?.damage ?? 0;
    const strBonus = 1 + (this.stats.strength - 10) * 0.05;
    const critRoll = Math.random() * 100 < (eq?.critChance ?? 0) ? 2 : 1;
    return (weapon.damage + equipBonus) * strBonus * (this.berserkerActive ? 1.5 : 1) * critRoll;
  }

  takeDamage(amount: number) {
    if (this.isParrying) {
      amount = 0;
    } else if (this.isBlocking) {
      amount *= 0.25;
    }
    // armor: each point reduces by ~0.5%, capped at 75%
    const armor = this.inventory?.getTotalStats().armor ?? 0;
    const dr = Math.min(0.75, armor / (armor + 100));
    amount *= (1 - dr);
    this.stats.health = Math.max(0, this.stats.health - amount);
    this.onStatChange?.();

    // Visual hit reaction. Heavy hits (>=30% maxHp) trigger the full
    // Hit_Knockback knockdown; smaller hits play a chest flinch. Death
    // wins over both. Skipped while blocking (we already attenuated
    // damage; the block stance reads as the reaction).
    if (amount > 0 && !this.isBlocking) {
      const frac = amount / Math.max(1, this.stats.maxHealth);
      if (this.stats.health <= 0) {
        this.playAnimation('Death01');
      } else if (frac >= 0.30) {
        this.playAnimation('Hit_Knockback');
      } else {
        this.playAnimation('Hit_Chest');
      }
    }
  }

  /**
   * Re-apply equipment stat bonuses to derived player stats.
   * Called whenever inventory changes.
   */
  applyEquipmentStats() {
    if (!this.inventory) return;
    const eq = this.inventory.getTotalStats();
    const prevMaxHp = this.stats.maxHealth;
    const prevMaxMp = this.stats.maxMana;

    this.stats.maxHealth = this.baseMaxHealth + (eq.health ?? 0);
    this.stats.maxMana = this.baseMaxMana + (eq.mana ?? 0);
    this.moveSpeed = this.baseMoveSpeed * (1 + (eq.moveSpeed ?? 0) / 100);

    // heal/mana adjust if max went up
    if (this.stats.maxHealth > prevMaxHp) {
      this.stats.health += this.stats.maxHealth - prevMaxHp;
    }
    this.stats.health = Math.min(this.stats.health, this.stats.maxHealth);
    if (this.stats.maxMana > prevMaxMp) {
      this.stats.mana += this.stats.maxMana - prevMaxMp;
    }
    this.stats.mana = Math.min(this.stats.mana, this.stats.maxMana);

    this.onStatChange?.();
  }

  gainExperience(exp: number) {
    this.stats.experience += exp;
    const xpNeeded = this.stats.level * 100;
    if (this.stats.experience >= xpNeeded) {
      this.stats.experience -= xpNeeded;
      this.stats.level++;
      this.stats.skillPoints++;
      this.stats.maxHealth += 10;
      this.stats.health = this.stats.maxHealth;
      this.stats.maxMana += 5;
      // Each level grants +1 free Grudge-Stat point (pool size always equals
      // current level). Allocation happens from the MainPanel.
      StatProgressionService.notifyLevel(this.stats.level);
    }
    this.onStatChange?.();
  }

  update(dt: number) {
    this._lastDt = dt;
    this.handleMouse(dt);
    this.handleMovement(dt);
    this.handleGravity(dt);
    this.handleTimers(dt);
    this.updatePlayerBody(dt);
    this.updateCamera();
    this.regenStats(dt);
    // Locomotion blender drives weights based on the input captured during
    // handleMovement; mixer.update() then advances all weighted clips.
    if (this.locomotion) {
      this.locomotion.setMovement(this.lastLocoForward, this.lastLocoStrafe, this.lastLocoSpeed01);
      this.locomotion.update(dt);
    }
    if (this.modelMixer) this.modelMixer.update(dt);
    if (this.fpHandsMixer) this.fpHandsMixer.update(dt);
  }

  private handleMouse(dt: number) {
    const sensitivity = 0.002;
    // Arrow key camera speed: ~70°/s at 60fps feels snappy without being uncontrollable.
    const arrowSpeed = 1.2 * dt;

    if (this.cameraMode === 'first-person') {
      this.yaw -= this.mouseDelta.x * sensitivity;
      this.pitch -= this.mouseDelta.y * sensitivity;
      this.pitch = Math.max(-Math.PI / 2.5, Math.min(Math.PI / 2.5, this.pitch));
      // Arrow keys as alternative look control in FP.
      if (this.keys['ArrowLeft'])  this.yaw  += arrowSpeed;
      if (this.keys['ArrowRight']) this.yaw  -= arrowSpeed;
      if (this.keys['ArrowUp'])    this.pitch = Math.max(-Math.PI / 2.5, this.pitch - arrowSpeed);
      if (this.keys['ArrowDown'])  this.pitch = Math.min(Math.PI / 2.5,  this.pitch + arrowSpeed);
    } else {
      // TP / ARPG: mouse (and arrow keys) orbit the camera only.
      this.cameraAngleH -= this.mouseDelta.x * sensitivity;
      this.cameraAngleV -= this.mouseDelta.y * sensitivity;
      this.cameraAngleV = Math.max(0.05, Math.min(Math.PI / 2.2, this.cameraAngleV));
      if (this.keys['ArrowLeft'])  this.cameraAngleH += arrowSpeed;
      if (this.keys['ArrowRight']) this.cameraAngleH -= arrowSpeed;
      if (this.keys['ArrowUp'])    this.cameraAngleV  = Math.max(0.05,         this.cameraAngleV - arrowSpeed * 0.6);
      if (this.keys['ArrowDown'])  this.cameraAngleV  = Math.min(Math.PI / 2.2, this.cameraAngleV + arrowSpeed * 0.6);
    }

    this.mouseDelta.x = 0;
    this.mouseDelta.y = 0;
  }

  private handleMovement(dt: number) {
    // Boat pilot: BoatSystem writes position/yaw directly; bail before we
    // accumulate any WASD velocity here so the two don't fight.
    if (this.mountedBoat) {
      this.smoothedMove.set(0, 0, 0);
      this.velocity.set(0, 0, 0);
      this.lastLocoForward = 0;
      this.lastLocoStrafe = 0;
      this.lastLocoSpeed01 = 0;
      return;
    }
    const speed = this.moveSpeed
      * (this.berserkerActive ? 1.3 : 1)
      * (this.isBlocking ? 0.5 : 1)
      * this.externalSpeedMultiplier;
    const forward = this.getForwardDir();
    const right = this.getRightDir();
    let moving = false;
    const moveVec = new THREE.Vector3();

    if (this.isRolling) {
      moveVec.copy(this.rollDir).multiplyScalar(speed * 1.8);
      moving = true;
      this.smoothedMove.copy(moveVec); // skip smoothing during dash for responsiveness
    } else {
      const targetDir = new THREE.Vector3();
      // Capture per-axis input for the locomotion blender. fwdInput is +1
      // for W and -1 for S; strafeInput is +1 for D, -1 for A. These
      // values are independent of camera/yaw — they describe the player's
      // intent in body-relative space.
      const fwdInput = (this.keys[KEYBINDS.MOVE_FORWARD] ? 1 : 0) - (this.keys[KEYBINDS.MOVE_BACKWARD] ? 1 : 0);
      const strafeInput = (this.keys[KEYBINDS.MOVE_RIGHT] ? 1 : 0) - (this.keys[KEYBINDS.MOVE_LEFT] ? 1 : 0);
      if (fwdInput !== 0) { targetDir.addScaledVector(forward, fwdInput); moving = true; }
      if (strafeInput !== 0) { targetDir.addScaledVector(right, strafeInput); moving = true; }
      if (targetDir.lengthSq() > 0) targetDir.normalize().multiplyScalar(speed);

      // Speed envelope for run/walk blend: full input + berserker → run.
      // Blocking caps the speed below the run threshold automatically via
      // the speed multiplier above.
      const inputMag = Math.min(1, Math.hypot(fwdInput, strafeInput));
      this.lastLocoForward = fwdInput;
      this.lastLocoStrafe = strafeInput;
      this.lastLocoSpeed01 = inputMag * (this.berserkerActive ? 1.0 : 0.85);

      // Frame-rate independent exponential smoothing on the velocity vector.
      // Higher k = snappier; ~14/s feels responsive without being twitchy.
      const k = moving ? 16 : 12;
      const t = 1 - Math.exp(-k * dt);
      this.smoothedMove.lerp(targetDir, t);
      moveVec.copy(this.smoothedMove);
    }

    // Apply horizontal motion. With Rapier we defer the actual translation
    // to handleGravity so the character controller resolves XZ + Y in one
    // call (wall slides + slope projection); without Rapier we fall back
    // to the legacy "just write to position" path.
    if (this.physics && this.rapierController) {
      this._pendingMoveX = moveVec.x * dt;
      this._pendingMoveZ = moveVec.z * dt;
      if (this.lungeTimer > 0) {
        this._pendingMoveX += this.lungeVelocity.x * dt;
        this._pendingMoveZ += this.lungeVelocity.z * dt;
        this.lungeVelocity.multiplyScalar(Math.exp(-6 * dt));
      }
    } else {
      this.position.x += moveVec.x * dt;
      this.position.z += moveVec.z * dt;

      // Lunge: short forward burst during the windup of melee swings.
      if (this.lungeTimer > 0) {
        this.position.x += this.lungeVelocity.x * dt;
        this.position.z += this.lungeVelocity.z * dt;
        this.lungeVelocity.multiplyScalar(Math.exp(-6 * dt));
      }

      // Vestigial 180 m arena clamp from the procedural-only days. Rapier
      // path doesn't need it (real walls now stop the player), but we
      // keep it as a global "don't walk to infinity" guard for the legacy
      // path where the only world is the procedural terrain.
      const maxR = 180;
      const dist = Math.sqrt(this.position.x ** 2 + this.position.z ** 2);
      if (dist > maxR) {
        this.position.x = (this.position.x / dist) * maxR;
        this.position.z = (this.position.z / dist) * maxR;
      }
    }

    if (moving && this.isGrounded) {
      this.walkCycle += dt * 8 * (this.berserkerActive ? 1.5 : 1);
      this.bobTimer += dt * 8;
    }
    // When the locomotion blender is active it owns Idle/Walk/Run/Strafe
    // weights every frame — don't fight it with playAnimation('Walk'/'Idle')
    // calls. The fallback path (no blender) keeps the legacy single-clip
    // behaviour for backward compatibility with non-Mixamo player models.
    if (!this.locomotion) {
      if (moving && this.isGrounded && !this.isAttacking) {
        this.playAnimation('Walk');
      } else if (!moving && !this.isAttacking && !this.isBlocking) {
        this.playAnimation('Idle');
      }
    }

    if (moving) this.stats.stamina = Math.max(0, this.stats.stamina - dt * 5);
  }

  /**
   * Per-frame "fall and resolve" step.
   *
   * Two paths:
   *
   * 1. Rapier hybrid (preferred when a PhysicsWorld is wired in):
   *    - Integrate vertical velocity locally (Rapier's world gravity does
   *      NOT apply to kinematic bodies, by design — we own the vertical
   *      velocity and Rapier's controller resolves penetrations).
   *    - Combine the staged horizontal motion (`_pendingMoveX/Z`) with
   *      `vy * dt` and ask the character controller to slide it against
   *      every static collider in one call. This is what gives us real
   *      walls, real ledges, real slopes, and a real "what am I standing
   *      on" answer (`computedGrounded()`).
   *    - Sync the corrected translation back into `this.position` so
   *      every other system (camera, melee, NPC pathing) keeps reading
   *      the same logical "feet+height" reference it always did.
   *
   * 2. Legacy BVH-raycast fallback:
   *    Original behaviour for the procedural terrain world — useful for
   *    smoke-tests and any non-map scene that doesn't bring up a physics
   *    world. Unchanged from the pre-Rapier implementation.
   */
  private handleGravity(dt: number) {
    if (
      this.physics &&
      this.rapierController &&
      this.rapierBody &&
      this.rapierCollider
    ) {
      // Bridge a freshly-issued jump into vy. `jumpVelocity` is what
      // jump() sets when the player presses Space; we transfer it once
      // and then own vy from there, so jump tuning code keeps working.
      if (this.jumpVelocity > 0 && this.vy <= 0.01) {
        this.vy = this.jumpVelocity;
        this.jumpVelocity = 0;
      }
      // Integrate gravity. GRAVITY_Y is negative.
      this.vy += PhysicsWorld.GRAVITY_Y * dt;

      const desired = {
        x: this._pendingMoveX,
        y: this.vy * dt,
        z: this._pendingMoveZ,
      };
      this._pendingMoveX = 0;
      this._pendingMoveZ = 0;

      this.rapierController.computeColliderMovement(this.rapierCollider, desired);
      const corrected = this.rapierController.computedMovement();

      const t = this.rapierBody.translation();
      const newX = t.x + corrected.x;
      const newY = t.y + corrected.y;
      const newZ = t.z + corrected.z;
      this.rapierBody.setNextKinematicTranslation({ x: newX, y: newY, z: newZ });

      // Logical position has feet at (position.y - PLAYER_HEIGHT). Capsule
      // body translation is the centre, so feet = centre - (halfHeight + radius).
      const feetY = newY - (CAPSULE_HALF_HEIGHT + CAPSULE_RADIUS);
      this.position.x = newX;
      this.position.z = newZ;
      this.position.y = feetY + PLAYER_HEIGHT;

      const grounded = this.rapierController.computedGrounded();
      this.isGrounded = grounded;
      if (grounded) {
        // Cancel residual fall velocity so the next jump starts clean and
        // gravity doesn't accumulate while standing still.
        if (this.vy < 0) this.vy = 0;
        this.jumpVelocity = 0;
      }

      // Kill-plane recovery. If the capsule has dropped 50+ metres below
      // the last known safe position the player has either fallen off the
      // edge of the trimesh or slipped through a hole in it. Either way,
      // there's no recovering organically — yank them back to the anchor
      // (lifted 4 m so they re-settle onto the ground rather than spawning
      // already inside it). This guarantees the user can never end up in
      // an unrecoverable freefall.
      if (this.position.y < this.respawnPoint.y - PlayerController.FALL_RECOVERY_THRESHOLD) {
        const recover = this.respawnPoint.clone();
        recover.y += 4;
        this.teleportTo(recover);
        console.warn(
          `[PlayerController] Fell below kill plane (y=${this.position.y.toFixed(1)}), ` +
          `respawning at (${this.respawnPoint.x.toFixed(1)}, ${this.respawnPoint.y.toFixed(1)}, ${this.respawnPoint.z.toFixed(1)}).`,
        );
      }
      return;
    }

    // ---- Legacy BVH path ----
    // Use the BVH-raycast ground sampler — it returns the actual visual
    // surface height (terrain mesh triangles), which can drift slightly
    // from the analytic noise at chunk seams. Falls back to analytic
    // when no scene is registered or no surface is hit.
    const groundY = groundFloor(this.position.x, this.position.z) + PLAYER_HEIGHT;

    if (!this.isGrounded) {
      this.jumpVelocity -= GRAVITY * dt;
      this.position.y += this.jumpVelocity * dt;
    } else {
      // While grounded, smoothly snap to terrain (handles slope traversal
      // without making jumps feel sticky). Lerp factor is per-second.
      const t = 1 - Math.exp(-18 * dt);
      this.position.y = THREE.MathUtils.lerp(this.position.y, groundY, t);
    }

    // Land/clamp on terrain.
    if (this.position.y <= groundY) {
      this.position.y = groundY;
      this.jumpVelocity = 0;
      this.isGrounded = true;
    }
  }

  private handleTimers(dt: number) {
    if (this.attackTimer > 0) {
      this.attackTimer -= dt;
      if (this.attackTimer <= 0) {
        this.isAttacking = false;
        this.attackTimer = 0;
        // Advance combo only after the swing finishes, so chaining clicks
        // walks through 0 → 1 → 2 → 0 instead of skipping steps.
        this.comboStep = (this.comboStep + 1) % 3;
        this.comboTimer = 1.2;
      }
    }
    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) this.comboStep = 0;
    }
    if (this.lungeTimer > 0) this.lungeTimer -= dt;
    else this.lungeVelocity.set(0, 0, 0);

    if (this.parryTimer > 0) this.parryTimer -= dt;
    else this.isParrying = false;

    if (this.rollTimer > 0) {
      this.rollTimer -= dt;
      if (this.rollTimer <= 0) this.isRolling = false;
    }

    if (this.weaponSwapCooldown > 0) this.weaponSwapCooldown -= dt;

    if (this.berserkerActive) {
      this.berserkerTimer -= dt;
      if (this.berserkerTimer <= 0) this.berserkerActive = false;
    }
    if (this.gunRecoilTimer > 0) this.gunRecoilTimer -= dt;
    // Recoil decay (~half-life 70 ms with k=10) — fast snap back to zero
    // so the kick reads as a punctual punch, not a slow drift. Below
    // ~0.0001 rad it's invisible, so clamp to avoid endless tiny work.
    if (this.recoilPitch > 0) {
      this.recoilPitch *= Math.exp(-10 * dt);
      if (this.recoilPitch < 0.0001) this.recoilPitch = 0;
    }
    // Smoothly chase the active shoulder side so KeyT toggles read as a
    // pan rather than a snap (~250 ms with k=8).
    this.shoulderLerp = THREE.MathUtils.lerp(this.shoulderLerp, this.shoulderSide, 1 - Math.exp(-8 * dt));
  }

  private updatePlayerBody(dt: number) {
    // Visual model: feet sit on the terrain at the player's (x, z). Without
    // this the model gets buried whenever the player walks onto a hill,
    // because the body geometry is built with feet at local y=0.
    this.playerGroup.position.copy(this.position);
    if (this.physics && this.rapierController) {
      // Rapier path: position.y is "feet + PLAYER_HEIGHT" (kept in sync
      // by handleGravity), so feet are exactly position.y - PLAYER_HEIGHT.
      // Trust it directly — re-sampling the terrain here would tear the
      // model away from the actual capsule when the player is on top of a
      // building, on stairs, etc.
      this.playerGroup.position.y = this.position.y - PLAYER_HEIGHT;
    } else {
      // Legacy: visual feet anchor to the rendered terrain surface, not
      // the analytic noise — any tiny mismatch between the two (vertex
      // shading interpolation, chunk seams) shows up as floating/sinking.
      this.playerGroup.position.y = groundFloor(this.position.x, this.position.z);
    }

    // Body facing:
    // - First-person: body yaw == player yaw (mouse-driven).
    // - Third-person / ARPG: body smoothly turns to face the actual
    //   movement direction. When the player is standing still the body
    //   keeps its last facing instead of snapping to the camera.
    if (this.cameraMode === 'first-person') {
      this.bodyYaw = this.yaw;
    } else if (this.smoothedMove.lengthSq() > 0.04) {
      const desired = Math.atan2(-this.smoothedMove.x, -this.smoothedMove.z);
      // Wrap shortest-path delta into (-π, π] before lerping so the body
      // never spins the long way around through 2π.
      let delta = desired - this.bodyYaw;
      while (delta > Math.PI)  delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      const t = 1 - Math.exp(-12 * dt);
      this.bodyYaw += delta * t;
    }
    this.playerGroup.rotation.y = this.bodyYaw;

    if (this.useRealModel) return;

    const walkPhase = this.walkCycle;
    const isMoving = this.keys[KEYBINDS.MOVE_FORWARD] || this.keys[KEYBINDS.MOVE_BACKWARD]
      || this.keys[KEYBINDS.MOVE_LEFT] || this.keys[KEYBINDS.MOVE_RIGHT];

    const la = this.leftArmGroup;
    const ra = this.rightArmGroup;
    const ll = this.leftLegGroup;
    const rl = this.rightLegGroup;

    if (isMoving && this.isGrounded) {
      if (ll) ll.rotation.x = Math.sin(walkPhase) * 0.5;
      if (rl) rl.rotation.x = -Math.sin(walkPhase) * 0.5;
      if (la) la.rotation.x = -Math.sin(walkPhase) * 0.4;
      if (ra) ra.rotation.x = Math.sin(walkPhase) * 0.4;
      if (this.bodyMesh) this.bodyMesh.rotation.z = Math.sin(walkPhase) * 0.03;
    } else {
      if (ll) ll.rotation.x *= 0.8;
      if (rl) rl.rotation.x *= 0.8;
      if (!this.isAttacking) {
        if (la) la.rotation.x *= 0.8;
        if (ra) ra.rotation.x *= 0.8;
      }
    }

    if (this.isAttacking && this.attackAnimTimer > 0) {
      const weaponType = this.equippedWeapons[this.activeWeaponIndex].type;
      if (weaponType === 'gun') {
        const recoilT = this.gunRecoilTimer > 0 ? (this.gunRecoilTimer / 0.12) : 0;
        if (ra) { ra.rotation.x = -recoilT * 0.8; ra.position.z = recoilT * 0.08; }
      } else {
        const t = 1 - (this.attackTimer / this.attackAnimTimer);
        const swing = Math.sin(t * Math.PI);
        if (weaponType === 'dagger') {
          if (ra) ra.rotation.x = -swing * 1.5;
          if (la) la.rotation.x = -swing * 1.2;
        } else {
          const comboDir = this.comboStep % 2 === 0 ? 1 : -1;
          if (ra) ra.rotation.x = -swing * 1.8;
          if (ra) ra.rotation.z = comboDir * swing * 0.6;
        }
      }
    } else if (ra) {
      ra.position.z *= 0.8;
    }

    if (this.isBlocking) {
      if (la) { la.rotation.x = -0.8; la.rotation.z = 0.6; }
      if (ra) ra.rotation.x = -0.4;
    }
  }

  private updateCamera() {
    // ADS FOV: smoothly lerp FOV when aiming — FP 75→50, TP 60→40.
    const aimFovFP  = this.isAiming ? 50  : 75;
    const aimFovTP  = this.isAiming ? 40  : 60;

    if (this.cameraMode === 'first-person') {
      // When Rapier owns the capsule, derive eye height from the simulated
      // feet position (`position.y - PLAYER_HEIGHT`) instead of resampling
      // the terrain. Otherwise the camera dives into stairs and platforms
      // because `groundFloor` only knows about the analytic terrain mesh,
      // not buildings or props that Rapier is actually standing the
      // capsule on.
      const feetY = this.physics
        ? this.position.y - PLAYER_HEIGHT
        : groundFloor(this.position.x, this.position.z);
      this.fpCamera.position.set(this.position.x, feetY + EYE_HEIGHT, this.position.z);
      this.fpCamera.rotation.order = 'YXZ';
      this.fpCamera.rotation.y = this.yaw;
      this.fpCamera.rotation.x = this.pitch;

      this.camera.position.copy(this.fpCamera.position);
      this.camera.rotation.copy(this.fpCamera.rotation);
      this.camera.rotation.order = 'YXZ';

      const bob = Math.sin(this.bobTimer) * (this.isAiming ? 0.005 : 0.015);
      this.camera.position.y += bob;
      this.fpWeaponGroup.position.y = bob * 0.5;
      this.fpWeaponGroup.rotation.z = Math.sin(this.bobTimer * 0.5) * (this.isAiming ? 0.005 : 0.02);

      // Recoil punches the view *up* (negative pitch in YXZ-camera world
      // space because pitching the camera forward looks down). Decays
      // back to zero in ~70 ms so the next shot can stack cleanly.
      this.camera.rotation.x -= this.recoilPitch;

      // Smooth FOV transition
      this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, aimFovFP, 0.12);
      this.camera.updateProjectionMatrix();
    } else {
      const baseTuning = this.cameraMode === 'arpg' ? TUNING_ARPG : TUNING_THIRD_PERSON;
      // ADS in TP: dolly closer to the shoulder and a touch above the
      // line of fire so the crosshair sits in the middle of frame
      // instead of behind the player's head. Crucially keep the X bias
      // at full magnitude — shrinking the whole offset (the previous
      // .multiplyScalar(0.55) approach) collapsed the over-shoulder
      // bias and put the camera directly behind the head, which made
      // the gun barrel obscure the target.
      const aimedOffset = baseTuning.idealOffset.clone();
      if (this.isAiming && this.cameraMode === 'third-person') {
        aimedOffset.x *= 1.4;   // push further to whichever shoulder is active
        aimedOffset.y *= 0.95;  // very slight crouch toward the sights
        aimedOffset.z *= 0.55;  // dolly in toward the shoulder
      }
      // Shoulder side bias is applied *after* aim tightening so KeyT
      // mirrors the aimed cam too. shoulderLerp is in [-1, 1] and
      // smoothly animates between sides.
      if (this.cameraMode === 'third-person') {
        aimedOffset.x *= this.shoulderLerp;
      }
      const tuning = {
        ...baseTuning,
        idealOffset: aimedOffset,
        ...(this.isAiming ? { follow: baseTuning.follow * 1.5, look: baseTuning.look * 1.5 } : {}),
      };

      this.tpCamera.yawOffset = 0;
      // Recoil also kicks the TP cam upward by adding to pitchOffset.
      // Subtract because positive pitchOffset rotates the camera offset
      // *down* (the rig orbits up + the camera tilts back to compensate),
      // and we want the view to *raise*. Empirically negative reads as
      // "kick up" in this orbit math.
      const basePitch = this.cameraMode === 'arpg' ? 0 : (this.cameraAngleV - 0.3);
      this.tpCamera.pitchOffset = basePitch - this.recoilPitch;
      this.tpCamera.update(this._lastDt, this.position.clone(), this.cameraAngleH + Math.PI, tuning);

      this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, aimFovTP, 0.12);
      this.camera.updateProjectionMatrix();
    }
  }

  private _lastDt: number = 1 / 60;

  private regenStats(dt: number) {
    const maxSt = this.stats.maxStamina ?? 100;
    const maxMn = this.stats.maxMana;
    if (!this.isRolling && !this.isAttacking) {
      this.stats.stamina = Math.min(maxSt, this.stats.stamina + dt * 12);
    }
    this.stats.mana = Math.min(maxMn, this.stats.mana + dt * 4);
    this.onStatChange?.();
  }

  /**
   * Sync bone-attached weapon models with currently equipped inventory items.
   * Called on every inventory change. Falls back to procedural weapons if no
   * skeleton is bound (procedural player body).
   */
  private syncWeaponAttachments(): void {
    if (!this.inventory || !this.weaponAttachment.hasSkeleton()) return;
    const mainhand = this.inventory.equipped.mainhand;
    const offhand = this.inventory.equipped.offhand;

    if (mainhand) {
      this.weaponAttachment.attachWeapon(mainhand, 'mainhand');
    } else {
      this.weaponAttachment.detachWeapon('mainhand');
    }
    if (offhand) {
      this.weaponAttachment.attachWeapon(offhand, 'offhand');
    } else {
      this.weaponAttachment.detachWeapon('offhand');
    }
  }

  dispose() {
    this.weaponAttachment.dispose();
    this.scene.remove(this.playerGroup);
    this.scene.remove(this.fpCamera);
    if (this.modelMixer) this.modelMixer.stopAllAction();
    if (this.fpHandsMixer) this.fpHandsMixer.stopAllAction();
    if (this.fpHandsGroup) this.fpCamera.remove(this.fpHandsGroup);

    // Tear down Rapier resources so a re-init (new game, character swap)
    // doesn't leak bodies into the world.
    if (this.physics) {
      const world = this.physics.world;
      if (this.rapierController) {
        try { world.removeCharacterController(this.rapierController); } catch { /* already gone */ }
        this.rapierController = null;
      }
      if (this.rapierBody) {
        try { world.removeRigidBody(this.rapierBody); } catch { /* already gone */ }
        this.rapierBody = null;
        this.rapierCollider = null;
      }
    }
  }
}
