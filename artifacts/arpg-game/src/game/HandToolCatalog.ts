/**
 * HandToolCatalog — maps combat weapons + survival tools to:
 *   • hand-bone grip offsets
 *   • model paths (survival FBX / CDN)
 *   • harvest tags (what resource families they chop/mine well)
 *   • weaponType for AnimationRegistry / locomotion stance
 *
 * Used by WeaponAttachment (visuals) and GameEngine (harvest combat).
 * Survival era only — not Warlords island kits.
 */

import type { WeaponType } from './types';
import { SURVIVAL_ITEMS, type SurvivalItemDef } from './survival/SurvivalItems';

export type HarvestFamily =
  | 'wood'
  | 'ore'
  | 'herb'
  | 'scrap'
  | 'generic';

export interface HandGrip {
  /** Local position on the hand bone (metres). */
  offset: { x: number; y: number; z: number };
  /** Euler degrees. */
  rotation: { x: number; y: number; z: number };
  /** Uniform scale for the held mesh. */
  scale: number;
}

export interface HandToolDef {
  id: string;
  label: string;
  /** AnimationRegistry / locomotion weapon type. */
  weaponType: WeaponType | string;
  /** Primary hand bone logical slot. */
  boneSlot: 'R_hand_container' | 'L_hand_container';
  modelPath: string | null;
  grip: HandGrip;
  /** Combat damage fallback when not in WEAPONS table. */
  damage: number;
  range: number;
  /** Resource families this tool harvests efficiently. */
  harvestFamilies: HarvestFamily[];
  /** Multiplier when family matches (else 0.35 for wrong tool, 0.5 bare hands). */
  harvestMult: number;
  /** Procedural mesh kind when model load fails. */
  procedural: 'sword' | 'axe' | 'pickaxe' | 'hatchet' | 'knife' | 'mace' | 'bat' | 'shovel' | 'gun' | 'shield';
}

const DEFAULT_GRIP: HandGrip = {
  offset: { x: 0.02, y: 0.04, z: 0.02 },
  rotation: { x: -90, y: 0, z: 0 },
  scale: 1,
};

function grip(
  ox: number, oy: number, oz: number,
  rx: number, ry: number, rz: number,
  scale = 1,
): HandGrip {
  return {
    offset: { x: ox, y: oy, z: oz },
    rotation: { x: rx, y: ry, z: rz },
    scale,
  };
}

/** Resource def id → harvest family. */
export const RESOURCE_HARVEST_FAMILY: Record<string, HarvestFamily> = {
  timber_log: 'wood',
  wild_herbs: 'herb',
  iron_ore: 'ore',
  permafrost_ore: 'ore',
  copper_deposit: 'ore',
  flint_outcrop: 'ore',
  stone_outcrop: 'ore',
  coal_seam: 'ore',
  crystal_node: 'ore',
  scrap_pile: 'scrap',
  wire_spool: 'scrap',
  oil_drum: 'scrap',
  driftwood: 'wood',
  kelp_bed: 'herb',
  frozen_pond: 'generic',
};

/** Combat WEAPONS ids (constants.ts) → hand tool defs. */
export const COMBAT_WEAPON_HAND: Record<string, HandToolDef> = {
  iron_sword: {
    id: 'iron_sword',
    label: 'Iron Sword',
    weaponType: 'sword',
    boneSlot: 'R_hand_container',
    modelPath: '/assets/survival/items/Machete.fbx',
    grip: grip(0.02, 0.05, 0.01, -90, 0, 10, 0.9),
    damage: 25,
    range: 2.5,
    harvestFamilies: ['generic', 'herb'],
    harvestMult: 0.55,
    procedural: 'sword',
  },
  fire_axe: {
    id: 'fire_axe',
    label: 'Fire Axe',
    weaponType: 'axe',
    boneSlot: 'R_hand_container',
    modelPath: '/assets/survival/items/FireAxe.fbx',
    grip: grip(0.03, 0.06, 0.02, -95, 5, 0, 0.85),
    damage: 40,
    range: 2.8,
    harvestFamilies: ['wood'],
    harvestMult: 1.6,
    procedural: 'axe',
  },
  shadow_dagger: {
    id: 'shadow_dagger',
    label: 'Shadow Dagger',
    weaponType: 'dagger',
    boneSlot: 'R_hand_container',
    modelPath: '/assets/survival/items/Knife.fbx',
    grip: grip(0.015, 0.03, 0.01, -85, 0, 0, 0.7),
    damage: 15,
    range: 1.8,
    harvestFamilies: ['herb'],
    harvestMult: 1.1,
    procedural: 'knife',
  },
  thunder_mace: {
    id: 'thunder_mace',
    label: 'Thunder Mace',
    weaponType: 'mace',
    boneSlot: 'R_hand_container',
    modelPath: '/assets/survival/items/Hammer.fbx',
    grip: grip(0.02, 0.05, 0.02, -90, 0, 0, 0.9),
    damage: 35,
    range: 2.2,
    harvestFamilies: ['ore', 'scrap'],
    harvestMult: 1.2,
    procedural: 'mace',
  },
  iron_pistol: {
    id: 'iron_pistol',
    label: 'Iron Pistol',
    weaponType: 'gun',
    boneSlot: 'R_hand_container',
    modelPath: null,
    grip: grip(0.02, 0.04, 0.05, -90, 90, 0, 0.8),
    damage: 30,
    range: 40,
    harvestFamilies: [],
    harvestMult: 0.1,
    procedural: 'gun',
  },
  hellfire_shotgun: {
    id: 'hellfire_shotgun',
    label: 'Hellfire Shotgun',
    weaponType: 'gun',
    boneSlot: 'R_hand_container',
    modelPath: null,
    grip: grip(0.02, 0.05, 0.08, -90, 90, 0, 0.75),
    damage: 60,
    range: 15,
    harvestFamilies: [],
    harvestMult: 0.1,
    procedural: 'gun',
  },
};

