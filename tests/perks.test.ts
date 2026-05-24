/**
 * Perk system tests — Nexus milestone effects and effect bag utilities.
 */
import { describe, it, expect } from 'vitest';
import {
  getMilestoneEffects,
  mergeEffectBags,
  readEffect,
  MILESTONE_EFFECTS,
  type MilestoneEffectBag,
} from '../lib/game-systems/src/perks';
import type { GrudgeStats, GrudgeStatKey } from '../lib/game-systems/src/types';

// ── Helpers ──────────────────────────────────────────────────────────────────

function zeroStats(): GrudgeStats {
  return { bio: 0, neu: 0, kin: 0, qnt: 0, syn: 0, chr: 0, ent: 0, gra: 0 };
}

// ── MILESTONE_EFFECTS table integrity ────────────────────────────────────────

describe('MILESTONE_EFFECTS table', () => {
  const statKeys: GrudgeStatKey[] = ['bio', 'neu', 'kin', 'qnt', 'syn', 'chr', 'ent', 'gra'];

  it('has entries for all 8 stats', () => {
    for (const key of statKeys) {
      expect(MILESTONE_EFFECTS[key]).toBeDefined();
    }
  });

  it('each stat has exactly 6 milestone entries', () => {
    for (const key of statKeys) {
      expect(MILESTONE_EFFECTS[key].length).toBe(6);
    }
  });

  it('every entry is a non-empty object with numeric values', () => {
    for (const key of statKeys) {
      for (const entry of MILESTONE_EFFECTS[key]) {
        const keys = Object.keys(entry);
        expect(keys.length).toBeGreaterThan(0);
        for (const v of Object.values(entry)) {
          expect(typeof v).toBe('number');
        }
      }
    }
  });
});

// ── getMilestoneEffects ──────────────────────────────────────────────────────

describe('getMilestoneEffects', () => {
  it('all-zero stats produce empty bag', () => {
    const bag = getMilestoneEffects(zeroStats());
    expect(Object.keys(bag).length).toBe(0);
  });

  it('bio=1 gives milestone 1 effects (Iron Constitution)', () => {
    const stats = { ...zeroStats(), bio: 1 };
    const bag = getMilestoneEffects(stats);
    expect(bag.maxHp).toBe(5);
    expect(bag.bleedResist).toBeCloseTo(0.10);
  });

  it('bio=3 sums milestones 1+2+3', () => {
    const stats = { ...zeroStats(), bio: 3 };
    const bag = getMilestoneEffects(stats);
    // maxHp: 5 + 10 + 20 = 35
    expect(bag.maxHp).toBe(35);
    // toxinResist: 0 + 0.15 + 0.30 = 0.45
    expect(bag.toxinResist).toBeCloseTo(0.45);
  });

  it('bio=6 sums all 6 milestones', () => {
    const stats = { ...zeroStats(), bio: 6 };
    const bag = getMilestoneEffects(stats);
    // maxHp: 5+10+20+35+55+80 = 205
    expect(bag.maxHp).toBe(205);
    expect(bag.deathDefiance).toBe(1);
  });

  it('clamped at 6 even if stat is higher', () => {
    const stats = { ...zeroStats(), bio: 99 };
    const bag = getMilestoneEffects(stats);
    // Same as bio=6
    expect(bag.maxHp).toBe(205);
  });

  it('kin=2 gives moveSpeed + meleeDamage', () => {
    const stats = { ...zeroStats(), kin: 2 };
    const bag = getMilestoneEffects(stats);
    // kin m1: moveSpeed 0.05, kin m2: meleeDamage 0.10
    expect(bag.moveSpeed).toBeCloseTo(0.05);
    expect(bag.meleeDamage).toBeCloseTo(0.10);
  });

  it('multiple stats produce combined effects', () => {
    const stats = { ...zeroStats(), bio: 1, kin: 1 };
    const bag = getMilestoneEffects(stats);
    expect(bag.maxHp).toBe(5);          // from bio m1
    expect(bag.moveSpeed).toBeCloseTo(0.05); // from kin m1
  });

  it('maxed all stats produces a large bag', () => {
    const stats: GrudgeStats = { bio: 6, neu: 6, kin: 6, qnt: 6, syn: 6, chr: 6, ent: 6, gra: 6 };
    const bag = getMilestoneEffects(stats);
    // Should have many keys
    expect(Object.keys(bag).length).toBeGreaterThan(20);
  });
});

// ── mergeEffectBags ──────────────────────────────────────────────────────────

describe('mergeEffectBags', () => {
  it('merges two bags additively', () => {
    const a: MilestoneEffectBag = { maxHp: 10, moveSpeed: 0.05 };
    const b: MilestoneEffectBag = { maxHp: 20, critChance: 0.08 };
    const result = mergeEffectBags(a, b);
    expect(result.maxHp).toBe(30);
    expect(result.moveSpeed).toBeCloseTo(0.05);
    expect(result.critChance).toBeCloseTo(0.08);
  });

  it('does not mutate inputs', () => {
    const a: MilestoneEffectBag = { maxHp: 10 };
    const b: MilestoneEffectBag = { maxHp: 5 };
    mergeEffectBags(a, b);
    expect(a.maxHp).toBe(10);
    expect(b.maxHp).toBe(5);
  });

  it('handles empty bags', () => {
    const a: MilestoneEffectBag = { maxHp: 10 };
    expect(mergeEffectBags(a, {})).toEqual(a);
    expect(mergeEffectBags({}, a)).toEqual(a);
    expect(mergeEffectBags({}, {})).toEqual({});
  });
});

// ── readEffect ───────────────────────────────────────────────────────────────

describe('readEffect', () => {
  it('returns value when key exists', () => {
    expect(readEffect({ maxHp: 42 }, 'maxHp')).toBe(42);
  });

  it('returns 0 for missing keys', () => {
    expect(readEffect({}, 'nonexistent')).toBe(0);
  });

  it('returns 0 for empty bag', () => {
    expect(readEffect({}, 'maxHp')).toBe(0);
  });
});
