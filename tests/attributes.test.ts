/**
 * Attribute system tests.
 *
 * Validates the Nexus 8-stat attribute engine: cost curves, diminishing
 * returns, stat caps, budget accounting, and milestone perk badges.
 */
import { describe, it, expect } from 'vitest';
import {
  STARTING_BUDGET,
  STAT_MIN,
  STAT_MAX,
  STAT_DEFAULT,
  STAT_COST,
  costToReach,
  costForNext,
  computeSpentPoints,
  STAT_META,
  DR_FULL_CAP,
  DR_HALF_CAP,
  effectivePoints,
  STAT_CAPS,
  clampStat,
  STAT_MILESTONE_PERKS,
  getBadgesEarned,
} from '../lib/game-systems/src/attributes';
import type { GrudgeStats, GrudgeStatKey } from '../lib/game-systems/src/types';

// ── Constants ────────────────────────────────────────────────────────────────

describe('Attribute constants', () => {
  it('starting budget is 24', () => {
    expect(STARTING_BUDGET).toBe(24);
  });

  it('stat range is 0-6', () => {
    expect(STAT_MIN).toBe(0);
    expect(STAT_MAX).toBe(6);
  });

  it('default stat value is 0', () => {
    expect(STAT_DEFAULT).toBe(0);
  });

  it('STAT_COST has 7 entries (index 0 unused + levels 1-6)', () => {
    expect(STAT_COST.length).toBe(7);
    expect(STAT_COST[0]).toBe(0);
  });

  it('cost increases with each level', () => {
    for (let i = 2; i < STAT_COST.length; i++) {
      expect(STAT_COST[i]).toBeGreaterThan(STAT_COST[i - 1]);
    }
  });
});

// ── Cost helpers ─────────────────────────────────────────────────────────────

describe('costToReach', () => {
  it('level 0 costs 0', () => {
    expect(costToReach(0)).toBe(0);
  });

  it('level 1 costs STAT_COST[1]', () => {
    expect(costToReach(1)).toBe(STAT_COST[1]);
  });

  it('level 6 equals sum of all costs', () => {
    const expected = STAT_COST.slice(1).reduce((a, b) => a + b, 0);
    expect(costToReach(6)).toBe(expected);
  });

  it('is monotonically increasing', () => {
    let prev = 0;
    for (let i = 1; i <= STAT_MAX; i++) {
      const cost = costToReach(i);
      expect(cost).toBeGreaterThan(prev);
      prev = cost;
    }
  });
});

describe('costForNext', () => {
  it('next cost from 0 is STAT_COST[1]', () => {
    expect(costForNext(0)).toBe(STAT_COST[1]);
  });

  it('at max level returns Infinity', () => {
    expect(costForNext(STAT_MAX)).toBe(Infinity);
  });

  it('returns correct cost for each level', () => {
    for (let i = 0; i < STAT_MAX; i++) {
      expect(costForNext(i)).toBe(STAT_COST[i + 1]);
    }
  });
});

describe('computeSpentPoints', () => {
  it('all-zero stats cost 0', () => {
    const stats: GrudgeStats = { bio: 0, neu: 0, kin: 0, qnt: 0, syn: 0, chr: 0, ent: 0, gra: 0 };
    expect(computeSpentPoints(stats)).toBe(0);
  });

  it('single stat at 1 costs STAT_COST[1]', () => {
    const stats: GrudgeStats = { bio: 1, neu: 0, kin: 0, qnt: 0, syn: 0, chr: 0, ent: 0, gra: 0 };
    expect(computeSpentPoints(stats)).toBe(STAT_COST[1]);
  });

  it('all stats at 1 costs 8 × STAT_COST[1]', () => {
    const stats: GrudgeStats = { bio: 1, neu: 1, kin: 1, qnt: 1, syn: 1, chr: 1, ent: 1, gra: 1 };
    expect(computeSpentPoints(stats)).toBe(8 * STAT_COST[1]);
  });

  it('budget accounting: even spread within budget', () => {
    // 24 budget, STAT_COST[1] = 1, so 24 points can buy 8 × level-1 and
    // then the rest depends on STAT_COST[2].
    const stats: GrudgeStats = { bio: 1, neu: 1, kin: 1, qnt: 1, syn: 1, chr: 1, ent: 1, gra: 1 };
    expect(computeSpentPoints(stats)).toBeLessThanOrEqual(STARTING_BUDGET);
  });
});

// ── STAT_META ────────────────────────────────────────────────────────────────

