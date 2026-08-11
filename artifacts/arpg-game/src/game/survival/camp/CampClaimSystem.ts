/**
 * CampClaimSystem — SURVIVAL / GRUDGES era only.
 *
 * DO NOT import this from Warlords (grudge-builder) or Warlords-era fleet code.
 * Warlords uses its own island / home-block systems. This module owns:
 *
 *   1. Claim Flag placement → camp anchor + unarmed race-variant guardian
 *   2. Benches at camp → professional crafting XP & craft tier access
 *   3. Buildings at camp → NPC AI ability buffs + harvest profession rate
 *
 * Era: 'survival' | 'nexus-grudges'
 * Host: survival.grudge-studio.com / grudges.grudge-studio.com
 */

import * as THREE from 'three';
import { createGLTFLoader } from '@/game/loaders/createGLTFLoader';
import type { CharacterConfig } from '../../CharacterConfig';
import { BODY_TYPES } from '../../CharacterConfig';
import { isToonBodyId, toonDef } from '../../toon/ToonSurvivalRoster';
import { loadRetargetedToonClips } from '../../toon/loadToonClips';
import { normalizeToonHeight } from '../../toon/toonBoneRetarget';
import { ProfessionsService } from '../../progression/ProfessionsService';
import type { Profession } from '../../progression/Professions';

// ── Item ids that act as claim flags / benches / camp buildings ─────────────

/** Placing any of these claims the camp (first placement wins as primary). */
export const CLAIM_FLAG_ITEM_IDS = new Set([
  'orc_flag',
  'claim_flag',
  'craft_claim_flag',
  'faction_banner',
]);

/** Crafting benches — unlock professional craft tiers + profession XP aura. */
export const CAMP_BENCH_ITEM_IDS: Record<string, Profession | 'crafting'> = {
  // generic workbench → crafting profession
  workbench: 'crafting',
  orc_workbench: 'crafting',
  mb_workbench: 'crafting',
  mb_anvil: 'crafting',
  mb_bench: 'crafting',
  // chemistry / cooking
  orc_pot_1: 'chemistry',
  cauldron: 'chemistry',
  cooking_rack: 'chemistry',
  // gathering / wood
  orc_barrel_1: 'gathering',
  wt_barrel: 'gathering',
  // combat gear forge (if present)
  forge: 'crafting',
  anvil: 'crafting',
  // survival prep
  drying_rack: 'survival',
  campfire: 'chemistry',
};

/** Camp buildings that buff AI + harvest (not modular shell walls). */
export const CAMP_BUILDING_ITEM_IDS = new Set([
  'orc_drum_1',       // war drum — morale / AI aggression
  'orc_torch_1',      // torch — vision / sentry AI
  'orc_barrel_1',     // storage — harvest capacity
  'orc_pot_1',        // cauldron — chemistry rate
  'wt_barrel',
  'mb_foundation',    // each foundation counts as structure mass
  'mb_wall',
  'mb_wall_door',
  'mb_wall_window',
  'mb_wall_corner',
  'mb_floor',
  'mb_stairs',
  'mb_roof',
  'build_logging_camp',
  'build_storage_crate',
  'build_tent_personal',
  'build_campfire',
]);

export const CAMP_RADIUS_M = 80;
export const ERA_ID = 'survival' as const;

// ── State ───────────────────────────────────────────────────────────────────

export interface CampBenchRecord {
  itemId: string;
  profession: Profession | 'crafting';
  position: THREE.Vector3;
  /** Profession XP granted per craft completed at this bench. */
  craftXpBonus: number;
  /** Max recipe tier unlockable while near this bench (1–4). */
  craftTier: number;
}

export interface CampBuildingRecord {
  itemId: string;
  position: THREE.Vector3;
  /** Additive harvest rate multiplier contribution (e.g. 0.05 = +5%). */
  harvestBonus: number;
  /** Additive NPC AI ability score (0–1 scale stack). */
  aiAbilityBonus: number;
}

export interface CampGuardian {
  id: string;
  mesh: THREE.Object3D;
  mixer: THREE.AnimationMixer | null;
  /** Player bodyProportion / race id this guardian mirrors (unarmed). */
  raceBodyId: string;
  unarmed: true;
}

export interface CampClaimSnapshot {
  era: typeof ERA_ID;
  claimed: boolean;
  flagX: number;
  flagY: number;
  flagZ: number;
  raceBodyId: string;
  benches: Array<{ itemId: string; profession: string; x: number; y: number; z: number; craftXpBonus: number; craftTier: number }>;
  buildings: Array<{ itemId: string; x: number; y: number; z: number; harvestBonus: number; aiAbilityBonus: number }>;
}

