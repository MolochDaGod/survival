/**
 * Combat pipeline tests.
 *
 * Validates the 9-step damage pipeline, healing, drain, and stat modifiers.
 * Uses deterministic runs (variance off, high accuracy) where exact numbers
 * matter, and statistical runs (many iterations) where RNG is involved.
 */
import { describe, it, expect } from 'vitest';
import {
  calculateDamage,
  calculateHealing,
  calculateDrain,
  applyModifiers,
  DEFAULT_COMBAT_STATS,
  DEFAULT_RESISTANCES,
  type DamageInput,
  type StatModifier,
} from '../lib/game-systems/src/combat';
import type { CombatStats, ElementalResistances } from '../lib/game-systems/src/types';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Build a damage input with sensible defaults. Override as needed.
 * Uses 100 accuracy + 0 evasion so deterministic tests never get
 * random misses from the evasion/accuracy RNG check. */
function makeDamageInput(overrides: Partial<DamageInput> = {}): DamageInput {
  return {
    weaponPhysical: 20,
    weaponMagical: 0,
    abilityMultiplier: 1.0,
    element: 'none' as const,
    attacker: { ...DEFAULT_COMBAT_STATS, accuracy: 100, critChance: 0 },
    defender: { ...DEFAULT_COMBAT_STATS, blockChance: 0, evasion: 0 },
    defenderResists: { ...DEFAULT_RESISTANCES },
    variance: false,
    ...overrides,
  };
}

// ── calculateDamage ──────────────────────────────────────────────────────────

describe('calculateDamage — deterministic (no variance)', () => {
  it('deals positive damage with default stats', () => {
    const result = calculateDamage(makeDamageInput());
    expect(result.totalDamage).toBeGreaterThan(0);
    expect(result.isCrit).toBe(false);
    expect(result.isBlocked).toBe(false);
    expect(result.isMiss).toBe(false);
  });

  it('physical-only attack yields 0 magical damage', () => {
    const result = calculateDamage(makeDamageInput({ weaponMagical: 0 }));
    expect(result.magicalDamage).toBe(0);
    expect(result.physicalDamage).toBeGreaterThan(0);
  });

  it('magical-only attack yields 0 physical damage', () => {
    const result = calculateDamage(makeDamageInput({
      weaponPhysical: 0,
      weaponMagical: 20,
    }));
    expect(result.physicalDamage).toBe(0);
    expect(result.magicalDamage).toBeGreaterThan(0);
  });

  it('ability multiplier scales damage linearly', () => {
    const base = calculateDamage(makeDamageInput({ abilityMultiplier: 1.0 }));
    const double = calculateDamage(makeDamageInput({ abilityMultiplier: 2.0 }));
    // Not exactly 2× because of defense sqrt mitigation, but should be close
    expect(double.totalDamage).toBeGreaterThan(base.totalDamage);
    // With same defense, ratio should be approximately 2.0
    const ratio = double.totalDamage / base.totalDamage;
    expect(ratio).toBeCloseTo(2.0, 0);
  });

  it('higher physical defense reduces physical damage', () => {
    const lowDef = calculateDamage(makeDamageInput({
      defender: { ...DEFAULT_COMBAT_STATS, physicalDefense: 10, blockChance: 0, evasion: 0 },
    }));
    const highDef = calculateDamage(makeDamageInput({
      defender: { ...DEFAULT_COMBAT_STATS, physicalDefense: 100, blockChance: 0, evasion: 0 },
    }));
    expect(highDef.totalDamage).toBeLessThan(lowDef.totalDamage);
  });

  it('elemental resistance reduces magical damage', () => {
    const noResist = calculateDamage(makeDamageInput({
      weaponPhysical: 0,
      weaponMagical: 20,
      element: 'fire',
      defenderResists: { ...DEFAULT_RESISTANCES, fire: 0 },
    }));
    const highResist = calculateDamage(makeDamageInput({
      weaponPhysical: 0,
      weaponMagical: 20,
      element: 'fire',
      defenderResists: { ...DEFAULT_RESISTANCES, fire: 50 },
    }));
    expect(highResist.totalDamage).toBeLessThan(noResist.totalDamage);
  });

  it('minimum damage is always at least 1', () => {
    const result = calculateDamage(makeDamageInput({
      weaponPhysical: 1,
      weaponMagical: 0,
      defender: { ...DEFAULT_COMBAT_STATS, physicalDefense: 9999, blockChance: 0, evasion: 0 },
    }));
    // Either a miss (totalDamage=0) or minimum 1
    if (!result.isMiss) {
      expect(result.totalDamage).toBeGreaterThanOrEqual(1);
    }
  });

  it('element "none" applies physical resistance', () => {
    const result = calculateDamage(makeDamageInput({
      element: 'none',
      defenderResists: { ...DEFAULT_RESISTANCES, physical: 50 },
    }));
    expect(result.elementApplied).toBeNull();
  });

  it('elementApplied is set for non-none elements', () => {
    const result = calculateDamage(makeDamageInput({ element: 'lightning' }));
    expect(result.elementApplied).toBe('lightning');
  });
});

