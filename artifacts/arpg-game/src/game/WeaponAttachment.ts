/**
 * WeaponAttachment — manages weapon / tool models on player hand bones.
 *
 * Sources (in order):
 *   1. Prefab registry bone + model data
 *   2. HandToolCatalog (combat WEAPONS + Survival tools / melee)
 *   3. SURVIVAL_ITEMS.modelPath
 *   4. Procedural mesh by tool family (axe, pickaxe, sword, …)
 *
 * Used for combat swings and harvest chops — same hand mesh for both.
 */
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { createGLTFLoader } from '@/game/loaders/createGLTFLoader';
import { prefabRegistry, type Prefab } from './PrefabRegistry';
import type { InventoryItem } from './Items';
import { ITEM_DATABASE } from './Items';
import { assetUrl } from '@/lib/assetUrl';
import { getHandToolDef, type HandToolDef } from './HandToolCatalog';
import { SURVIVAL_ITEMS } from './survival/SurvivalItems';
import type { WeaponStats } from './types';

// ── Bone name variants (Mixamo, Unreal, generic) ────────────────────────

/** Candidate bone names for each logical attachment slot. Tried in order. */
const BONE_CANDIDATES: Record<string, string[]> = {
  R_hand_container: [
    // Quaternius "Ultimate Animated Character" (Blender .L/.R convention)
    'Wrist.R', 'Index1.R',
    // Custom containers
    'R_hand_container',
    // Mixamo variants
    'mixamorig:RightHand', 'mixamorigRightHand', 'RightHand',
    // Unreal mannequin
    'hand_r', 'Hand_R', 'RightHandIndex1',
    'mixamorig:RightHandIndex1',
    // Bip001
    'Bip001 R Hand', 'Bip001_R_Hand',
    // Toon soldiers (chicken_gun Bone hierarchy — discovered leaf of right arm)
    'Bone.007', 'Bone.007_119', 'Bone.005', 'Bone.005_120',
  ],
  L_hand_container: [
    'Wrist.L', 'Index1.L',
    'L_hand_container',
    'mixamorig:LeftHand', 'mixamorigLeftHand', 'LeftHand',
    'hand_l', 'Hand_L', 'LeftHandIndex1',
    'mixamorig:LeftHandIndex1',
    'Bip001 L Hand', 'Bip001_L_Hand',
    'Bone.006', 'Bone.006_116', 'Bone.003', 'Bone.003_117',
  ],
  L_shield_container: [
    'LowerArm.L',
    'L_shield_container',
    'mixamorig:LeftForeArm', 'mixamorigLeftForeArm', 'LeftForeArm',
    'lowerarm_l', 'ForeArm_L',
  ],
  back_container: [
    'Chest', 'Torso',
    'back_container',
    'mixamorig:Spine2', 'mixamorigSpine2', 'Spine2',
    'spine_03', 'Spine_2',
  ],
};

/** Degree-to-radian for prefab rotation values (stored as degrees). */
const DEG2RAD = Math.PI / 180;

// ── Types ────────────────────────────────────────────────────────────────

export interface AttachedWeapon {
  /** Slot this weapon is attached to (e.g. 'R_hand_container'). */
  slot: string;
  /** The bone object it's parented to. */
  bone: THREE.Bone;
  /** The weapon model group (child of bone). */
  model: THREE.Group;
  /** The inventory item driving this attachment (carries affixes). */
  item: InventoryItem | null;
  /** Prefab definition (if loaded from registry). */
  prefab: Prefab | null;
  /** Resolved hand-tool metadata (harvest + grip). */
  toolDef: HandToolDef | null;
  /** Def / weapon id used to load this mesh. */
  sourceId: string;
}

// ── WeaponAttachment class ───────────────────────────────────────────────

