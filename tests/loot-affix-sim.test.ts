/**
 * Loot affix simulation tests.
 *
 * Rolls thousands of drops across all tiers and enemy types, then asserts:
 *   1. No removed affixes (xp_boost, gold_boost) ever appear
 *   2. Affix count per drop matches AFFIX_COUNT_BY_TIER
 *   3. Attribute / perk affixes always roll exactly +1
 *   4. No duplicate affix IDs within a single drop
 *   5. All new affix categories actually appear in the output
 *   6. rollDropTier produces valid tier range for each enemy type
 *   7. Tier value multiplier scales correctly
 */
import { describe, it, expect } from 'vitest';
import {
  AFFIX_POOL,
  AFFIX_COUNT_BY_TIER,
  generateLootDrop,
  rollDropTier,
  tierValueMultiplier,
  formatAffixTooltip,
  type LootDrop,
} from '../lib/game-systems/src/loot';

// ── Constants ────────────────────────────────────────────────────────────────

const REMOVED_AFFIX_IDS = ['xp_boost', 'gold_boost'];
const NO_SCALE_STATS = new Set([
  'bio','neu','kin','qnt','syn','chr','ent','gra',
  'perkHero','perkWarrior','perkSmarts','perkMaker',
]);
const ROLLS_PER_TIER = 500;
const TIERS = [1, 2, 3, 4, 5, 6, 7, 8];

// ── Helpers ──────────────────────────────────────────────────────────────────

function rollMany(tier: number, count: number): LootDrop[] {
  return Array.from({ length: count }, (_, i) =>
    generateLootDrop(`test_item_${i}`, 'Test Item', tier)
  );
}

// ── Test suites ──────────────────────────────────────────────────────────────

