/**
 * WeaponAttachment — manages weapon models attached to player skeleton bones.
 *
 * Loads weapon models (GLB/FBX) from prefab definitions, attaches them to the
 * correct bone on the player skeleton (R_hand_container, L_hand_container, etc.),
 * and applies the prefab's boneOffset/boneRotation for correct positioning.
 *
 * Integrates with the loot roll system — equipped items carry RolledAffix[] data
 * from @workspace/game-systems that is displayed in tooltips and applied to stats.
 */
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { createGLTFLoader } from '@/game/loaders/createGLTFLoader';
import { prefabRegistry, type Prefab } from './PrefabRegistry';
import type { InventoryItem } from './Items';
import { ITEM_DATABASE } from './Items';
import { assetUrl } from '@/lib/assetUrl';

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
  ],
  L_hand_container: [
    'Wrist.L', 'Index1.L',
    'L_hand_container',
    'mixamorig:LeftHand', 'mixamorigLeftHand', 'LeftHand',
    'hand_l', 'Hand_L', 'LeftHandIndex1',
    'mixamorig:LeftHandIndex1',
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
  item: InventoryItem;
  /** Prefab definition (if loaded from registry). */
  prefab: Prefab | null;
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

    return null;
  }

  /**
   * Attach a weapon from an InventoryItem to the player skeleton.
   * Uses the prefab registry data for bone slot, offset, rotation, and model path.
   *
   * @param item The equipped inventory item (carries affixes from loot rolls)
   * @param equipSlot Which equipment slot ('mainhand' | 'offhand')
   */
  async attachWeapon(item: InventoryItem, equipSlot: string): Promise<void> {
    // Remove any existing weapon in this slot
    this.detachWeapon(equipSlot);

    // Look up the item definition
    const def = ITEM_DATABASE[item.defId];
    if (!def) return;

    // Try to find a matching prefab for model/bone data
    const prefab = this.findWeaponPrefab(item.defId);
    const prefabData = (prefab?.data ?? {}) as Record<string, unknown>;

    // Determine bone slot
    const boneSlotName = (prefabData.boneSlot as string) ?? 'R_hand_container';
    const bone = this.findBone(boneSlotName);

    if (!bone) {
      console.warn(
        `[WeaponAttachment] No bone found for slot '${boneSlotName}' — ` +
        `cannot attach ${def.name}. Available bones: ${[...this.boneCache.keys()].slice(0, 12).join(', ')}`,
      );
      return;
    }

    // Load the weapon model
    const modelPath = prefab?.modelPath ?? null;
    let model: THREE.Group;

    if (modelPath) {
      model = await this.loadWeaponModel(modelPath, prefab?.scale ?? 1.0);
    } else {
      // Fallback: generate a procedural placeholder
      model = this.buildProceduralWeapon(def.slot === 'offhand' ? 'shield' : 'sword');
    }

    // Apply bone offset and rotation from prefab data
    const offset = prefabData.boneOffset as { x: number; y: number; z: number } | undefined;
    const rotation = prefabData.boneRotation as { x: number; y: number; z: number } | undefined;

    if (offset) model.position.set(offset.x, offset.y, offset.z);
    if (rotation) model.rotation.set(rotation.x * DEG2RAD, rotation.y * DEG2RAD, rotation.z * DEG2RAD);

    // Enable shadows on all meshes
    model.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = false;
      }
    });

    // Parent to bone
    bone.add(model);

    this.attached.set(equipSlot, {
      slot: boneSlotName,
      bone,
      model,
      item,
      prefab,
    });

    // Log affix data if present
    if (item.affixes && item.affixes.length > 0) {
      console.log(
        `[WeaponAttachment] Equipped "${item.generatedName ?? def.name}" (T${item.dropTier ?? '?'}) ` +
        `with ${item.affixes.length} affixes: ${item.affixes.map(a => a.display).join(', ')}`,
      );
    }
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
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x7b3f00, roughness: 0.9 });

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