export class WeaponAttachment {
  private skeleton: THREE.Skeleton | null = null;
  private skeletonRoot: THREE.Object3D | null = null;
  private boneCache: Map<string, THREE.Bone> = new Map();
  private attached: Map<string, AttachedWeapon> = new Map(); // keyed by equip slot
  private fbxLoader: FBXLoader;
  private gltfLoader: ReturnType<typeof createGLTFLoader>;
  private modelCache: Map<string, THREE.Group> = new Map();

  constructor() {
    this.fbxLoader = new FBXLoader();
    this.gltfLoader = createGLTFLoader();
  }

  /**
   * Bind to a player model's skeleton. Call after the player GLTF is loaded.
   * Scans all bones and caches them for fast lookup.
   */
  bindSkeleton(playerGroup: THREE.Object3D): void {
    this.skeleton = null;
    this.skeletonRoot = playerGroup;
    this.boneCache.clear();

    playerGroup.traverse((child) => {
      if ((child as THREE.SkinnedMesh).isSkinnedMesh) {
        const sm = child as THREE.SkinnedMesh;
        if (sm.skeleton && !this.skeleton) {
          this.skeleton = sm.skeleton;
        }
      }
      if ((child as THREE.Bone).isBone) {
        this.boneCache.set(child.name, child as THREE.Bone);
      }
    });

    if (this.boneCache.size > 0) {
      console.log(
        `[WeaponAttachment] Bound to skeleton with ${this.boneCache.size} bones. ` +
        `Sample: ${[...this.boneCache.keys()].slice(0, 8).join(', ')}`,
      );
    } else {
      console.warn('[WeaponAttachment] No bones found on player model — weapon attachment disabled.');
    }
  }

  /**
   * Find a bone by logical slot name, trying all known variants.
   */
  findBone(logicalSlot: string): THREE.Bone | null {
    // Direct cache hit
    const direct = this.boneCache.get(logicalSlot);
    if (direct) return direct;

    // Try candidates
    const candidates = BONE_CANDIDATES[logicalSlot];
    if (candidates) {
      for (const name of candidates) {
        const bone = this.boneCache.get(name);
        if (bone) return bone;
      }
    }

    // Fuzzy: case-insensitive search for the slot keyword
    const keyword = logicalSlot.toLowerCase().replace(/_container$/, '');
    for (const [name, bone] of this.boneCache) {
      if (name.toLowerCase().includes(keyword)) return bone;
    }

    // Toon soldiers: resolve hand from hierarchy discovery
    if (this.skeletonRoot && (logicalSlot === 'R_hand_container' || logicalSlot === 'L_hand_container')) {
      try {
        // Dynamic import avoided — inline leaf search on largest skeleton
        const bones = [...this.boneCache.values()];
        const hips = bones.find((b) => b.children.filter((c) => (c as THREE.Bone).isBone).length >= 3);
        if (hips) {
          // Prefer deepest bone with world X sign matching side
          let best: THREE.Bone | null = null;
          let bestDepth = -1;
          const wantRight = logicalSlot.startsWith('R');
          const walk = (b: THREE.Bone, depth: number) => {
            const kids = b.children.filter((c) => (c as THREE.Bone).isBone) as THREE.Bone[];
            if (!kids.length) {
              const wp = new THREE.Vector3();
              b.getWorldPosition(wp);
              const isRight = wp.x >= 0;
              if ((wantRight ? isRight : !isRight) && depth > bestDepth) {
                best = b;
                bestDepth = depth;
              }
              return;
            }
            for (const k of kids) walk(k, depth + 1);
          };
          walk(hips, 0);
          if (best) return best;
        }
      } catch { /* ignore */ }
    }

    return null;
  }

  /**
   * Attach a weapon from an InventoryItem to the player skeleton.
   * Uses prefab registry + HandToolCatalog + survival model paths.
   */
  async attachWeapon(item: InventoryItem, equipSlot: string): Promise<void> {
    const sourceId = item.defId;
    const weaponId = ITEM_DATABASE[sourceId]?.weaponId ?? sourceId;
    await this.attachById(weaponId || sourceId, equipSlot, item);
  }

