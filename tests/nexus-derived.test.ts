/**
 * Nexus bake tests — voxel-era defaults + derived sheet from BIO…GRA.
 */
import { describe, it, expect } from 'vitest';
import {
  STARTING_BUDGET,
  DEFAULT_STATS,
  VOXEL_ERA_STARTER_STATS,
  computeSpentPoints,
  computeDerivedFromNexus,
  applyNexusToPlayerStats,
  createVoxelEraNexusDefaults,
  NEXUS_PRIMARY,
  NEXUS_DERIVED_META,
} from '../lib/game-systems/src/index';
import type { PlayerStats } from '../lib/game-systems/src/types';

describe('Nexus primary catalog', () => {
  it('has 8 primaries BIO…GRA', () => {
    expect(NEXUS_PRIMARY).toHaveLength(8);
    expect(NEXUS_PRIMARY.map((p) => p.abbr)).toEqual([
      'BIO', 'NEU', 'KIN', 'QNT', 'SYN', 'CHR', 'ENT', 'GRA',
    ]);
  });

  it('BIO lists affinity keys including maxHpBonus', () => {
    const bio = NEXUS_PRIMARY.find((p) => p.key === 'bio')!;
    expect(bio.affinities).toContain('maxHpBonus');
    expect(bio.affinities.length).toBeGreaterThanOrEqual(20);
  });
});

describe('Voxel-era defaults', () => {
  it('DEFAULT_STATS is all zeros', () => {
    expect(DEFAULT_STATS).toEqual({
      bio: 0, neu: 0, kin: 0, qnt: 0, syn: 0, chr: 0, ent: 0, gra: 0,
    });
  });

  it('VOXEL_ERA_STARTER spends 3 points (BIO/NEU/KIN = 1)', () => {
    expect(VOXEL_ERA_STARTER_STATS.bio).toBe(1);
    expect(VOXEL_ERA_STARTER_STATS.neu).toBe(1);
    expect(VOXEL_ERA_STARTER_STATS.kin).toBe(1);
    expect(computeSpentPoints(VOXEL_ERA_STARTER_STATS)).toBe(3);
    expect(STARTING_BUDGET - 3).toBe(21);
  });

  it('createVoxelEraNexusDefaults returns starter + derived', () => {
    const d = createVoxelEraNexusDefaults();
    expect(d.stats).toEqual(VOXEL_ERA_STARTER_STATS);
    expect(d.budget).toBe(24);
    expect(d.spent).toBe(3);
    expect(d.derived.health).toBeGreaterThan(100);
  });
});

describe('computeDerivedFromNexus', () => {
  it('exports 37 derived meta rows', () => {
    expect(NEXUS_DERIVED_META).toHaveLength(37);
  });

  it('BIO raises health', () => {
    const low = computeDerivedFromNexus({ ...DEFAULT_STATS, bio: 0 });
    const high = computeDerivedFromNexus({ ...DEFAULT_STATS, bio: 3 });
    expect(high.health).toBeGreaterThan(low.health);
  });

  it('KIN raises damage and stamina', () => {
    const low = computeDerivedFromNexus(DEFAULT_STATS);
    const high = computeDerivedFromNexus({ ...DEFAULT_STATS, kin: 4 });
    expect(high.damage).toBeGreaterThan(low.damage);
    expect(high.stamina).toBeGreaterThan(low.stamina);
  });

  it('applyNexusToPlayerStats updates pools', () => {
    const shell = {
      health: 50, maxHealth: 100, mana: 40, maxMana: 80,
      stamina: 50, maxStamina: 100,
      strength: 10, vitality: 10, endurance: 10, intellect: 10,
      wisdom: 10, dexterity: 10, agility: 10, tactics: 10,
      level: 1, experience: 0, skillPoints: 0,
      hunger: 100, maxHunger: 100, thirst: 100, maxThirst: 100,
      temperature: 37, fatigue: 100, maxFatigue: 100,
      bleeding: false, infected: false,
    } as PlayerStats;
    const out = applyNexusToPlayerStats(shell, VOXEL_ERA_STARTER_STATS);
    expect(out.maxHealth).toBe(computeDerivedFromNexus(VOXEL_ERA_STARTER_STATS).health);
    expect(out.strength).toBeGreaterThanOrEqual(10);
  });
});
