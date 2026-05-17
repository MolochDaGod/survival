/**
 * @workspace/game-systems — 37 Derived Stats from the 8 Legacy Attributes
 *
 * Source of truth: https://grudges.grudge-studio.com/stats-guide.html
 *
 * Every derived stat is a pure function of the 8 attributes (STR, VIT, END,
 * INT, WIS, DEX, AGI, TAC) plus optional equipment/affix bonuses. The
 * formulas honour the diminishing-returns curve from attributes.ts so
 * single-stat builds plateau before becoming broken.
 *
 * The 37 stats are grouped into:
 *   Combat Offense  (7): physDamage, magDamage, critChance, critDamage,
 *                        attackSpeed, castSpeed, accuracy
 *   Combat Defense  (6): physDefense, magDefense, blockChance, blockEffect,
 *                        evasion, resistance
 *   Pools & Regen   (6): maxHealth, maxMana, maxStamina,
 *                        hpRegen, manaRegen, staminaRegen
 *   Movement        (1): moveSpeed
 *   Drain / Reflect (4): drainHealth, drainMana, reflectDamage, absorbHealth
 *   Elemental Resists(7): fireRes, iceRes, lightningRes, arcaneRes, holyRes,
 *                         natureRes, physRes
 *   Economy / Utility(6): harvestYield, craftSpeed, carryCapacity,
 *                         xpBonus, reputation, cooldownReduction
 *
 * Usage:
 *   import { computeDerivedStats } from '@workspace/game-systems';
 *   const derived = computeDerivedStats(playerStats);
 */

import { effectivePoints, STAT_CAPS } from './attributes.js';
import type { PlayerStats, CombatStats, ElementalResistances } from './types.js';

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Clamp a derived value to its hard cap (if one exists). */
function cap(key: string, value: number): number {
  const c = STAT_CAPS[key];
  return c !== undefined ? Math.min(c, value) : value;
}

/** Per-point contribution with DR applied. */
function dr(raw: number): number {
  return effectivePoints(raw);
}

// ── Derived Stats Interface ─────────────────────────────────────────────────

export interface DerivedStats {
  // Combat Offense
  physicalDamage: number;
  magicalDamage: number;
  critChance: number;
  critDamage: number;
  attackSpeed: number;
  castSpeed: number;
  accuracy: number;

  // Combat Defense
  physicalDefense: number;
  magicalDefense: number;
  blockChance: number;
  blockEffect: number;
  evasion: number;
  resistance: number;

  // Pools & Regen
  maxHealth: number;
  maxMana: number;
  maxStamina: number;
  hpRegen: number;
  manaRegen: number;
  staminaRegen: number;

  // Movement
  moveSpeed: number;

  // Drain / Reflect / Absorb
  drainHealth: number;
  drainMana: number;
  reflectDamage: number;
  absorbHealth: number;

  // Elemental Resistances
  fireRes: number;
  iceRes: number;
  lightningRes: number;
  arcaneRes: number;
  holyRes: number;
  natureRes: number;
  physRes: number;

  // Economy / Utility
  harvestYield: number;
  craftSpeed: number;
  carryCapacity: number;
  xpBonus: number;
  reputation: number;
  cooldownReduction: number;
}

/** Metadata for displaying derived stats in UI. */
export interface DerivedStatMeta {
  key: keyof DerivedStats;
  label: string;
  format: 'flat' | 'pct' | 'perSec';
  group: 'offense' | 'defense' | 'pools' | 'movement' | 'drain' | 'resist' | 'utility';
  /** Which legacy attributes contribute. */
  sources: string[];
}

