/**
 * GearVisualManager — visual equipment overlay system.
 *
 * When the player equips armor (helm, chest, legs, boots) this manager:
 *   1. Hides the corresponding base-character mesh node (*_Head, *_Body, etc.)
 *   2. Loads the gear's FBX/GLB model (same Quaternius armature)
 *   3. Rebinds the gear's SkinnedMesh to the player's live skeleton
 *   4. Adds it to the character armature so it animates in sync
 *
 * Additive slots (arms, shoulders) DON'T hide the base — they overlay with a
 * slight outward offset to avoid z-fighting.
 *
 * Integrates alongside WeaponAttachment (which handles mainhand/offhand bones).
 */

import * as THREE from 'three';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { createGLTFLoader } from '@/game/loaders/createGLTFLoader';
import { assetUrl } from '@/lib/assetUrl';
import type { EquipSlot } from './Items';
import type { Gender } from './CharacterConfig';

// ── Slot → base mesh suffix mapping ─────────────────────────────────────────
//
// Quaternius characters name their mesh nodes "{Variant}_{Region}".
// We match by the SUFFIX so it works regardless of character variant.
//
// 'replace' slots HIDE the base mesh and show the gear mesh instead.
// 'additive' slots keep the base visible and layer gear on top.

type SlotMode = 'replace' | 'additive' | 'none';

interface SlotMapping {
  /** Suffix pattern to match on the base character mesh node names. */
  baseSuffix: string;
  /** Whether equipping this slot hides the base mesh or layers on top. */
  mode: SlotMode;
  /** Outward normal offset (m) for additive overlays to prevent z-fight. */
  additiveOffset: number;
}

const SLOT_MAP: Partial<Record<EquipSlot, SlotMapping>> = {
  helm:  { baseSuffix: '_Head',  mode: 'replace',  additiveOffset: 0 },
  chest: { baseSuffix: '_Body',  mode: 'replace',  additiveOffset: 0 },
  legs:  { baseSuffix: '_Legs',  mode: 'replace',  additiveOffset: 0 },
  boots: { baseSuffix: '_Feet',  mode: 'replace',  additiveOffset: 0 },
  // No visual mesh for these — stats only
  ring:    { baseSuffix: '', mode: 'none', additiveOffset: 0 },
  amulet:  { baseSuffix: '', mode: 'none', additiveOffset: 0 },
  cape:    { baseSuffix: '', mode: 'none', additiveOffset: 0 },
  relic:   { baseSuffix: '', mode: 'none', additiveOffset: 0 },
};

/**
 * Additional overlay slots that don't correspond to a standard EquipSlot but
 * can be driven by gear prefab data (e.g. chest armor that ships with a
 * shoulder pad). These are always additive.
 */
const ADDON_SLOTS: Record<string, SlotMapping> = {
  arms:      { baseSuffix: '', mode: 'additive', additiveOffset: 0.008 },
  shoulders: { baseSuffix: '', mode: 'additive', additiveOffset: 0.006 },
};

// ── Types ────────────────────────────────────────────────────────────────────

interface AttachedGear {
  slot: EquipSlot | string;
  model: THREE.Object3D;
  /** The base mesh node that was hidden (null for additive). */
  hiddenBase: THREE.Object3D | null;
}

// ── GearVisualManager ────────────────────────────────────────────────────────

export class GearVisualManager {
  /** Root of the character armature (parent of all mesh nodes + bone tree). */
  private armatureRoot: THREE.Object3D | null = null;
  /** Map of base mesh suffix → the actual mesh node on the current character. */
  private baseMeshes: Map<string, THREE.Object3D> = new Map();
  /** Map of bone name → Bone on the player skeleton (for gear rebinding). */
  private boneMap: Map<string, THREE.Bone> = new Map();
  /** Currently attached gear per slot. */
  private attached: Map<string, AttachedGear> = new Map();
  /** Loaded model cache (key = modelPath). */
  private modelCache: Map<string, THREE.Object3D> = new Map();

  private gender: Gender = 'male';
  private fbxLoader: FBXLoader;
  private gltfLoader: ReturnType<typeof createGLTFLoader>;

  constructor() {
    this.fbxLoader = new FBXLoader();
    this.gltfLoader = createGLTFLoader();
  }