  /**
   * Attach from combat loadout WeaponStats (primary/secondary hotbar).
   * Keeps a mesh in the hand even when inventory mainhand is empty.
   */
  async attachWeaponStats(weapon: WeaponStats, equipSlot: string = 'mainhand'): Promise<void> {
    await this.attachById(weapon.id, equipSlot, null);
  }

  /**
   * Attach any known tool / weapon id (combat, survival, prefab).
   */
  async attachById(
    sourceId: string,
    equipSlot: string,
    item: InventoryItem | null = null,
  ): Promise<void> {
    this.detachWeapon(equipSlot);

    const toolDef = getHandToolDef(sourceId);
    const prefab = this.findWeaponPrefab(sourceId);
    const prefabData = (prefab?.data ?? {}) as Record<string, unknown>;
    const itemDef = ITEM_DATABASE[sourceId];

    const boneSlotName =
      (prefabData.boneSlot as string) ??
      toolDef?.boneSlot ??
      (itemDef?.slot === 'offhand' ? 'L_hand_container' : 'R_hand_container');

    const bone = this.findBone(boneSlotName);
    if (!bone) {
      console.warn(
        `[WeaponAttachment] No bone for '${boneSlotName}' — cannot attach ${sourceId}. ` +
          `Bones: ${[...this.boneCache.keys()].slice(0, 12).join(', ')}`,
      );
      return;
    }

    // Model path resolution chain
    const survivalPath = SURVIVAL_ITEMS[sourceId]?.modelPath ?? toolDef?.modelPath ?? null;
    const modelPath = prefab?.modelPath ?? survivalPath;
    const gripScale = toolDef?.grip.scale ?? prefab?.scale ?? 1.0;

    let model: THREE.Group;
    if (modelPath) {
      model = await this.loadWeaponModel(modelPath, gripScale);
      // Survival FBX packs are often huge — fit to ~0.55–0.85 m held length
      this.normalizeHeldModel(model, toolDef?.procedural === 'gun' ? 0.35 : 0.7);
    } else {
      model = this.buildProceduralWeapon(toolDef?.procedural ?? (itemDef?.slot === 'offhand' ? 'shield' : 'sword'));
      model.scale.setScalar(gripScale);
    }

    // Grip: prefab override → hand catalog → defaults
    const offset =
      (prefabData.boneOffset as { x: number; y: number; z: number } | undefined) ??
      toolDef?.grip.offset;
    const rotation =
      (prefabData.boneRotation as { x: number; y: number; z: number } | undefined) ??
      toolDef?.grip.rotation;

    if (offset) model.position.set(offset.x, offset.y, offset.z);
    if (rotation) {
      // Prefab rotations are degrees; catalog uses degrees too
      model.rotation.set(rotation.x * DEG2RAD, rotation.y * DEG2RAD, rotation.z * DEG2RAD);
    } else {
      model.rotation.set(-Math.PI / 2, 0, 0);
    }

    model.name = `held_${sourceId}`;
    model.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = false;
      }
    });

    bone.add(model);

    this.attached.set(equipSlot, {
      slot: boneSlotName,
      bone,
      model,
      item,
      prefab,
      toolDef,
      sourceId,
    });

    if (item?.affixes && item.affixes.length > 0) {
      console.log(
        `[WeaponAttachment] Equipped "${item.generatedName ?? sourceId}" ` +
          `with ${item.affixes.length} affixes`,
      );
    } else {
      console.log(`[WeaponAttachment] Attached ${sourceId} → ${boneSlotName} (${bone.name})`);
    }
  }

  /** Active tool metadata for harvest / combat (mainhand preferred). */
  getMainhandTool(): HandToolDef | null {
    return this.attached.get('mainhand')?.toolDef ?? null;
  }

  getMainhandSourceId(): string | null {
    return this.attached.get('mainhand')?.sourceId ?? null;
  }

  /** World-space tip of the held weapon (for VFX / harvest sweeps). */
  getWeaponTipWorld(out = new THREE.Vector3()): THREE.Vector3 | null {
    const att = this.attached.get('mainhand');
    if (!att) return null;
    // Approximate tip: model local +Y after grip rotation
    out.set(0, 0.55, 0);
    att.model.localToWorld(out);
    return out;
  }

  /** Fit held props so giant FBX exports don't swallow the character. */
  private normalizeHeldModel(model: THREE.Group, targetLength = 0.7): void {
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    box.getSize(size);
    const longest = Math.max(size.x, size.y, size.z);
    if (longest > 0.01 && longest > targetLength * 1.4) {
      model.scale.multiplyScalar(targetLength / longest);
    }
    // Re-center so grip sits near local origin
    model.updateMatrixWorld(true);
    const box2 = new THREE.Box3().setFromObject(model);
    const center = new THREE.Vector3();
    box2.getCenter(center);
    model.position.sub(center);
    // Nudge so the lower end is near the palm
    const size2 = new THREE.Vector3();
    box2.getSize(size2);
    model.position.y += size2.y * 0.15;
  }

  /**
   * Remove a weapon from the given equipment slot.
   */
  detachWeapon(equipSlot: string): void {
    const existing = this.attached.get(equipSlot);
    if (!existing) return;

    existing.bone.remove(existing.model);
    // Dispose geometries and materials
    existing.model.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry?.dispose();
        const mat = child.material;
        if (Array.isArray(mat)) mat.forEach(m => m.dispose());
        else mat?.dispose();
      }
    });
    this.attached.delete(equipSlot);
  }

  /**
   * Detach all weapons.
   */
  detachAll(): void {
    for (const slot of [...this.attached.keys()]) {
      this.detachWeapon(slot);
    }
  }

  /**
   * Get the attached weapon for a slot.
   */
  getAttached(equipSlot: string): AttachedWeapon | null {
    return this.attached.get(equipSlot) ?? null;
  }

  /**
   * Check if the skeleton has been bound.
   */
  hasSkeleton(): boolean {
    return this.boneCache.size > 0;
  }

  /**
   * List all available bone names (for debugging).
   */
  getBoneNames(): string[] {
    return [...this.boneCache.keys()];
  }

  // ── Private helpers ────────────────────────────────────────────────────

  private findWeaponPrefab(defId: string): Prefab | null {
    // Direct lookup by item def ID
    let prefab = prefabRegistry.getById(defId);
    if (prefab) return prefab;

    // Search weapon prefabs by matching weapon type
    const weapons = prefabRegistry.getByKind('weapon');
    return weapons.find(p => p.id === defId) ?? null;
  }

  private async loadWeaponModel(modelPath: string, scale: number): Promise<THREE.Group> {
    // Check cache
    const cached = this.modelCache.get(modelPath);
    if (cached) {
      const clone = cached.clone();
      clone.scale.setScalar(scale);
      return clone;
    }

    const url = assetUrl(modelPath);
    const isFBX = /\.fbx$/i.test(modelPath);

    return new Promise<THREE.Group>((resolve) => {
      if (isFBX) {
        this.fbxLoader.load(
          url,
          (fbx) => {
            fbx.scale.setScalar(scale);
            this.modelCache.set(modelPath, fbx.clone());
            resolve(fbx);
          },
          undefined,
          (err) => {
            console.warn(`[WeaponAttachment] FBX load failed: ${modelPath}`, err);
            resolve(this.buildProceduralWeapon('sword'));
          },
        );
      } else {
        this.gltfLoader.load(
          url,
          (gltf) => {
            const group = gltf.scene as THREE.Group;
            group.scale.setScalar(scale);
            this.modelCache.set(modelPath, group.clone());
            resolve(group);
          },
          undefined,
          (err) => {
            console.warn(`[WeaponAttachment] GLTF load failed: ${modelPath}`, err);
            resolve(this.buildProceduralWeapon('sword'));
          },
        );
      }
    });
  }

  private buildProceduralWeapon(type: string): THREE.Group {
    const group = new THREE.Group();
    const metalMat = new THREE.MeshStandardMaterial({ color: 0x8888aa, roughness: 0.3, metalness: 0.8 });
    const steelMat = new THREE.MeshStandardMaterial({ color: 0x666677, roughness: 0.35, metalness: 0.9 });
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x7b3f00, roughness: 0.9 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x2a2a30, roughness: 0.6, metalness: 0.4 });

    switch (type) {
      case 'sword': {
        const blade = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.7, 0.01), metalMat);
        blade.position.y = 0.35;
        const guard = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.03, 0.03), metalMat);
        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.12, 0.025), woodMat);
        grip.position.y = -0.06;
        group.add(blade, guard, grip);
        break;
      }
      case 'axe': {
        const haft = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.72, 8), woodMat);
        haft.position.y = 0.28;
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.04), steelMat);
        head.position.set(0.08, 0.58, 0);
        group.add(haft, head);
        break;
      }
      case 'hatchet': {
        const haft = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.018, 0.42, 8), woodMat);
        haft.position.y = 0.16;
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.03), steelMat);
        head.position.set(0.06, 0.34, 0);
        group.add(haft, head);
        break;
      }
      case 'pickaxe': {
        const haft = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.02, 0.7, 8), woodMat);
        haft.position.y = 0.28;
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.05, 0.04), steelMat);
        head.position.set(0, 0.58, 0);
        const tipL = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.12, 6), steelMat);
        tipL.rotation.z = Math.PI / 2;
        tipL.position.set(-0.2, 0.58, 0);
        const tipR = tipL.clone();
        tipR.rotation.z = -Math.PI / 2;
        tipR.position.set(0.2, 0.58, 0);
        group.add(haft, head, tipL, tipR);
        break;
      }
      case 'knife': {
        const blade = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.28, 0.008), metalMat);
        blade.position.y = 0.16;
        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.1, 0.02), woodMat);
        grip.position.y = -0.02;
        group.add(blade, grip);
        break;
      }
      case 'mace': {
        const haft = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.5, 8), woodMat);
        haft.position.y = 0.18;
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), steelMat);
        head.position.y = 0.48;
        group.add(haft, head);
        break;
      }
      case 'bat': {
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.02, 0.75, 8), woodMat);
        body.position.y = 0.3;
        group.add(body);
        break;
      }
      case 'shovel': {
        const haft = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.018, 0.75, 8), woodMat);
        haft.position.y = 0.3;
        const blade = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.18, 0.015), steelMat);
        blade.position.y = 0.72;
        group.add(haft, blade);
        break;
      }
      case 'gun': {
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, 0.22), darkMat);
        body.position.set(0, 0.04, 0.08);
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.16, 8), steelMat);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(0, 0.05, 0.22);
        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.1, 0.04), woodMat);
        grip.position.set(0, -0.04, 0.02);
        group.add(body, barrel, grip);
        break;
      }
      case 'shield': {
        const face = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.03, 8), metalMat);
        face.rotation.x = Math.PI / 2;
        group.add(face);
        break;
      }
      default: {
        const box = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.6, 0.04), metalMat);
        group.add(box);
      }
    }

    return group;
  }

  dispose(): void {
    this.detachAll();
    for (const [, model] of this.modelCache) {
      model.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry?.dispose();
          const mat = child.material;
          if (Array.isArray(mat)) mat.forEach(m => m.dispose());
          else mat?.dispose();
        }
      });
    }
    this.modelCache.clear();
    this.boneCache.clear();
    this.skeleton = null;
  }
}