/** Survival tool / melee item ids that go on the hand. */
const SURVIVAL_HAND_OVERRIDES: Record<string, Partial<HandToolDef>> = {
  axe_fire: {
    weaponType: 'axe',
    harvestFamilies: ['wood'],
    harvestMult: 1.7,
    procedural: 'axe',
    grip: grip(0.03, 0.06, 0.02, -95, 5, 0, 0.85),
  },
  hatchet: {
    weaponType: 'hatchet',
    harvestFamilies: ['wood'],
    harvestMult: 1.45,
    procedural: 'hatchet',
    grip: grip(0.02, 0.04, 0.02, -90, 0, 0, 0.75),
  },
  pickaxe: {
    weaponType: 'axe',
    harvestFamilies: ['ore'],
    harvestMult: 1.8,
    procedural: 'pickaxe',
    grip: grip(0.03, 0.07, 0.02, -100, 0, 0, 0.8),
  },
  climbing_pick: {
    weaponType: 'dagger',
    harvestFamilies: ['ore'],
    harvestMult: 1.15,
    procedural: 'pickaxe',
    grip: grip(0.02, 0.04, 0.02, -90, 0, 0, 0.65),
  },
  shovel: {
    weaponType: 'axe',
    harvestFamilies: ['generic'],
    harvestMult: 0.9,
    procedural: 'shovel',
    grip: grip(0.02, 0.08, 0.02, -95, 0, 0, 0.85),
  },
  hammer: {
    weaponType: 'mace',
    harvestFamilies: ['scrap', 'ore'],
    harvestMult: 1.25,
    procedural: 'mace',
    grip: grip(0.02, 0.04, 0.02, -90, 0, 0, 0.75),
  },
  crowbar: {
    weaponType: 'mace',
    harvestFamilies: ['scrap'],
    harvestMult: 1.4,
    procedural: 'bat',
    grip: grip(0.02, 0.06, 0.02, -90, 0, 0, 0.85),
  },
  knife: {
    weaponType: 'dagger',
    harvestFamilies: ['herb'],
    harvestMult: 1.2,
    procedural: 'knife',
    grip: grip(0.015, 0.03, 0.01, -85, 0, 0, 0.65),
  },
  cleaver: {
    weaponType: 'sword',
    harvestFamilies: ['herb', 'generic'],
    harvestMult: 0.9,
    procedural: 'knife',
    grip: grip(0.02, 0.04, 0.01, -90, 0, 0, 0.75),
  },
  machete: {
    weaponType: 'sword',
    harvestFamilies: ['wood', 'herb'],
    harvestMult: 1.15,
    procedural: 'sword',
    grip: grip(0.02, 0.05, 0.01, -90, 0, 10, 0.85),
  },
  baseball_bat: {
    weaponType: 'mace',
    harvestFamilies: ['generic'],
    harvestMult: 0.6,
    procedural: 'bat',
    grip: grip(0.02, 0.08, 0.02, -90, 0, 0, 0.9),
  },
  baseball_bat_nails: {
    weaponType: 'mace',
    harvestFamilies: ['generic'],
    harvestMult: 0.65,
    procedural: 'bat',
    grip: grip(0.02, 0.08, 0.02, -90, 0, 0, 0.9),
  },
  torch: {
    weaponType: 'dagger',
    harvestFamilies: [],
    harvestMult: 0.2,
    procedural: 'bat',
    grip: grip(0.02, 0.05, 0.02, -90, 0, 0, 0.7),
  },
  fishing_rod: {
    weaponType: 'unarmed',
    harvestFamilies: [],
    harvestMult: 0,
    procedural: 'bat',
    grip: grip(0.02, 0.12, 0.04, -80, 0, 0, 0.9),
  },
  assault_shield: {
    weaponType: 'shield',
    boneSlot: 'L_hand_container',
    harvestFamilies: [],
    harvestMult: 0,
    procedural: 'shield',
    grip: grip(0.05, 0.02, 0.02, 0, 0, 0, 1),
  },
};