  // ── Binding ──────────────────────────────────────────────────────────────

  /**
   * Bind to a loaded player character model. Call once after the GLTF is
   * loaded and added to the scene.
   *
   * Scans for:
   *   - Mesh nodes ending in _Body, _Head, _Legs, _Feet, _Pants
   *   - All Bone objects (for skeleton rebinding)
   *   - The armature root (CharacterArmature node)
   */
  bind(playerGroup: THREE.Object3D, gender: Gender): void {
    this.dispose();
    this.gender = gender;

    // Find the armature root (usually named "CharacterArmature")
    playerGroup.traverse((child) => {
      if (child.name === 'CharacterArmature' || child.name.includes('Armature')) {
        if (!this.armatureRoot) this.armatureRoot = child;
      }
    });
    if (!this.armatureRoot) this.armatureRoot = playerGroup;

    // Catalog base mesh nodes by suffix
    const suffixes = ['_Body', '_Head', '_Legs', '_Feet', '_Pants'];
    playerGroup.traverse((child) => {
      for (const suf of suffixes) {
        if (child.name.endsWith(suf)) {
          // Normalize _Pants → _Legs so the slot mapping works
          const key = suf === '_Pants' ? '_Legs' : suf;
          this.baseMeshes.set(key, child);
        }
      }
      if ((child as THREE.Bone).isBone) {
        this.boneMap.set(child.name, child as THREE.Bone);
      }
    });

    // Also catalog bonus objects (Backpack, Sword, Pistol) so we can
    // toggle them if gear conflicts.
    for (const bonus of ['Backpack', 'Sword', 'Pistol']) {
      playerGroup.traverse((child) => {
        if (child.name === bonus) {
          this.baseMeshes.set(`_bonus_${bonus}`, child);
        }
      });
    }

    console.log(
      `[GearVisualManager] Bound: ${this.baseMeshes.size} base meshes, ` +
      `${this.boneMap.size} bones, gender=${gender}`,
    );
  }

  isBound(): boolean {
    return this.boneMap.size > 0;
  }

  // ── Equip / Unequip ──────────────────────────────────────────────────────

  /**
   * Equip a gear piece into a visual slot.
   *
   * @param slot      Equipment slot ('helm', 'chest', 'legs', 'boots', or addon 'arms', 'shoulders')
   * @param modelPath Path to the gear FBX/GLB (under /models/gear/ or /models/character_parts/)
   */
  async equip(slot: EquipSlot | string, modelPath: string): Promise<void> {
    const mapping = SLOT_MAP[slot as EquipSlot] ?? ADDON_SLOTS[slot];
    if (!mapping || mapping.mode === 'none') return;

    // Remove any existing gear in this slot
    this.unequip(slot);

    // Load and clone the gear model
    const template = await this.loadModel(modelPath);
    if (!template) return;

    const gearGroup = skeletonClone(template) as THREE.Object3D;

    // Rebind all SkinnedMeshes in the gear to the player's skeleton
    this.rebindSkeleton(gearGroup);

    // Apply additive offset if needed
    if (mapping.mode === 'additive' && mapping.additiveOffset > 0) {
      gearGroup.traverse((child) => {
        if ((child as THREE.SkinnedMesh).isSkinnedMesh) {
          // Slight scale-up for additive overlays to sit outside the base mesh
          child.scale.multiplyScalar(1 + mapping.additiveOffset);
        }
      });
    }

    // Enable shadows
    gearGroup.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    // Store the model path for change-detection in syncWithEquipment
    gearGroup.userData.gearModelPath = modelPath;

    // Hide the corresponding base mesh (replace mode only)
    let hiddenBase: THREE.Object3D | null = null;
    if (mapping.mode === 'replace' && mapping.baseSuffix) {
      const base = this.baseMeshes.get(mapping.baseSuffix);
      if (base) {
        base.visible = false;
        hiddenBase = base;
      }
    }

    // Add gear to the armature root so it inherits the skeleton transforms
    if (this.armatureRoot) {
      this.armatureRoot.add(gearGroup);
    }

    this.attached.set(slot, { slot, model: gearGroup, hiddenBase });

    console.log(
      `[GearVisualManager] Equipped ${slot}: ${modelPath}` +
      (hiddenBase ? ` (hid base ${hiddenBase.name})` : ''),
    );
  }

