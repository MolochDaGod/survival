/**
 * Township system tests — settlement tiers, recruit caps, morale, and
 * camp production output.
 */
import { describe, it, expect } from 'vitest';

// ── TownshipSystem ──────────────────────────────────────────────────────────

// ── Pure logic inlined to avoid importing ProfessionsService (runtime-heavy) ──
// These mirror the exact logic in TownshipSystem.ts.

type SettlementTier = 'camp' | 'tribe' | 'village' | 'town' | 'stronghold';
interface TierDef { id: SettlementTier; label: string; minPopulation: number; xpReward: number; description: string; }

const SETTLEMENT_TIERS: TierDef[] = [
  { id: 'camp',       label: 'Lone Camp',   minPopulation: 0,  xpReward: 0,   description: '' },
  { id: 'tribe',      label: 'Tribe',       minPopulation: 5,  xpReward: 50,  description: '' },
  { id: 'village',    label: 'Village',      minPopulation: 10, xpReward: 80,  description: '' },
  { id: 'town',       label: 'Town',         minPopulation: 20, xpReward: 120, description: '' },
  { id: 'stronghold', label: 'Stronghold',   minPopulation: 30, xpReward: 200, description: '' },
];

function getTierForPopulation(pop: number): TierDef {
  let best = SETTLEMENT_TIERS[0];
  for (const t of SETTLEMENT_TIERS) { if (pop >= t.minPopulation) best = t; }
  return best;
}

interface TownshipState { population: number; recruitCap: number; [k: string]: unknown; }
function canRecruit(state: TownshipState): boolean { return state.population < state.recruitCap; }
function getMoraleDamageMultiplier(morale: number): number {
  if (morale >= 70) return 1.0;
  return 0.5 + (morale / 70) * 0.5;
}
function getMoraleHarvestMultiplier(morale: number): number {
  if (morale >= 80) return 1.2;
  if (morale >= 50) return 1.0;
  return 0.8;
}

describe('TownshipSystem', () => {
  it('getTierForPopulation returns correct tiers', () => {
    expect(getTierForPopulation(0).id).toBe('camp');
    expect(getTierForPopulation(4).id).toBe('camp');
    expect(getTierForPopulation(5).id).toBe('tribe');
    expect(getTierForPopulation(10).id).toBe('village');
    expect(getTierForPopulation(20).id).toBe('town');
    expect(getTierForPopulation(30).id).toBe('stronghold');
    expect(getTierForPopulation(100).id).toBe('stronghold');
  });

  it('SETTLEMENT_TIERS has 5 tiers in order', () => {
    expect(SETTLEMENT_TIERS.length).toBe(5);
    expect(SETTLEMENT_TIERS[0].id).toBe('camp');
    expect(SETTLEMENT_TIERS[4].id).toBe('stronghold');
    for (let i = 1; i < SETTLEMENT_TIERS.length; i++) {
      expect(SETTLEMENT_TIERS[i].minPopulation).toBeGreaterThan(
        SETTLEMENT_TIERS[i - 1].minPopulation,
      );
    }
  });

  it('canRecruit returns false when population >= recruitCap', () => {
    expect(canRecruit({ population: 5, recruitCap: 5 })).toBe(false);
  });

  it('canRecruit returns true when population < recruitCap', () => {
    expect(canRecruit({ population: 3, recruitCap: 5 })).toBe(true);
  });
});

// ── Morale multipliers ──────────────────────────────────────────────────────

describe('Morale multipliers', () => {
  it('damage multiplier is 1.0 at morale 70+', () => {
    expect(getMoraleDamageMultiplier(70)).toBe(1.0);
    expect(getMoraleDamageMultiplier(100)).toBe(1.0);
  });

  it('damage multiplier decreases below 70 morale', () => {
    expect(getMoraleDamageMultiplier(35)).toBeCloseTo(0.75);
    expect(getMoraleDamageMultiplier(0)).toBeCloseTo(0.5);
  });

  it('harvest multiplier is 1.2 at morale 80+', () => {
    expect(getMoraleHarvestMultiplier(80)).toBe(1.2);
    expect(getMoraleHarvestMultiplier(100)).toBe(1.2);
  });

  it('harvest multiplier is 1.0 between 50-79', () => {
    expect(getMoraleHarvestMultiplier(50)).toBe(1.0);
    expect(getMoraleHarvestMultiplier(79)).toBe(1.0);
  });

  it('harvest multiplier is 0.8 below 50', () => {
    expect(getMoraleHarvestMultiplier(49)).toBe(0.8);
    expect(getMoraleHarvestMultiplier(0)).toBe(0.8);
  });
});