export interface CampBuffs {
  /** Multiplier on harvest / camp production (1.0 = baseline). */
  harvestRateMult: number;
  /** Multiplier on NPC combat damage & reaction speed. */
  aiAbilityMult: number;
  /** Profession XP bonus when crafting at a camp bench. */
  craftXpMult: number;
  /** Highest craft tier unlocked by any camp bench. */
  maxCraftTier: number;
  /** True if player is within camp radius. */
  inCamp: boolean;
  claimed: boolean;
  campCenter: THREE.Vector3 | null;
  radius: number;
  benchCount: number;
  buildingCount: number;
  guardianPresent: boolean;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function isClaimFlag(itemId: string): boolean {
  return CLAIM_FLAG_ITEM_IDS.has(itemId) || /claim.?flag|faction.?banner|orc_flag/i.test(itemId);
}

function isBench(itemId: string): Profession | 'crafting' | null {
  if (CAMP_BENCH_ITEM_IDS[itemId]) return CAMP_BENCH_ITEM_IDS[itemId];
  if (/workbench|anvil|forge|bench/i.test(itemId)) return 'crafting';
  if (/cauldron|pot|cook|campfire|drying/i.test(itemId)) return 'chemistry';
  return null;
}

function buildingHarvestBonus(itemId: string): number {
  if (/logging|mine|farm|storage_crate|barrel/i.test(itemId)) return 0.08;
  if (/foundation|floor|roof/i.test(itemId)) return 0.01;
  if (/wall|door|window|corner/i.test(itemId)) return 0.005;
  if (/drum|torch|tent/i.test(itemId)) return 0.03;
  if (CAMP_BUILDING_ITEM_IDS.has(itemId)) return 0.02;
  return 0;
}

function buildingAiBonus(itemId: string): number {
  if (/drum/i.test(itemId)) return 0.12; // war drum rally
  if (/torch/i.test(itemId)) return 0.05;
  if (/wall|gate|door/i.test(itemId)) return 0.03;
  if (/tent|foundation|storage/i.test(itemId)) return 0.02;
  if (CAMP_BUILDING_ITEM_IDS.has(itemId)) return 0.01;
  return 0;
}

function benchCraftStats(profession: Profession | 'crafting'): { craftXpBonus: number; craftTier: number } {
  switch (profession) {
    case 'crafting':
      return { craftXpBonus: 12, craftTier: 3 };
    case 'chemistry':
      return { craftXpBonus: 10, craftTier: 3 };
    case 'gathering':
      return { craftXpBonus: 8, craftTier: 2 };
    case 'survival':
      return { craftXpBonus: 8, craftTier: 2 };
    default:
      return { craftXpBonus: 6, craftTier: 2 };
  }
}

// ── Main system ─────────────────────────────────────────────────────────────

export class CampClaimSystem {
  readonly era = ERA_ID;

  private scene: THREE.Scene;
  private claimed = false;
  private flagPos: THREE.Vector3 | null = null;
  private raceBodyId = 'toon-brick';
  private playerConfig: CharacterConfig | null = null;

  private benches: CampBenchRecord[] = [];
  private buildings: CampBuildingRecord[] = [];
  private guardian: CampGuardian | null = null;

  private gltfLoader = createGLTFLoader();
  private group = new THREE.Group();

  /** UI / HUD: claim established */
  onClaimed: ((pos: THREE.Vector3, raceBodyId: string) => void) | null = null;
  /** UI: buffs changed */
  onBuffsChanged: ((buffs: CampBuffs) => void) | null = null;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.group.name = 'SurvivalCampClaim';
    scene.add(this.group);
  }

  /** Call when character config is known (creation complete / load). */
  setPlayerConfig(config: CharacterConfig): void {
    this.playerConfig = config;
    this.raceBodyId = config.bodyProportion || 'toon-brick';
  }

  /**
   * Handle any survival placeable / modular piece placement.
   * Safe to call for every onPlace — filters internally.
   */
  onStructurePlaced(itemId: string, position: THREE.Vector3, _group?: THREE.Object3D): void {
    if (isClaimFlag(itemId)) {
      this.claimAt(position.clone());
      return;
    }

    if (!this.claimed || !this.flagPos) {
      // Benches/buildings only count inside a claimed camp once claimed;
      // allow pre-claim placement to queue if within 80m after claim via re-scan.
      this._maybeRegisterStructure(itemId, position);
      return;
    }

    if (position.distanceTo(this.flagPos) > CAMP_RADIUS_M) return;
    this._maybeRegisterStructure(itemId, position);
    this._emitBuffs(position);
  }

