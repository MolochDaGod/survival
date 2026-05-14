/**
 * @workspace/game-systems — Combat Damage Pipeline
 *
 * Ported from GrudgeBuilder combatCalculations.ts, wired to Nexus stats.
 *
 * 8-step pipeline:
 *   1. Base damage (weapon + ability multiplier)
 *   2. Attribute scaling (from Nexus 8-stat system)
 *   3. Physical / magical split
 *   4. Elemental resistance
 *   5. Defense mitigation (√defense formula)
 *   6. Variance (±25%)
 *   7. Block check (physical only, capped at 75%)
 *   8. Critical check (cannot crit if blocked, capped at 75%)
 *
 * Combat math: Damage Taken = Incoming × (100 − √Defense) / 100
 */

import type { CombatStats, ElementalResistances, DamageResult, ElementType } from './types.js';
import { STAT_CAPS, clampStat } from './attributes.js';

// ── Resistance Cap ──────────────────────────────────────────────────────────

const RESISTANCE_CAP = 75;

function capResistance(value: number): number {
  return Math.min(RESISTANCE_CAP, Math.max(-50, value));
}

// ── Default Values ──────────────────────────────────────────────────────────

export const DEFAULT_COMBAT_STATS: CombatStats = {
  physicalDamage: 10,
  magicalDamage: 0,
  physicalDefense: 10,
  magicalDefense: 5,
  critChance: 5,
  critDamage: 150,
  blockChance: 0,
  blockReduction: 0,
  attackSpeed: 0,
  accuracy: 80,
  evasion: 0,
};

export const DEFAULT_RESISTANCES: ElementalResistances = {
  fire: 0, ice: 0, lightning: 0, arcane: 0, holy: 0, nature: 0, physical: 0,
};

// ── Buff/Debuff Application ─────────────────────────────────────────────────

export interface StatModifier {
  stat: keyof CombatStats;
  value: number;
}

export function applyModifiers(base: CombatStats, mods: StatModifier[]): CombatStats {
  const result = { ...base };
  for (const mod of mods) {
    result[mod.stat] = (result[mod.stat] || 0) + mod.value;
  }
  return result;
}

// ── Core Damage Calculation ─────────────────────────────────────────────────

export interface DamageInput {
  /** Base weapon damage split */
  weaponPhysical: number;
  weaponMagical: number;
  /** Ability damage multiplier (1.0 = normal attack) */
  abilityMultiplier: number;
  /** Element of the attack */
  element: ElementType;
  /** Attacker's effective combat stats (after buffs/debuffs) */
  attacker: CombatStats;
  /** Defender's effective combat stats */
  defender: CombatStats;
  /** Defender's elemental resistances */
  defenderResists: ElementalResistances;
  /** Enable ±25% random variance (default true) */
  variance?: boolean;
}

export function calculateDamage(input: DamageInput): DamageResult {
  const {
    weaponPhysical, weaponMagical, abilityMultiplier, element,
    attacker, defender, defenderResists,
    variance = true,
  } = input;

  // Step 1: Base damage
  const baseDamage = (weaponPhysical + weaponMagical) * abilityMultiplier;

  // Step 2: Split into physical and magical
  const totalBase = weaponPhysical + weaponMagical || 1;
  const physRatio = weaponPhysical / totalBase;
  let physDmg = baseDamage * physRatio;
  let magDmg = baseDamage * (1 - physRatio);

  // Step 3: Apply elemental resistance to magical component
  const elemResist = capResistance(defenderResists[element === 'none' ? 'physical' : element] ?? 0);
  const physResist = capResistance(defenderResists.physical);
  physDmg *= (1 - physResist / 100);
  magDmg *= (1 - elemResist / 100);

  // Step 4: Defense mitigation (√defense formula)
  const physMit = Math.min(90, Math.sqrt(defender.physicalDefense));
  const magMit = Math.min(90, Math.sqrt(defender.magicalDefense));
  physDmg *= (100 - physMit) / 100;
  magDmg *= (100 - magMit) / 100;

  // Step 5: Variance (±25%)
  if (variance) {
    const v = 0.75 + Math.random() * 0.5;
    physDmg *= v;
    magDmg *= v;
  }

  // Step 6: Block check (physical only)
  let isBlocked = false;
  const blockChance = clampStat('block', defender.blockChance);
  if (Math.random() * 100 < blockChance) {
    isBlocked = true;
    const blockEff = Math.min(0.9, defender.blockReduction / 100);
    physDmg *= (1 - blockEff);
  }

  // Step 7: Critical check (cannot crit if blocked)
  let isCrit = false;
  if (!isBlocked) {
    const critChance = clampStat('criticalChance', attacker.critChance);
    if (Math.random() * 100 < critChance) {
      isCrit = true;
      const critMult = Math.min(3, attacker.critDamage / 100);
      physDmg *= critMult;
      magDmg *= critMult;
    }
  }

  // Step 8: Final
  const totalDamage = Math.max(1, Math.floor(physDmg + magDmg));

  return {
    physicalDamage: Math.floor(physDmg),
    magicalDamage: Math.floor(magDmg),
    totalDamage,
    isCrit,
    isBlocked,
    elementApplied: element !== 'none' ? element : null,
    comboTriggered: false,
    effects: [],
  };
}

// ── Healing ─────────────────────────────────────────────────────────────────

export function calculateHealing(baseHeal: number, healPower: number = 0): number {
  const heal = baseHeal * (1 + healPower / 100);
  const variance = 0.9 + Math.random() * 0.2;
  return Math.floor(heal * variance);
}

// ── Drain (Lifesteal / Manasteal) ───────────────────────────────────────────

export function calculateDrain(damageDealt: number, drainPct: number, cap: number = 50): number {
  const effective = Math.min(cap, drainPct);
  return Math.floor(damageDealt * effective / 100);
}