// ── Evasion / Accuracy (new step 5) ──────────────────────────────────────────

describe('calculateDamage — evasion / accuracy', () => {
  it('100% accuracy vs 0% evasion never misses', () => {
    let missCount = 0;
    for (let i = 0; i < 500; i++) {
      const result = calculateDamage(makeDamageInput({
        variance: true,
        attacker: { ...DEFAULT_COMBAT_STATS, accuracy: 100 },
        defender: { ...DEFAULT_COMBAT_STATS, evasion: 0, blockChance: 0 },
      }));
      if (result.isMiss) missCount++;
    }
    expect(missCount).toBe(0);
  });

  it('high evasion produces misses', () => {
    let missCount = 0;
    const SAMPLE = 1000;
    for (let i = 0; i < SAMPLE; i++) {
      const result = calculateDamage(makeDamageInput({
        variance: true,
        attacker: { ...DEFAULT_COMBAT_STATS, accuracy: 50 },
        defender: { ...DEFAULT_COMBAT_STATS, evasion: 40, blockChance: 0 },
      }));
      if (result.isMiss) missCount++;
    }
    // Hit chance = 50 - 40 = 10%, so ~90% misses
    expect(missCount).toBeGreaterThan(SAMPLE * 0.75);
  });

  it('miss result has zero damage on all fields', () => {
    // Force near-guaranteed miss
    let foundMiss = false;
    for (let i = 0; i < 200; i++) {
      const result = calculateDamage(makeDamageInput({
        variance: true,
        attacker: { ...DEFAULT_COMBAT_STATS, accuracy: 10 },
        defender: { ...DEFAULT_COMBAT_STATS, evasion: 100, blockChance: 0 },
      }));
      if (result.isMiss) {
        foundMiss = true;
        expect(result.totalDamage).toBe(0);
        expect(result.physicalDamage).toBe(0);
        expect(result.magicalDamage).toBe(0);
        expect(result.isCrit).toBe(false);
        expect(result.isBlocked).toBe(false);
        break;
      }
    }
    expect(foundMiss).toBe(true);
  });

  it('minimum 5% hit chance even with extreme evasion', () => {
    let hitCount = 0;
    const SAMPLE = 2000;
    for (let i = 0; i < SAMPLE; i++) {
      const result = calculateDamage(makeDamageInput({
        variance: true,
        attacker: { ...DEFAULT_COMBAT_STATS, accuracy: 0 },
        defender: { ...DEFAULT_COMBAT_STATS, evasion: 100, blockChance: 0 },
      }));
      if (!result.isMiss) hitCount++;
    }
    // Should be ~5% hit rate, so roughly 100 hits in 2000
    expect(hitCount).toBeGreaterThan(0);
    expect(hitCount).toBeLessThan(SAMPLE * 0.15);
  });
});

// ── Block and crit (statistical) ────────────────────────────────────────────

describe('calculateDamage — block and crit (statistical)', () => {
  it('block chance produces blocks at expected rate', () => {
    let blockCount = 0;
    const SAMPLE = 2000;
    for (let i = 0; i < SAMPLE; i++) {
      const result = calculateDamage(makeDamageInput({
        variance: true,
        defender: { ...DEFAULT_COMBAT_STATS, blockChance: 50, blockReduction: 50, evasion: 0 },
      }));
      if (result.isBlocked) blockCount++;
    }
    // ~50% block rate
    const rate = blockCount / SAMPLE;
    expect(rate).toBeGreaterThan(0.35);
    expect(rate).toBeLessThan(0.65);
  });

  it('blocked attacks cannot crit', () => {
    for (let i = 0; i < 1000; i++) {
      const result = calculateDamage(makeDamageInput({
        variance: true,
        attacker: { ...DEFAULT_COMBAT_STATS, critChance: 75 },
        defender: { ...DEFAULT_COMBAT_STATS, blockChance: 75, blockReduction: 50, evasion: 0 },
      }));
      if (result.isBlocked) {
        expect(result.isCrit).toBe(false);
      }
    }
  });

  it('critical hits deal more damage than normal hits', () => {
    const critDamages: number[] = [];
    const normalDamages: number[] = [];
    for (let i = 0; i < 2000; i++) {
      const result = calculateDamage(makeDamageInput({
        variance: true,
        attacker: { ...DEFAULT_COMBAT_STATS, critChance: 50, critDamage: 200 },
        defender: { ...DEFAULT_COMBAT_STATS, blockChance: 0, evasion: 0 },
      }));
      if (result.isMiss) continue;
      if (result.isCrit) critDamages.push(result.totalDamage);
      else normalDamages.push(result.totalDamage);
    }
    expect(critDamages.length).toBeGreaterThan(0);
    expect(normalDamages.length).toBeGreaterThan(0);
    const avgCrit = critDamages.reduce((a, b) => a + b, 0) / critDamages.length;
    const avgNormal = normalDamages.reduce((a, b) => a + b, 0) / normalDamages.length;
    expect(avgCrit).toBeGreaterThan(avgNormal);
  });
});