  private _maybeRegisterStructure(itemId: string, position: THREE.Vector3): void {
    const prof = isBench(itemId);
    if (prof) {
      const stats = benchCraftStats(prof);
      // upgrade existing bench of same profession if better tier
      const existing = this.benches.find((b) => b.profession === prof);
      if (existing) {
        existing.craftTier = Math.max(existing.craftTier, stats.craftTier);
        existing.craftXpBonus = Math.max(existing.craftXpBonus, stats.craftXpBonus);
        existing.position.copy(position);
      } else {
        this.benches.push({
          itemId,
          profession: prof,
          position: position.clone(),
          craftXpBonus: stats.craftXpBonus,
          craftTier: stats.craftTier,
        });
      }
      console.log(
        `[CampClaim/${this.era}] Bench registered: ${itemId} → ${prof} ` +
          `(tier ${stats.craftTier}, +${stats.craftXpBonus} XP/craft)`,
      );
      return;
    }

    const h = buildingHarvestBonus(itemId);
    const a = buildingAiBonus(itemId);
    if (h > 0 || a > 0 || CAMP_BUILDING_ITEM_IDS.has(itemId)) {
      this.buildings.push({
        itemId,
        position: position.clone(),
        harvestBonus: h,
        aiAbilityBonus: a,
      });
      console.log(
        `[CampClaim/${this.era}] Building registered: ${itemId} ` +
          `(harvest +${(h * 100).toFixed(1)}%, AI +${(a * 100).toFixed(1)}%)`,
      );
    }
  }

  /** Establish camp at world position and spawn unarmed race guardian. */
  async claimAt(pos: THREE.Vector3): Promise<void> {
    if (this.claimed && this.flagPos) {
      // Move claim center (re-plant) but keep one guardian
      this.flagPos.copy(pos);
      if (this.guardian) {
        this.guardian.mesh.position.set(pos.x + 2.2, pos.y, pos.z + 1.5);
      }
      this.onClaimed?.(pos, this.raceBodyId);
      return;
    }

    this.claimed = true;
    this.flagPos = pos.clone();
    if (this.playerConfig) {
      this.raceBodyId = this.playerConfig.bodyProportion || this.raceBodyId;
    }

    console.log(
      `[CampClaim/${this.era}] Claim flag planted at ` +
        `(${pos.x.toFixed(1)}, ${pos.z.toFixed(1)}) — race body: ${this.raceBodyId}`,
    );

    await this.spawnUnarmedGuardian(pos);
    this.onClaimed?.(pos, this.raceBodyId);
    this._emitBuffs(null);
  }