describe('STAT_META', () => {
  it('has exactly 8 entries', () => {
    expect(STAT_META.length).toBe(8);
  });

  it('each entry has all required fields', () => {
    for (const meta of STAT_META) {
      expect(meta.key).toBeTruthy();
      expect(meta.label).toBeTruthy();
      expect(meta.abbr).toBeTruthy();
      expect(meta.color).toMatch(/^#/);
      expect(meta.desc).toBeTruthy();
      expect(meta.icon).toBeTruthy();
    }
  });

  it('keys match GrudgeStatKey order', () => {
    const keys = STAT_META.map(m => m.key);
    expect(keys).toEqual(['bio', 'neu', 'kin', 'qnt', 'syn', 'chr', 'ent', 'gra']);
  });

  it('abbreviations are uppercase 3-letter codes', () => {
    for (const meta of STAT_META) {
      expect(meta.abbr).toMatch(/^[A-Z]{3}$/);
    }
  });
});

// ── Diminishing returns ──────────────────────────────────────────────────────

describe('effectivePoints (diminishing returns)', () => {
  it('returns input unchanged below DR_FULL_CAP', () => {
    for (let i = 0; i <= DR_FULL_CAP; i++) {
      expect(effectivePoints(i)).toBe(i);
    }
  });

  it('returns less than input above DR_FULL_CAP', () => {
    for (let i = DR_FULL_CAP + 1; i <= 100; i++) {
      expect(effectivePoints(i)).toBeLessThan(i);
    }
  });

  it('is monotonically increasing', () => {
    let prev = -1;
    for (let i = 0; i <= 200; i++) {
      const eff = effectivePoints(i);
      expect(eff).toBeGreaterThanOrEqual(prev);
      prev = eff;
    }
  });

  it('half-rate kicks in between FULL_CAP and HALF_CAP', () => {
    const atCap = effectivePoints(DR_FULL_CAP);
    const onePast = effectivePoints(DR_FULL_CAP + 2);
    // 2 points above cap should yield only 1 effective point more (0.5 rate)
    expect(onePast - atCap).toBeCloseTo(1, 0);
  });

  it('quarter-rate kicks in above HALF_CAP', () => {
    const atHalf = effectivePoints(DR_HALF_CAP);
    const fourPast = effectivePoints(DR_HALF_CAP + 4);
    // 4 points above half-cap should yield only 1 effective point more (0.25 rate)
    expect(fourPast - atHalf).toBeCloseTo(1, 0);
  });
});

// ── Stat caps ────────────────────────────────────────────────────────────────

describe('clampStat', () => {
  it('clamps block to 75', () => {
    expect(clampStat('block', 100)).toBe(75);
  });

  it('clamps criticalChance to 75', () => {
    expect(clampStat('criticalChance', 90)).toBe(75);
  });

  it('does not clamp values below the cap', () => {
    expect(clampStat('block', 50)).toBe(50);
  });

  it('returns value unchanged for uncapped stats', () => {
    expect(clampStat('somethingElse', 999)).toBe(999);
  });

  it('all documented caps are present', () => {
    const expected = ['block', 'criticalChance', 'blockEffect', 'criticalDamage',
      'accuracy', 'resistance', 'drainHealth', 'drainMana',
      'reflectDamage', 'absorbHealth', 'absorbMana'];
    for (const key of expected) {
      expect(STAT_CAPS[key]).toBeDefined();
      expect(STAT_CAPS[key]).toBeGreaterThan(0);
    }
  });
});

// ── Milestone perks ──────────────────────────────────────────────────────────

describe('STAT_MILESTONE_PERKS', () => {
  it('has entries for all 8 stats', () => {
    const statKeys: GrudgeStatKey[] = ['bio', 'neu', 'kin', 'qnt', 'syn', 'chr', 'ent', 'gra'];
    for (const key of statKeys) {
      expect(STAT_MILESTONE_PERKS[key]).toBeDefined();
      expect(STAT_MILESTONE_PERKS[key].length).toBe(6); // 6 milestones per stat
    }
  });

  it('each perk has name, desc, and icon', () => {
    for (const key of Object.keys(STAT_MILESTONE_PERKS) as GrudgeStatKey[]) {
      for (const perk of STAT_MILESTONE_PERKS[key]) {
        expect(perk.perkName).toBeTruthy();
        expect(perk.perkDesc).toBeTruthy();
        expect(perk.icon).toBeTruthy();
      }
    }
  });
});

describe('getBadgesEarned', () => {
  it('returns empty array for all-zero stats', () => {
    const stats: GrudgeStats = { bio: 0, neu: 0, kin: 0, qnt: 0, syn: 0, chr: 0, ent: 0, gra: 0 };
    expect(getBadgesEarned(stats)).toEqual([]);
  });

  it('returns 1 badge for stat at 1', () => {
    const stats: GrudgeStats = { bio: 1, neu: 0, kin: 0, qnt: 0, syn: 0, chr: 0, ent: 0, gra: 0 };
    const badges = getBadgesEarned(stats);
    expect(badges.length).toBe(1);
    expect(badges[0].statKey).toBe('bio');
    expect(badges[0].milestone).toBe(1);
  });

  it('returns correct number of badges for multiple stats', () => {
    const stats: GrudgeStats = { bio: 3, neu: 2, kin: 0, qnt: 0, syn: 0, chr: 0, ent: 0, gra: 0 };
    const badges = getBadgesEarned(stats);
    // bio: 3 badges (milestones 1, 2, 3) + neu: 2 badges = 5
    expect(badges.length).toBe(5);
  });

  it('max badges = 6 per stat × 8 stats = 48', () => {
    const stats: GrudgeStats = { bio: 6, neu: 6, kin: 6, qnt: 6, syn: 6, chr: 6, ent: 6, gra: 6 };
    const badges = getBadgesEarned(stats);
    expect(badges.length).toBe(48);
  });

  it('badges include correct perk names from STAT_MILESTONE_PERKS', () => {
    const stats: GrudgeStats = { bio: 2, neu: 0, kin: 0, qnt: 0, syn: 0, chr: 0, ent: 0, gra: 0 };
    const badges = getBadgesEarned(stats);
    expect(badges[0].perkName).toBe(STAT_MILESTONE_PERKS.bio[0].perkName);
    expect(badges[1].perkName).toBe(STAT_MILESTONE_PERKS.bio[1].perkName);
  });
});