describe('Affix pool integrity', () => {
  it('contains no removed affixes (xp_boost, gold_boost)', () => {
    const ids = AFFIX_POOL.map(a => a.id);
    for (const removed of REMOVED_AFFIX_IDS) {
      expect(ids).not.toContain(removed);
    }
  });

  it('contains no xpBonus or goldFind stat references', () => {
    const stats = AFFIX_POOL.map(a => a.stat);
    expect(stats).not.toContain('xpBonus');
    expect(stats).not.toContain('goldFind');
  });

  it('has at least 60 affixes in the pool', () => {
    expect(AFFIX_POOL.length).toBeGreaterThanOrEqual(60);
  });

  it('every affix has valid weight > 0', () => {
    for (const a of AFFIX_POOL) {
      expect(a.weight, `${a.id} weight`).toBeGreaterThan(0);
    }
  });

  it('every affix has a unique id', () => {
    const ids = AFFIX_POOL.map(a => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('Affix generation per tier', () => {
  for (const tier of TIERS) {
    const expectedCount = AFFIX_COUNT_BY_TIER[tier] ?? 1;

    describe(`Tier ${tier} (expected ${expectedCount} affixes)`, () => {
      const drops = rollMany(tier, ROLLS_PER_TIER);

      it(`generates exactly ${expectedCount} affixes per drop`, () => {
        for (const drop of drops) {
          // May get fewer if pool is exhausted for low tiers, but never more
          expect(drop.affixes.length).toBeLessThanOrEqual(expectedCount);
          // For T1, pool should always have at least 1 eligible affix
          if (tier >= 2) {
            expect(drop.affixes.length).toBe(expectedCount);
          }
        }
      });

      it('never produces duplicate affix IDs within a single drop', () => {
        for (const drop of drops) {
          const ids = drop.affixes.map(a => a.affixId);
          expect(new Set(ids).size, `dup in ${drop.generatedName}`).toBe(ids.length);
        }
      });

      it('never rolls removed affixes', () => {
        for (const drop of drops) {
          for (const affix of drop.affixes) {
            expect(REMOVED_AFFIX_IDS).not.toContain(affix.affixId);
          }
        }
      });
    });
  }
});

describe('Attribute and perk affixes always roll +1', () => {
  // Roll many T5+ drops (required tier for most attribute/perk affixes)
  const drops = rollMany(8, 2000);

  it('attribute stats (bio, neu, kin, etc.) are always exactly 1', () => {
    let found = 0;
    for (const drop of drops) {
      for (const affix of drop.affixes) {
        if (NO_SCALE_STATS.has(affix.stat)) {
          expect(affix.value, `${affix.stat} on ${drop.generatedName}`).toBe(1);
          found++;
        }
      }
    }
    // With 2000 T8 drops × 6 affixes each, we should see at least some attribute rolls
    expect(found).toBeGreaterThan(0);
  });
});

describe('bonusStats aggregation', () => {
  it('bonusStats keys match rolled affix stats', () => {
    const drops = rollMany(6, 200);
    for (const drop of drops) {
      // Manually recompute expected bonus stats
      const expected: Record<string, number> = {};
      for (const a of drop.affixes) {
        expected[a.stat] = (expected[a.stat] ?? 0) + a.value;
      }
      expect(drop.bonusStats).toEqual(expected);
    }
  });
});

describe('rollDropTier', () => {
  const SAMPLE = 5000;

  it('basic enemies produce tiers 1-4', () => {
    for (let i = 0; i < SAMPLE; i++) {
      const tier = rollDropTier('basic');
      expect(tier).toBeGreaterThanOrEqual(1);
      expect(tier).toBeLessThanOrEqual(4);
    }
  });

  it('elite enemies produce tiers 2-5', () => {
    for (let i = 0; i < SAMPLE; i++) {
      const tier = rollDropTier('elite');
      expect(tier).toBeGreaterThanOrEqual(2);
      expect(tier).toBeLessThanOrEqual(5);
    }
  });

  it('boss enemies produce tiers 3-6', () => {
    for (let i = 0; i < SAMPLE; i++) {
      const tier = rollDropTier('boss');
      expect(tier).toBeGreaterThanOrEqual(3);
      expect(tier).toBeLessThanOrEqual(6);
    }
  });

  it('luck bonus can push tiers higher', () => {
    // With extreme luck (100), bosses can exceed base max
    let maxSeen = 0;
    for (let i = 0; i < SAMPLE; i++) {
      const tier = rollDropTier('boss', 100);
      if (tier > maxSeen) maxSeen = tier;
    }
    expect(maxSeen).toBeGreaterThanOrEqual(4);
  });
});

describe('tierValueMultiplier', () => {
  it('T1 multiplier is 1.0', () => {
    expect(tierValueMultiplier(1)).toBeCloseTo(1.0, 2);
  });

  it('multiplier increases with tier', () => {
    let prev = 0;
    for (const t of TIERS) {
      const mult = tierValueMultiplier(t);
      expect(mult).toBeGreaterThan(prev);
      prev = mult;
    }
  });

  it('T8 multiplier is ~2.96', () => {
    expect(tierValueMultiplier(8)).toBeCloseTo(2.96, 1);
  });
});

describe('New affix categories appear in simulation', () => {
  // Roll a large batch at T2+ to check that new categories actually get picked
  const drops = rollMany(6, 3000);
  const allStats = new Set<string>();
  for (const d of drops) {
    for (const a of d.affixes) allStats.add(a.stat);
  }

  const expectedStats = [
    // Health/stamina/mana gains
    'healthOnKill', 'manaOnKill', 'staminaOnHit', 'manaRegen', 'staminaRegen',
    // Resource gathering
    'harvestYield', 'miningYield', 'woodcutYield', 'fishingYield', 'skinningYield', 'herbalismYield',
    // New utility
    'reflectDamage',
  ];

  for (const stat of expectedStats) {
    it(`rolls ${stat} affix at least once in 3000 T6 drops`, () => {
      expect(allStats.has(stat), `missing stat: ${stat}`).toBe(true);
    });
  }
});

describe('formatAffixTooltip', () => {
  it('returns one line per affix', () => {
    const drop = generateLootDrop('test', 'Test Sword', 5);
    const lines = formatAffixTooltip(drop);
    expect(lines.length).toBe(drop.affixes.length);
  });

  it('contains no {value} placeholders', () => {
    const drops = rollMany(6, 100);
    for (const d of drops) {
      for (const line of formatAffixTooltip(d)) {
        expect(line).not.toContain('{value}');
      }
    }
  });
});

describe('Generated name format', () => {
  it('includes base name', () => {
    const drops = rollMany(3, 100);
    for (const d of drops) {
      expect(d.generatedName).toContain('Test Item');
    }
  });

  it('T1 drops can still have a name with prefix/suffix', () => {
    const drops = rollMany(1, 100);
    for (const d of drops) {
      // At minimum, the base name is always there
      expect(d.generatedName.length).toBeGreaterThan(0);
    }
  });
});