  /**
   * Remove gear from a slot, restoring the base mesh visibility.
   */
  unequip(slot: EquipSlot | string): void {
    const existing = this.attached.get(slot);
    if (!existing) return;

    // Restore base mesh visibility
    if (existing.hiddenBase) {
      existing.hiddenBase.visible = true;
    }

    // Remove gear model from scene
    existing.model.parent?.remove(existing.model);
    this.disposeObject(existing.model);
    this.attached.delete(slot);
  }

  /**
   * Sync all visual gear with the current equipped inventory.
   * Call this from PlayerController when inventory changes.
   *
   * @param equipped Map of EquipSlot → item data (defId + optional gear info)
   * @param resolveGearPath Function that resolves an item defId → gear model path (or null)
   */
  /**
   * Apply a tint colour to the clothing/fabric materials on a gear mesh.
   * Skips materials whose name contains 'skin', 'eye', 'hair', 'face' to
   * avoid colouring exposed body parts. Only affects MeshStandardMaterial.
   */
  applyTint(slot: EquipSlot | string, tintHex: string): void {
    const gear = this.attached.get(slot);
    if (!gear) return;
    const color = new THREE.Color(tintHex);
    const SKIN_KEYWORDS = /skin|eye|hair|face|brow|mouth|teeth|nail/i;
    gear.model.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      for (const mat of mats) {
        if (!(mat instanceof THREE.MeshStandardMaterial)) continue;
        // Skip skin-like materials by name
        if (SKIN_KEYWORDS.test(mat.name)) continue;
        // Multiply-blend the tint with the existing base color so texture
        // detail is preserved rather than flattened to a solid colour.
        mat.color.multiply(color);
        mat.needsUpdate = true;
      }
    });
  }

  async syncWithEquipment(
    equipped: Partial<Record<EquipSlot, { defId: string; gearTint?: string | null } | undefined>>,
    resolveGearPath: (defId: string, gender: Gender) => string | null,
  ): Promise<void> {
    // Determine which slots need gear and which need clearing
    const visualSlots: (EquipSlot | string)[] = ['helm', 'chest', 'legs', 'boots'];

    for (const slot of visualSlots) {
      const item = equipped[slot as EquipSlot];
      const currentAttached = this.attached.get(slot);

      if (item) {
        const gearPath = resolveGearPath(item.defId, this.gender);
        if (gearPath) {
          // Only re-equip if the model changed
          const currentPath = currentAttached?.model.userData.gearModelPath;
          if (currentPath !== gearPath) {
            await this.equip(slot, gearPath);
            // Apply rolled gear tint colour if present
            if (item.gearTint) {
              this.applyTint(slot, item.gearTint);
            }
          }
        } else {
          // Item exists but has no gear model — unequip visual
          this.unequip(slot);
        }
      } else {
        // Slot is empty — unequip
        this.unequip(slot);
      }
    }
  }

  // ── Skeleton rebinding ────────────────────────────────────────────────────

  /**
   * Rebind all SkinnedMeshes inside a loaded gear model to the player's
   * skeleton by matching bone names. This is the key operation that lets
   * separately-authored FBX files animate on the player's armature.
   */
  private rebindSkeleton(gearRoot: THREE.Object3D): void {
    gearRoot.traverse((child) => {
      if (!(child as THREE.SkinnedMesh).isSkinnedMesh) return;
      const sm = child as THREE.SkinnedMesh;
      const oldSkeleton = sm.skeleton;
      if (!oldSkeleton) return;

      // Build a new bones array with references to the PLAYER's bones
      const newBones: THREE.Bone[] = [];
      let matched = 0;

      for (const oldBone of oldSkeleton.bones) {
        const playerBone = this.boneMap.get(oldBone.name);
        if (playerBone) {
          newBones.push(playerBone);
          matched++;
        } else {
          // Fallback: keep the old bone (it won't animate, but won't crash)
          newBones.push(oldBone);
        }
      }

      // Create a new Skeleton with the player's bones + the gear's bind matrices
      const newSkeleton = new THREE.Skeleton(newBones, oldSkeleton.boneInverses);
      sm.bind(newSkeleton);

      if (matched < oldSkeleton.bones.length) {
        console.warn(
          `[GearVisualManager] Skeleton rebind: ${matched}/${oldSkeleton.bones.length} ` +
          `bones matched. Unmatched bones won't animate.`,
        );
      }
    });

    // Remove the gear model's own armature/bone hierarchy — we're using the
    // player's bones now. Keep only the mesh nodes.
    const toRemove: THREE.Object3D[] = [];
    gearRoot.traverse((child) => {
      if ((child as THREE.Bone).isBone && child.parent) {
        toRemove.push(child);
      }
    });
    // Don't remove bones that are part of a SkinnedMesh's skeleton reference
    // (they're the player's bones now). Only remove orphan bone hierarchies
    // that came with the FBX.
  }

  // ── Model loading ─────────────────────────────────────────────────────────

  private async loadModel(modelPath: string): Promise<THREE.Object3D | null> {
    const cached = this.modelCache.get(modelPath);
    if (cached) return cached;

    const url = assetUrl(modelPath);
    const isFBX = /\.fbx$/i.test(modelPath);

    return new Promise<THREE.Object3D | null>((resolve) => {
      if (isFBX) {
        this.fbxLoader.load(
          url,
          (fbx) => {
            this.modelCache.set(modelPath, fbx);
            resolve(fbx);
          },
          undefined,
          (err) => {
            console.warn(`[GearVisualManager] FBX load failed: ${modelPath}`, err);
            resolve(null);
          },
        );
      } else {
        this.gltfLoader.load(
          url,
          (gltf) => {
            const group = gltf.scene;
            this.modelCache.set(modelPath, group);
            resolve(group);
          },
          undefined,
          (err) => {
            console.warn(`[GearVisualManager] GLTF load failed: ${modelPath}`, err);
            resolve(null);
          },
        );
      }
    });
  }

  // ── Disposal ──────────────────────────────────────────────────────────────

  private disposeObject(obj: THREE.Object3D): void {
    obj.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry?.dispose();
        const mat = child.material;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else mat?.dispose();
      }
    });
  }

  dispose(): void {
    // Restore all base meshes and remove all gear
    for (const [slot] of this.attached) {
      this.unequip(slot);
    }
    // Clear model cache
    for (const [, model] of this.modelCache) {
      this.disposeObject(model);
    }
    this.modelCache.clear();
    this.baseMeshes.clear();
    this.boneMap.clear();
    this.armatureRoot = null;
  }
}