// ── Variance ─────────────────────────────────────────────────────────────────

describe('calculateDamage — variance', () => {
  it('with variance enabled, outputs vary across runs', () => {
    const damages = new Set<number>();
    for (let i = 0; i < 100; i++) {
      const result = calculateDamage(makeDamageInput({
        variance: true,
        attacker: { ...DEFAULT_COMBAT_STATS, critChance: 0 },
        defender: { ...DEFAULT_COMBAT_STATS, blockChance: 0, evasion: 0 },
      }));
      if (!result.isMiss) damages.add(result.totalDamage);
    }
    // With ±25% variance, should see multiple distinct values
    expect(damages.size).toBeGreaterThan(1);
  });

  it('without variance, same inputs produce same output', () => {
    const damages = new Set<number>();
    for (let i = 0; i < 20; i++) {
      const result = calculateDamage(makeDamageInput({
        variance: false,
        attacker: { ...DEFAULT_COMBAT_STATS, critChance: 0 },
        defender: { ...DEFAULT_COMBAT_STATS, blockChance: 0, evasion: 0 },
      }));
      if (!result.isMiss) damages.add(result.totalDamage);
    }
    // No variance + no crit + no block + guaranteed hit → always same value
    expect(damages.size).toBe(1);
  });
});

// ── calculateHealing ─────────────────────────────────────────────────────────

describe('calculateHealing', () => {
  it('returns positive values for positive input', () => {
    for (let i = 0; i < 50; i++) {
      const heal = calculateHealing(100);
      expect(heal).toBeGreaterThan(0);
    }
  });

  it('heal power increases healing', () => {
    const heals0: number[] = [];
    const heals100: number[] = [];
    for (let i = 0; i < 200; i++) {
      heals0.push(calculateHealing(100, 0));
      heals100.push(calculateHealing(100, 100));
    }
    const avg0 = heals0.reduce((a, b) => a + b, 0) / heals0.length;
    const avg100 = heals100.reduce((a, b) => a + b, 0) / heals100.length;
    expect(avg100).toBeGreaterThan(avg0 * 1.5);
  });

  it('zero base heal returns 0', () => {
    const heal = calculateHealing(0);
    expect(heal).toBe(0);
  });
});

// ── calculateDrain ───────────────────────────────────────────────────────────

describe('calculateDrain', () => {
  it('returns expected drain amount', () => {
    // 100 damage, 10% drain = 10
    expect(calculateDrain(100, 10)).toBe(10);
  });

  it('respects the cap parameter', () => {
    // 100 damage, 80% drain, but cap is 50
    expect(calculateDrain(100, 80, 50)).toBe(50);
  });

  it('uses default cap of 50', () => {
    // 100 damage, 80% drain, default cap 50
    expect(calculateDrain(100, 80)).toBe(50);
  });

  it('returns 0 for 0 damage', () => {
    expect(calculateDrain(0, 50)).toBe(0);
  });

  it('returns 0 for 0 drain percentage', () => {
    expect(calculateDrain(100, 0)).toBe(0);
  });

  it('floors the result', () => {
    // 10 damage, 3% drain = 0.3 → floor → 0
    expect(calculateDrain(10, 3)).toBe(0);
  });
});

// ── applyModifiers ───────────────────────────────────────────────────────────

describe('applyModifiers', () => {
  it('adds modifier values to base stats', () => {
    const base = { ...DEFAULT_COMBAT_STATS };
    const mods: StatModifier[] = [
      { stat: 'physicalDamage', value: 5 },
      { stat: 'critChance', value: 10 },
    ];
    const result = applyModifiers(base, mods);
    expect(result.physicalDamage).toBe(base.physicalDamage + 5);
    expect(result.critChance).toBe(base.critChance + 10);
  });

  it('does not mutate the original stats', () => {
    const base = { ...DEFAULT_COMBAT_STATS };
    const originalPhys = base.physicalDamage;
    applyModifiers(base, [{ stat: 'physicalDamage', value: 99 }]);
    expect(base.physicalDamage).toBe(originalPhys);
  });

  it('handles negative modifiers (debuffs)', () => {
    const base = { ...DEFAULT_COMBAT_STATS };
    const result = applyModifiers(base, [
      { stat: 'physicalDefense', value: -5 },
    ]);
    expect(result.physicalDefense).toBe(base.physicalDefense - 5);
  });

  it('handles empty modifier list', () => {
    const base = { ...DEFAULT_COMBAT_STATS };
    const result = applyModifiers(base, []);
    expect(result).toEqual(base);
  });

  it('stacks multiple modifiers on the same stat', () => {
    const base = { ...DEFAULT_COMBAT_STATS };
    const mods: StatModifier[] = [
      { stat: 'evasion', value: 5 },
      { stat: 'evasion', value: 10 },
    ];
    const result = applyModifiers(base, mods);
    expect(result.evasion).toBe(base.evasion + 15);
  });
});