  /**
   * Spawn unarmed variant of the player's race / toon body at camp.
   * Uses CDN toon unarmed stance (no weapon mesh) or player body GLTF.
   */
  private async spawnUnarmedGuardian(flagPos: THREE.Vector3): Promise<void> {
    if (this.guardian) {
      this.group.remove(this.guardian.mesh);
      this.guardian.mixer?.stopAllAction();
      this.guardian = null;
    }

    const bodyId = this.raceBodyId;
    const bodyCfg = BODY_TYPES.find((b) => b.id === bodyId);
    const url =
      bodyCfg?.gltfPath ??
      toonDef(bodyId)?.gltfPath ??
      'https://assets.grudge-studio.com/models/toon-soldiers/infantry/infantry-a.glb';

    try {
      const gltf = await this.gltfLoader.loadAsync(url);
      const mesh = gltf.scene;
      mesh.name = `CampGuardian_unarmed_${bodyId}`;

      if (isToonBodyId(bodyId)) {
        normalizeToonHeight(mesh, 1.75);
      } else {
        // Quaternius-ish: ensure metres
        mesh.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(mesh);
        const h = box.getSize(new THREE.Vector3()).y;
        if (h > 0.1 && h > 3) mesh.scale.multiplyScalar(1.8 / h);
      }

      mesh.position.set(flagPos.x + 2.2, flagPos.y, flagPos.z + 1.5);
      mesh.rotation.y = Math.PI * 0.25;
      mesh.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) {
          o.castShadow = true;
          o.receiveShadow = true;
        }
      });

      // Hide obvious weapon meshes on modular kits (unarmed camp variant)
      mesh.traverse((o) => {
        const n = o.name.toLowerCase();
        if (/weapon|sword|axe|gun|rifle|bow|shield|quiver/.test(n)) {
          o.visible = false;
        }
      });

      let mixer: THREE.AnimationMixer | null = null;
      const clips: THREE.AnimationClip[] = [...(gltf.animations ?? [])];

      if (isToonBodyId(bodyId)) {
        const def = toonDef(bodyId);
        if (def) {
          // Force unarmed-ish pack: use locomotion idle only (no rifle hold)
          const retargeted = await loadRetargetedToonClips(mesh, {
            ...def,
            weaponMode: 'pistol', // still has idle; we prefer Idle over Attack for camp
          });
          const idle = retargeted.find((c) => c.name === 'Idle') ?? retargeted[0];
          if (idle) {
            mixer = new THREE.AnimationMixer(mesh);
            const a = mixer.clipAction(idle);
            a.setLoop(THREE.LoopRepeat, Infinity);
            a.play();
          }
        }
      } else if (clips.length) {
        mixer = new THREE.AnimationMixer(mesh);
        const idle =
          clips.find((c) => /idle/i.test(c.name)) ?? clips[0];
        mixer.clipAction(idle).play();
      }

      this.group.add(mesh);
      this.guardian = {
        id: `guardian_${bodyId}`,
        mesh,
        mixer,
        raceBodyId: bodyId,
        unarmed: true,
      };

      console.log(
        `[CampClaim/${this.era}] Unarmed guardian spawned for race body "${bodyId}"`,
      );
    } catch (err) {
      console.warn('[CampClaim] Guardian spawn failed — flag still claims camp:', err);
    }
  }

  // ── Buffs API (survival systems only) ─────────────────────────────────────

  getBuffs(playerPos: THREE.Vector3): CampBuffs {
    const inCamp =
      !!this.flagPos && playerPos.distanceTo(this.flagPos) <= CAMP_RADIUS_M;

    let harvest = 1;
    let ai = 1;
    let craftXp = 1;
    let maxTier = 1;

    if (this.claimed) {
      for (const b of this.buildings) {
        harvest += b.harvestBonus;
        ai += b.aiAbilityBonus;
      }
      // Cap stacks so spam foundations don't go infinite
      harvest = Math.min(harvest, 2.5);
      ai = Math.min(ai, 2.0);

      for (const bench of this.benches) {
        maxTier = Math.max(maxTier, bench.craftTier);
        craftXp = Math.max(craftXp, 1 + bench.craftXpBonus / 50);
      }

      // Soft bonus just for claiming (camp exists)
      harvest += 0.05;
      ai += 0.05;
    }

    return {
      harvestRateMult: harvest,
      aiAbilityMult: ai,
      craftXpMult: craftXp,
      maxCraftTier: maxTier,
      inCamp,
      claimed: this.claimed,
      campCenter: this.flagPos?.clone() ?? null,
      radius: CAMP_RADIUS_M,
      benchCount: this.benches.length,
      buildingCount: this.buildings.length,
      guardianPresent: !!this.guardian,
    };
  }

  /**
   * Craft stations reachable from `playerPos` (recipe station ids).
   * Always includes handcraft (`none`). Camp benches map to workbench /
   * cooking_rack / drying_rack / profession_bench for MainPanel gating.
   */
  getNearbyCraftingStations(
    playerPos: THREE.Vector3,
    radiusM = 6,
  ): Array<
    'none' | 'campfire' | 'cooking_rack' | 'workbench' | 'drying_rack' | 'profession_bench'
  > {
    const near: Array<
      'none' | 'campfire' | 'cooking_rack' | 'workbench' | 'drying_rack' | 'profession_bench'
    > = ['none'];
    const add = (
      s: 'campfire' | 'cooking_rack' | 'workbench' | 'drying_rack' | 'profession_bench',
    ) => {
      if (!near.includes(s)) near.push(s);
    };

    // Inside claimed camp radius → profession bench access for camp economy
    if (this.claimed && this.flagPos && playerPos.distanceTo(this.flagPos) <= CAMP_RADIUS_M) {
      add('profession_bench');
      add('workbench');
    }

    for (const b of this.benches) {
      if (playerPos.distanceTo(b.position) > radiusM) continue;
      const id = b.itemId.toLowerCase();
      if (/campfire/.test(id)) add('campfire');
      else if (/cook|cauldron|pot/.test(id)) add('cooking_rack');
      else if (/drying/.test(id)) add('drying_rack');
      else add('workbench');
    }
    return near;
  }

  /**
   * Call when a craft completes at camp (or near a registered bench).
   * Awards profession XP — survival crafting professions only.
   */
  onCraftCompleted(playerPos: THREE.Vector3, preferredProfession?: Profession): number {
    if (!this.claimed || !this.flagPos) return 0;
    if (playerPos.distanceTo(this.flagPos) > CAMP_RADIUS_M) return 0;

    const buffs = this.getBuffs(playerPos);
    let best = this.benches[0];
    if (preferredProfession) {
      best =
        this.benches.find((b) => b.profession === preferredProfession) ?? best;
    }
    if (!best) {
      // Claim alone still grants tiny township XP
      ProfessionsService.gainXp('township', 3);
      return 3;
    }

    const xp = Math.round(best.craftXpBonus * buffs.craftXpMult);
    const prof = (best.profession === 'crafting' ? 'crafting' : best.profession) as Profession;
    ProfessionsService.gainXp(prof, xp);
    // Township XP for developing the camp economy
    ProfessionsService.gainXp('township', Math.max(2, Math.floor(xp * 0.25)));
    return xp;
  }

  /** Harvest rate multiplier for camp production ticks (always, once claimed). */
  getHarvestRateMultiplier(): number {
    if (!this.claimed) return 1;
    return this.getBuffs(this.flagPos ?? new THREE.Vector3()).harvestRateMult;
  }

  /** AI ability multiplier for camp followers / hirelings. */
  getAiAbilityMultiplier(): number {
    if (!this.claimed) return 1;
    return this.getBuffs(this.flagPos ?? new THREE.Vector3()).aiAbilityMult;
  }

  isClaimed(): boolean {
    return this.claimed;
  }

  getFlagPosition(): THREE.Vector3 | null {
    return this.flagPos?.clone() ?? null;
  }

  getRaceBodyId(): string {
    return this.raceBodyId;
  }

  update(dt: number): void {
    this.guardian?.mixer?.update(dt);
  }

  serialize(): CampClaimSnapshot | null {
    if (!this.claimed || !this.flagPos) return null;
    return {
      era: ERA_ID,
      claimed: true,
      flagX: this.flagPos.x,
      flagY: this.flagPos.y,
      flagZ: this.flagPos.z,
      raceBodyId: this.raceBodyId,
      benches: this.benches.map((b) => ({
        itemId: b.itemId,
        profession: b.profession,
        x: b.position.x,
        y: b.position.y,
        z: b.position.z,
        craftXpBonus: b.craftXpBonus,
        craftTier: b.craftTier,
      })),
      buildings: this.buildings.map((b) => ({
        itemId: b.itemId,
        x: b.position.x,
        y: b.position.y,
        z: b.position.z,
        harvestBonus: b.harvestBonus,
        aiAbilityBonus: b.aiAbilityBonus,
      })),
    };
  }

  async restore(snap: CampClaimSnapshot | null | undefined): Promise<void> {
    if (!snap || snap.era !== ERA_ID || !snap.claimed) return;
    this.raceBodyId = snap.raceBodyId || this.raceBodyId;
    this.benches = snap.benches.map((b) => ({
      itemId: b.itemId,
      profession: b.profession as Profession | 'crafting',
      position: new THREE.Vector3(b.x, b.y, b.z),
      craftXpBonus: b.craftXpBonus,
      craftTier: b.craftTier,
    }));
    this.buildings = snap.buildings.map((b) => ({
      itemId: b.itemId,
      position: new THREE.Vector3(b.x, b.y, b.z),
      harvestBonus: b.harvestBonus,
      aiAbilityBonus: b.aiAbilityBonus,
    }));
    await this.claimAt(new THREE.Vector3(snap.flagX, snap.flagY, snap.flagZ));
  }

  dispose(): void {
    if (this.guardian) {
      this.guardian.mixer?.stopAllAction();
      this.group.remove(this.guardian.mesh);
      this.guardian = null;
    }
    this.scene.remove(this.group);
    this.claimed = false;
    this.flagPos = null;
    this.benches = [];
    this.buildings = [];
  }

  private _emitBuffs(playerPos: THREE.Vector3 | null): void {
    if (!this.onBuffsChanged) return;
    const pos = playerPos ?? this.flagPos ?? new THREE.Vector3();
    this.onBuffsChanged(this.getBuffs(pos));
  }
}