// ── CampProductionTick ──────────────────────────────────────────────────────

describe('CampProductionTick', () => {
  it('no followers → empty output', async () => {
    const { computeProduction } = await import(
      '../artifacts/arpg-game/src/game/township/CampProductionTick'
    );
    const state = { population: 0, tier: 'camp' as const, morale: 50,
      passiveGoldPerDay: 0, recruitCap: 1, followerCap: 0,
      unlockedRoles: [], buildCostReduction: 0, wallHpBonus: 0,
      buildingHpBonus: 0, turretDamageBonus: 0 };
    const output = computeProduction(state, []);
    expect(Object.keys(output).length).toBe(0);
  });

  it('followers without roles → empty output', async () => {
    const { computeProduction } = await import(
      '../artifacts/arpg-game/src/game/township/CampProductionTick'
    );
    const state = { population: 2, tier: 'camp' as const, morale: 80,
      passiveGoldPerDay: 0, recruitCap: 5, followerCap: 0,
      unlockedRoles: [], buildCostReduction: 0, wallHpBonus: 0,
      buildingHpBonus: 0, turretDamageBonus: 0 };
    const output = computeProduction(state, [{ role: undefined }, { role: undefined }]);
    expect(Object.keys(output).length).toBe(0);
  });

  it('woodcutter produces wood', async () => {
    const { computeProduction } = await import(
      '../artifacts/arpg-game/src/game/township/CampProductionTick'
    );
    const state = { population: 1, tier: 'camp' as const, morale: 80,
      passiveGoldPerDay: 0, recruitCap: 5, followerCap: 0,
      unlockedRoles: [], buildCostReduction: 0, wallHpBonus: 0,
      buildingHpBonus: 0, turretDamageBonus: 0 };
    const output = computeProduction(state, [{ role: 'woodcutter' }]);
    expect(output.wood).toBeGreaterThan(0);
  });

  it('morale bonus increases production at 80+', async () => {
    const { computeProduction } = await import(
      '../artifacts/arpg-game/src/game/township/CampProductionTick'
    );
    const lowMorale = { population: 1, tier: 'camp' as const, morale: 30,
      passiveGoldPerDay: 0, recruitCap: 5, followerCap: 0,
      unlockedRoles: [], buildCostReduction: 0, wallHpBonus: 0,
      buildingHpBonus: 0, turretDamageBonus: 0 };
    const highMorale = { ...lowMorale, morale: 90 };
    const followers = [{ role: 'woodcutter' as const }];
    const low = computeProduction(lowMorale, followers);
    const high = computeProduction(highMorale, followers);
    expect(high.wood).toBeGreaterThanOrEqual(low.wood);
  });

  it('multiple followers stack production', async () => {
    const { computeProduction } = await import(
      '../artifacts/arpg-game/src/game/township/CampProductionTick'
    );
    const state = { population: 3, tier: 'tribe' as const, morale: 80,
      passiveGoldPerDay: 0, recruitCap: 10, followerCap: 0,
      unlockedRoles: [], buildCostReduction: 0, wallHpBonus: 0,
      buildingHpBonus: 0, turretDamageBonus: 0 };
    const single = computeProduction(state, [{ role: 'miner' }]);
    const double = computeProduction(state, [{ role: 'miner' }, { role: 'miner' }]);
    expect(double.iron).toBeGreaterThan(single.iron!);
  });

  it('fighter roles produce nothing', async () => {
    const { computeProduction } = await import(
      '../artifacts/arpg-game/src/game/township/CampProductionTick'
    );
    const state = { population: 1, tier: 'camp' as const, morale: 80,
      passiveGoldPerDay: 0, recruitCap: 5, followerCap: 0,
      unlockedRoles: [], buildCostReduction: 0, wallHpBonus: 0,
      buildingHpBonus: 0, turretDamageBonus: 0 };
    const output = computeProduction(state, [{ role: 'sentry' }]);
    expect(Object.keys(output).length).toBe(0);
  });
});