function fromSurvival(s: SurvivalItemDef, over: Partial<HandToolDef> = {}): HandToolDef {
  const isMelee = s.category === 'weapon_melee' || s.category === 'tool';
  return {
    id: s.id,
    label: s.name,
    weaponType: over.weaponType ?? (isMelee ? 'sword' : 'unarmed'),
    boneSlot: over.boneSlot ?? 'R_hand_container',
    modelPath: s.modelPath,
    grip: over.grip ?? DEFAULT_GRIP,
    damage: s.damage ?? 10,
    range: s.range ?? 1.5,
    harvestFamilies: over.harvestFamilies ?? ['generic'],
    harvestMult: over.harvestMult ?? 0.7,
    procedural: over.procedural ?? 'sword',
  };
}

const _cache = new Map<string, HandToolDef>();

/** Resolve a hand tool def by combat weapon id or survival item id. */
export function getHandToolDef(id: string | undefined | null): HandToolDef | null {
  if (!id) return null;
  if (_cache.has(id)) return _cache.get(id)!;

  if (COMBAT_WEAPON_HAND[id]) {
    _cache.set(id, COMBAT_WEAPON_HAND[id]);
    return COMBAT_WEAPON_HAND[id];
  }

  const survival = SURVIVAL_ITEMS[id];
  if (survival) {
    const over = SURVIVAL_HAND_OVERRIDES[id] ?? {};
    // Auto-tag weapon packs from WP1 melee names
    if (!SURVIVAL_HAND_OVERRIDES[id] && survival.category === 'weapon_melee') {
      const n = survival.name.toLowerCase();
      if (/axe|hatchet/.test(n)) {
        over.weaponType = 'axe';
        over.harvestFamilies = ['wood'];
        over.harvestMult = 1.4;
        over.procedural = /pick/.test(n) ? 'pickaxe' : 'axe';
      } else if (/pick/.test(n)) {
        over.weaponType = 'axe';
        over.harvestFamilies = ['ore'];
        over.harvestMult = 1.6;
        over.procedural = 'pickaxe';
      } else if (/knife|cleaver/.test(n)) {
        over.weaponType = 'dagger';
        over.harvestFamilies = ['herb'];
        over.harvestMult = 1.1;
        over.procedural = 'knife';
      } else if (/shovel/.test(n)) {
        over.procedural = 'shovel';
        over.harvestMult = 0.9;
      } else if (/bat|crow|pan|crew/.test(n)) {
        over.weaponType = 'mace';
        over.procedural = 'bat';
        over.harvestFamilies = ['scrap', 'generic'];
        over.harvestMult = 1.1;
      }
    }
    const def = fromSurvival(survival, over);
    _cache.set(id, def);
    return def;
  }

  return null;
}

/** Harvest damage multiplier for a tool against a resource node def id. */
export function harvestMultFor(tool: HandToolDef | null, resourceDefId: string): number {
  if (!tool) return 0.45; // bare hands / fists
  if (tool.harvestFamilies.length === 0) return 0.15; // guns etc.
  const family = RESOURCE_HARVEST_FAMILY[resourceDefId] ?? 'generic';
  if (tool.harvestFamilies.includes(family)) return tool.harvestMult;
  if (tool.harvestFamilies.includes('generic')) return Math.max(0.5, tool.harvestMult * 0.55);
  return 0.35; // wrong tool — still chips slowly
}

/** Animation / stance type for an equipped combat weapon. */
export function stanceForWeaponType(type: string | undefined): string {
  if (!type) return 'unarmed';
  if (type === 'gun' || type === 'pistol' || type === 'rifle' || type === 'shotgun' || type === 'smg') {
    return type === 'gun' ? 'pistol' : type;
  }
  return type;
}

/** Whether this category should attach to the hand bone. */
export function isHandHoldableSurvival(id: string): boolean {
  const s = SURVIVAL_ITEMS[id];
  if (!s) return !!COMBAT_WEAPON_HAND[id];
  return (
    s.category === 'tool' ||
    s.category === 'weapon_melee' ||
    s.category.startsWith('weapon_')
  ) && !['flashlight', 'lighter', 'glow_stick', 'compass', 'radio', 'pan', 'pot_small', 'pot_large', 'plate_empty', 'quiver', 'saw'].includes(id);
}