export const DERIVED_STAT_META: DerivedStatMeta[] = [
  // Offense
  { key: 'physicalDamage',  label: 'Physical Damage',   format: 'flat',  group: 'offense',  sources: ['STR', 'DEX'] },
  { key: 'magicalDamage',   label: 'Magical Damage',    format: 'flat',  group: 'offense',  sources: ['INT', 'WIS'] },
  { key: 'critChance',      label: 'Critical Chance',   format: 'pct',   group: 'offense',  sources: ['DEX', 'TAC'] },
  { key: 'critDamage',      label: 'Critical Damage',   format: 'pct',   group: 'offense',  sources: ['STR', 'DEX'] },
  { key: 'attackSpeed',     label: 'Attack Speed',      format: 'pct',   group: 'offense',  sources: ['DEX', 'AGI'] },
  { key: 'castSpeed',       label: 'Cast Speed',        format: 'pct',   group: 'offense',  sources: ['WIS', 'INT'] },
  { key: 'accuracy',        label: 'Accuracy',          format: 'pct',   group: 'offense',  sources: ['TAC', 'DEX'] },
  // Defense
  { key: 'physicalDefense', label: 'Physical Defense',  format: 'flat',  group: 'defense',  sources: ['END', 'VIT'] },
  { key: 'magicalDefense',  label: 'Magical Defense',   format: 'flat',  group: 'defense',  sources: ['WIS', 'INT'] },
  { key: 'blockChance',     label: 'Block Chance',      format: 'pct',   group: 'defense',  sources: ['END', 'STR'] },
  { key: 'blockEffect',     label: 'Block Effect',      format: 'pct',   group: 'defense',  sources: ['END', 'VIT'] },
  { key: 'evasion',         label: 'Evasion',           format: 'pct',   group: 'defense',  sources: ['AGI', 'DEX'] },
  { key: 'resistance',      label: 'Resistance',        format: 'pct',   group: 'defense',  sources: ['END', 'WIS'] },
  // Pools
  { key: 'maxHealth',       label: 'Max Health',        format: 'flat',  group: 'pools',    sources: ['VIT', 'END'] },
  { key: 'maxMana',         label: 'Max Mana',          format: 'flat',  group: 'pools',    sources: ['INT', 'WIS'] },
  { key: 'maxStamina',      label: 'Max Stamina',       format: 'flat',  group: 'pools',    sources: ['END', 'AGI'] },
  { key: 'hpRegen',         label: 'HP Regen',          format: 'perSec',group: 'pools',    sources: ['VIT'] },
  { key: 'manaRegen',       label: 'Mana Regen',        format: 'perSec',group: 'pools',    sources: ['WIS'] },
  { key: 'staminaRegen',    label: 'Stamina Regen',     format: 'perSec',group: 'pools',    sources: ['END', 'AGI'] },
  // Movement
  { key: 'moveSpeed',       label: 'Movement Speed',    format: 'pct',   group: 'movement', sources: ['AGI', 'DEX'] },
  // Drain / Reflect
  { key: 'drainHealth',     label: 'Life Steal',        format: 'pct',   group: 'drain',    sources: ['VIT'] },
  { key: 'drainMana',       label: 'Mana Steal',        format: 'pct',   group: 'drain',    sources: ['WIS'] },
  { key: 'reflectDamage',   label: 'Damage Reflected',  format: 'pct',   group: 'drain',    sources: ['END'] },
  { key: 'absorbHealth',    label: 'Damage Absorbed',   format: 'pct',   group: 'drain',    sources: ['VIT', 'END'] },
  // Elemental Resistances
  { key: 'fireRes',         label: 'Fire Resistance',       format: 'pct', group: 'resist', sources: ['END'] },
  { key: 'iceRes',          label: 'Ice Resistance',        format: 'pct', group: 'resist', sources: ['VIT'] },
  { key: 'lightningRes',    label: 'Lightning Resistance',  format: 'pct', group: 'resist', sources: ['AGI'] },
  { key: 'arcaneRes',       label: 'Arcane Resistance',     format: 'pct', group: 'resist', sources: ['WIS'] },
  { key: 'holyRes',         label: 'Holy Resistance',       format: 'pct', group: 'resist', sources: ['TAC'] },
  { key: 'natureRes',       label: 'Nature Resistance',     format: 'pct', group: 'resist', sources: ['VIT'] },
  { key: 'physRes',         label: 'Physical Resistance',   format: 'pct', group: 'resist', sources: ['END', 'STR'] },
  // Utility
  { key: 'harvestYield',    label: 'Harvest Yield',     format: 'pct',   group: 'utility',  sources: ['STR', 'END'] },
  { key: 'craftSpeed',      label: 'Craft Speed',       format: 'pct',   group: 'utility',  sources: ['DEX', 'INT'] },
  { key: 'carryCapacity',   label: 'Carry Capacity',    format: 'flat',  group: 'utility',  sources: ['STR', 'END'] },
  { key: 'xpBonus',         label: 'XP Bonus',          format: 'pct',   group: 'utility',  sources: ['TAC', 'WIS'] },
  { key: 'reputation',      label: 'Reputation Gain',   format: 'pct',   group: 'utility',  sources: ['TAC'] },
  { key: 'cooldownReduction', label: 'Cooldown Reduction', format: 'pct', group: 'utility', sources: ['WIS', 'DEX'] },
];

// ── Computation ─────────────────────────────────────────────────────────────

/**
 * Compute all 37 derived stats from the 8 legacy attributes on PlayerStats.
 * Equipment bonuses are additive on top — pass them through `equipBonus`
 * (keyed the same as DerivedStats fields).
 *
 * Every formula uses `dr()` for diminishing returns on the raw attribute so
 * hard-stacking a single stat plateaus predictably.
 */