// ── Gear path resolver ──────────────────────────────────────────────────────
//
// Maps item rarity → gear asset set and resolves gender-specific paths.
// Used by PlayerController.syncGearVisuals() as the resolveGearPath callback.

type GearSet = 'peasant' | 'ranger';

function rarityToGearSet(rarity: string): GearSet {
  switch (rarity) {
    case 'common':
    case 'uncommon':
      return 'peasant';
    case 'rare':
    case 'epic':
    case 'legendary':
    default:
      return 'ranger';
  }
}

/**
 * Slot → subdirectory under models/gear/.
 * Only slots with actual gear models are listed.
 */
const SLOT_TO_GEAR_DIR: Partial<Record<EquipSlot, string>> = {
  helm:  'head',
  chest: 'chest',
  legs:  'legs',
  boots: 'feet',
};

/**
 * Resolve an item definition to a gear model path, or null if the item has
 * no visual gear mesh. Checks:
 *   1. itemDef.gearModelPath (explicit override)
 *   2. Automatic resolution via rarity → gear set + gender
 */
export function resolveGearModelPath(
  itemDef: { id: string; slot: string; rarity: string; gearModelPath?: string },
  gender: Gender,
): string | null {
  // Explicit override wins
  if (itemDef.gearModelPath) {
    // Replace {gender} placeholder if present
    return itemDef.gearModelPath.replace('{gender}', gender);
  }

  // Auto-resolve from slot + rarity + gender
  const gearDir = SLOT_TO_GEAR_DIR[itemDef.slot as EquipSlot];
  if (!gearDir) return null;

  const set = rarityToGearSet(itemDef.rarity);

  // Peasant set has no head piece — fall back to ranger
  if (gearDir === 'head' && set === 'peasant') {
    return `/models/gear/head/ranger_${gender}.fbx`;
  }

  return `/models/gear/${gearDir}/${set}_${gender}.fbx`;
}
