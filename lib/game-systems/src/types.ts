/**
 * @workspace/game-systems — Shared type definitions
 *
 * Pure data types used across all Grudge Studio games.
 * Zero runtime dependencies — no Three.js, no React, no DOM.
 */

// ── Attribute System ────────────────────────────────────────────────────────

export type Gender = 'male' | 'female';

export interface GrudgeStats {
  bio: number;
  neu: number;
  kin: number;
  qnt: number;
  syn: number;
  chr: number;
  ent: number;
  gra: number;
}

export type GrudgeStatKey = keyof GrudgeStats;

export const GRUDGE_STAT_KEYS: GrudgeStatKey[] = [
  'bio', 'neu', 'kin', 'qnt', 'syn', 'chr', 'ent', 'gra',
];

export interface StatMeta {
  key: GrudgeStatKey;
  label: string;
  abbr: string;
  color: string;
  desc: string;
  icon: string;
}

// ── Combat Types ────────────────────────────────────────────────────────────

export type ElementType = 'physical' | 'fire' | 'ice' | 'lightning' | 'arcane' | 'holy' | 'nature' | 'none';

export type WeaponType =
  | 'sword' | 'axe' | 'dagger' | 'mace' | 'bow' | 'staff' | 'gun'
  | 'knife' | 'unarmed' | 'shield' | 'sword_shield' | 'throwable'
  | 'javelin' | 'hatchet' | 'lantern'
  | 'hammer' | 'greatsword' | 'greataxe' | 'spear' | 'crossbow'
  | 'scythe' | 'wand'
  | 'rifle' | 'shotgun' | 'smg' | 'pistol';

export interface WeaponStats {
  id: string;
  name: string;
  type: WeaponType;
  damage: number;
  speed: number;
  range: number;
  element?: ElementType;
  icon: string;
  color: number;
  description: string;
  tier?: number;
}

export interface AbilityDef {
  id: string;
  name: string;
  icon: string;
  description: string;
  manaCost: number;
  cooldown: number;
  damage: number;
  unlocked: boolean;
  key: string;
  skillTreeNode?: string;
  color: string;
}

export type LegacyAttribute =
  | 'strength' | 'vitality' | 'endurance' | 'intellect'
  | 'wisdom' | 'dexterity' | 'agility' | 'tactics';

export interface SkillNode {
  id: string;
  name: string;
  description: string;
  maxLevel: number;
  currentLevel: number;
  requires?: string[];
  stat: LegacyAttribute | 'ability';
  abilityId?: string;
  bonusPerLevel: number;
  x: number;
  y: number;
}

export interface PlayerStats {
  health: number;
  maxHealth: number;
  mana: number;
  maxMana: number;
  stamina: number;
  maxStamina: number;
  // ── Legacy 8 Attributes (Combat Sheet) ─────────────────────────────────
  // These drive the derived stats and perk gateway thresholds.
  strength: number;
  vitality: number;
  endurance: number;
  intellect: number;
  wisdom: number;
  dexterity: number;
  agility: number;
  tactics: number;
  level: number;
  experience: number;
  skillPoints: number;
  // ── Survival vitals ────────────────────────────────────────────────────
  hunger: number;
  maxHunger: number;
  thirst: number;
  maxThirst: number;
  temperature: number;
  fatigue: number;
  maxFatigue: number;
  bleeding: boolean;
  infected: boolean;
}

// ── Combat Pipeline ─────────────────────────────────────────────────────────

export interface CombatStats {
  physicalDamage: number;
  magicalDamage: number;
  physicalDefense: number;
  magicalDefense: number;
  critChance: number;
  critDamage: number;
  blockChance: number;
  blockReduction: number;
  attackSpeed: number;
  accuracy: number;
  evasion: number;
}

export interface ElementalResistances {
  fire: number;
  ice: number;
  lightning: number;
  arcane: number;
  holy: number;
  nature: number;
  physical: number;
}

export interface DamageResult {
  physicalDamage: number;
  magicalDamage: number;
  totalDamage: number;
  isCrit: boolean;
  isBlocked: boolean;
  /** True when the attack missed due to evasion > accuracy. */
  isMiss: boolean;
  elementApplied: ElementType | null;
  comboTriggered: boolean;
  effects: string[];
}

// ── Items ───────────────────────────────────────────────────────────────────

export type EquipSlot =
  | 'mainhand' | 'offhand' | 'helm' | 'chest' | 'legs'
  | 'boots' | 'ring' | 'amulet' | 'cape' | 'relic';

export type ItemRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export interface ItemStats {
  damage?: number;
  armor?: number;
  health?: number;
  mana?: number;
  moveSpeed?: number;
  attackSpeed?: number;
  critChance?: number;
  strength?: number;
  agility?: number;
  intelligence?: number;
  endurance?: number;
}

export interface ItemDef {
  id: string;
  name: string;
  slot: EquipSlot;
  rarity: ItemRarity;
  icon: string;
  description: string;
  stats: ItemStats;
  levelReq?: number;
  weaponId?: string;
  tier?: number;
}

// ── Professions ─────────────────────────────────────────────────────────────

export type Profession =
  | 'gathering' | 'hunting' | 'crafting' | 'township'
  | 'survival' | 'chemistry' | 'combat';

export type ProfessionEffectKey = string;
export type ProfessionEffects = Record<ProfessionEffectKey, number>;
export type ProfessionExtras = Record<string, boolean | string>;

export interface ProfessionSkill {
  id: string;
  prof: Profession;
  branch: string;
  rank: 1 | 2 | 3 | 4 | 'M';
  name: string;
  desc: string;
  cost: number;
  prereq: string[];
  icon: string;
  signature: string;
  recipes: string[];
  passive: ProfessionEffects;
  extras: ProfessionExtras;
}

export interface ProfessionBranch {
  id: string;
  prof: Profession;
  label: string;
  skills: ProfessionSkill[];
}

export interface ProfessionMeta {
  id: Profession;
  label: string;
  blurb: string;
  color: string;
  icon: string;
}

// ── Creatures ───────────────────────────────────────────────────────────────

export type CreatureRole =
  | 'hostile-easy' | 'hostile-scifi' | 'hostile-mech' | 'hostile-other'
  | 'huntable-farm' | 'huntable-fish';

export type AIArchetype =
  | 'melee' | 'ranged' | 'passive_flee' | 'aquatic_passive'
  | 'aquatic_predator' | 'hover_ranged' | 'heavy_melee'
  | 'ambush_swarm' | 'sentinel_static';

export type Biome =
  | 'permafrost' | 'glasslands' | 'derelict-sprawl'
  | 'anomaly-field' | 'cinder-wastes' | 'water' | 'settlement';

export interface CreatureDef {
  key: string;
  displayName: string;
  role: CreatureRole;
  fbxPath: string;
  texturePath?: string;
  scale: number;
  yOffset: number;
  tintColor: number;
  threatLevel: 1 | 2 | 3 | 4 | 5;
  ai: AIArchetype;
  biomes: Biome[];
  drops: string[];
  notes: string;
}

// ── Tiers ───────────────────────────────────────────────────────────────────

export interface TierDef {
  tier: number;
  label: string;
  color: string;
  tw: string;
  twBorder: string;
}
