import * as THREE from 'three';

export type CameraMode = 'first-person' | 'third-person' | 'arpg';

export interface WeaponStats {
  id: string;
  name: string;
  type: 'sword' | 'axe' | 'dagger' | 'mace' | 'bow' | 'staff' | 'gun'
    | 'knife' | 'unarmed' | 'shield' | 'sword_shield' | 'throwable' | 'javelin' | 'hatchet' | 'lantern'
    | 'hammer' | 'greatsword' | 'greataxe' | 'spear' | 'crossbow' | 'scythe' | 'wand'
    | 'rifle' | 'shotgun' | 'smg' | 'pistol';
  damage: number;
  speed: number;
  range: number;
  element?: 'fire' | 'ice' | 'lightning' | 'none';
  icon: string;
  color: number;
  description: string;
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

export interface SkillNode {
  id: string;
  name: string;
  description: string;
  maxLevel: number;
  currentLevel: number;
  requires?: string[];
  stat: 'strength' | 'vitality' | 'endurance' | 'intellect' | 'wisdom' | 'dexterity' | 'agility' | 'tactics' | 'ability';
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
  // Source of truth: https://grudges.grudge-studio.com/stats-guide.html
  // These drive the 37 derived stats and perk gateway thresholds.
  /** Raw physical power — melee damage, carry capacity, stagger. */
  strength: number;
  /** Toughness — max HP, HP regen, bleed/poison resistance. */
  vitality: number;
  /** Stamina pool + regen, block effect, fall damage reduction. */
  endurance: number;
  /** Spell power, max mana, spell penetration. */
  intellect: number;
  /** Mana regen, cooldown reduction, healing power. */
  wisdom: number;
  /** Ranged/melee finesse — crit chance, attack speed, crafting speed. */
  dexterity: number;
  /** Evasion, movement speed, dodge window. */
  agility: number;
  /** Accuracy, XP bonus, reputation gain, party aura range. */
  tactics: number;
  level: number;
  experience: number;
  skillPoints: number;
  // ----- Survival vitals -----
  /** Filling stomach. 0 = starving (HP drains). */
  hunger: number;
  maxHunger: number;
  /** Hydration. 0 = dehydrated (HP drains faster than hunger). */
  thirst: number;
  maxThirst: number;
  /** Body temperature in °C — 37 is normal, <34 hypothermia, >40 hyperthermia. */
  temperature: number;
  /** Sleep / rest debt. 100 = fully rested. Low values cripple stamina regen. */
  fatigue: number;
  maxFatigue: number;
  /** Bleeding ticks down HP each second until bandaged. */
  bleeding: boolean;
  /** Infection — slow HP drain that ramps over time. Curable with first aid. */
  infected: boolean;
}

export interface Enemy {
  mesh: THREE.Group;
  health: number;
  maxHealth: number;
  speed: number;
  damage: number;
  state: 'idle' | 'chase' | 'attack' | 'dead';
  attackCooldown: number;
  attackTimer: number;
  knockback?: THREE.Vector3;
  distanceToPlayer: number;
}

export interface Projectile {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  damage: number;
  lifetime: number;
  owner: 'player' | 'enemy';
}

export interface ParticleEffect {
  particles: THREE.Points;
  lifetime: number;
  maxLifetime: number;
}

export interface GameState {
  paused: boolean;
  mainMenuOpen: boolean;
  skillTreeOpen: boolean;
  inventoryOpen: boolean;
  killCount: number;
  score: number;
  wave: number;
  gameStarted: boolean;
}