export function computeDerivedStats(
  stats: PlayerStats,
  equipBonus: Partial<Record<keyof DerivedStats, number>> = {},
): DerivedStats {
  // Shorthand: DR-scaled effective attribute values.
  const S = dr(stats.strength);
  const V = dr(stats.vitality);
  const E = dr(stats.endurance);
  const I = dr(stats.intellect);
  const W = dr(stats.wisdom);
  const D = dr(stats.dexterity);
  const A = dr(stats.agility);
  const T = dr(stats.tactics);

  const add = (key: keyof DerivedStats, base: number) =>
    base + (equipBonus[key] ?? 0);

  return {
    // ── Offense ──────────────────────────────────────────────────────────
    physicalDamage:  add('physicalDamage', Math.floor(10 + S * 1.5 + D * 0.5)),
    magicalDamage:   add('magicalDamage',  Math.floor(I * 1.8 + W * 0.4)),
    critChance:      cap('criticalChance', add('critChance', 5 + D * 0.4 + T * 0.2)),
    critDamage:      cap('criticalDamage', add('critDamage', 150 + S * 1.0 + D * 0.5)),
    attackSpeed:     add('attackSpeed',  D * 0.5 + A * 0.3),
    castSpeed:       add('castSpeed',    W * 0.5 + I * 0.3),
    accuracy:        cap('accuracy',     add('accuracy', 70 + T * 0.8 + D * 0.3)),

    // ── Defense ──────────────────────────────────────────────────────────
    physicalDefense: add('physicalDefense', Math.floor(10 + E * 2.0 + V * 1.0)),
    magicalDefense:  add('magicalDefense',  Math.floor(5 + W * 1.5 + I * 0.5)),
    blockChance:     cap('block',     add('blockChance',  E * 0.4 + S * 0.2)),
    blockEffect:     cap('blockEffect', add('blockEffect', 20 + E * 0.6 + V * 0.3)),
    evasion:         add('evasion',      A * 0.5 + D * 0.3),
    resistance:      cap('resistance',   add('resistance', E * 0.3 + W * 0.2)),

    // ── Pools & Regen ────────────────────────────────────────────────────
    maxHealth:       add('maxHealth',  Math.floor(100 + V * 8 + E * 3)),
    maxMana:         add('maxMana',    Math.floor(80  + I * 6 + W * 3)),
    maxStamina:      add('maxStamina', Math.floor(100 + E * 4 + A * 2)),
    hpRegen:         add('hpRegen',    1 + V * 0.15),
    manaRegen:       add('manaRegen',  2 + W * 0.2),
    staminaRegen:    add('staminaRegen', 12 + E * 0.4 + A * 0.2),

    // ── Movement ─────────────────────────────────────────────────────────
    moveSpeed:       add('moveSpeed', A * 0.4 + D * 0.15),

    // ── Drain / Reflect / Absorb ─────────────────────────────────────────
    drainHealth:     cap('drainHealth',    add('drainHealth',    V * 0.1)),
    drainMana:       cap('drainMana',      add('drainMana',      W * 0.1)),
    reflectDamage:   cap('reflectDamage',  add('reflectDamage',  E * 0.1)),
    absorbHealth:    cap('absorbHealth',   add('absorbHealth',   V * 0.05 + E * 0.05)),

    // ── Elemental Resistances ────────────────────────────────────────────
    fireRes:         cap('resistance', add('fireRes',         E * 0.3)),
    iceRes:          cap('resistance', add('iceRes',          V * 0.3)),
    lightningRes:    cap('resistance', add('lightningRes',    A * 0.25)),
    arcaneRes:       cap('resistance', add('arcaneRes',       W * 0.3)),
    holyRes:         cap('resistance', add('holyRes',         T * 0.25)),
    natureRes:       cap('resistance', add('natureRes',       V * 0.25)),
    physRes:         cap('resistance', add('physRes',         E * 0.2 + S * 0.1)),

    // ── Economy / Utility ────────────────────────────────────────────────
    harvestYield:    add('harvestYield',  S * 0.3 + E * 0.2),
    craftSpeed:      add('craftSpeed',    D * 0.4 + I * 0.2),
    carryCapacity:   add('carryCapacity', Math.floor(20 + S * 1.5 + E * 0.5)),
    xpBonus:         add('xpBonus',       T * 0.4 + W * 0.15),
    reputation:      add('reputation',    T * 0.5),
    cooldownReduction: add('cooldownReduction', W * 0.3 + D * 0.15),
  };
}

// ── Convenience builders for the combat pipeline ─────────────────────────────

/** Build CombatStats from DerivedStats for use with calculateDamage(). */
export function derivedToCombatStats(d: DerivedStats): CombatStats {
  return {
    physicalDamage:  d.physicalDamage,
    magicalDamage:   d.magicalDamage,
    physicalDefense: d.physicalDefense,
    magicalDefense:  d.magicalDefense,
    critChance:      d.critChance,
    critDamage:      d.critDamage,
    blockChance:     d.blockChance,
    blockReduction:  d.blockEffect,
    attackSpeed:     d.attackSpeed,
    accuracy:        d.accuracy,
    evasion:         d.evasion,
  };
}

/** Build ElementalResistances from DerivedStats. */
export function derivedToResistances(d: DerivedStats): ElementalResistances {
  return {
    fire:      d.fireRes,
    ice:       d.iceRes,
    lightning: d.lightningRes,
    arcane:    d.arcaneRes,
    holy:      d.holyRes,
    nature:    d.natureRes,
    physical:  d.physRes,
  };
}
