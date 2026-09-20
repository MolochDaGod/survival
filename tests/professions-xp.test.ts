/**
 * Profession XP persistence helpers — merge never regresses spendable XP
 * or unlearns skills (cloud hydrate race + character switch).
 */
import { describe, it, expect } from 'vitest';
import { mergeProfessionState } from '../artifacts/arpg-game/src/game/progression/ProfessionsService';
import type { ProfessionState } from '../artifacts/arpg-game/src/game/progression/Professions';

describe('mergeProfessionState', () => {
  it('takes max lifetime XP per profession when nothing learned', () => {
    const local: ProfessionState = { xp: { gathering: 12, combat: 3 }, learned: [] };
    const cloud: ProfessionState = { xp: { gathering: 4, hunting: 8 }, learned: [] };
    const m = mergeProfessionState(local, cloud);
    expect(m.xp.gathering).toBe(12);
    expect(m.xp.hunting).toBe(8);
    expect(m.xp.combat).toBe(3);
  });

  it('unions learned skills and recomputes spendable from lifetime earned', () => {
    // Local: earned 3 (spent 1 on forestry.1 → spendable 2)
    const local: ProfessionState = {
      xp: { gathering: 2 },
      learned: ['gathering.forestry.1'],
    };
    // Cloud: earned 7 (spent 1+2 on forestry.1+2 → spendable 4)
    const cloud: ProfessionState = {
      xp: { gathering: 4 },
      learned: ['gathering.forestry.1', 'gathering.forestry.2'],
    };
    const m = mergeProfessionState(local, cloud);
    // lifetime max = 7; spent for union = 1+2 = 3; spendable = 4
    expect(m.xp.gathering).toBe(4);
    expect(m.learned.sort()).toEqual([
      'gathering.forestry.1',
      'gathering.forestry.2',
    ]);
  });

  it('does not double-count when one side spent and the other only has raw XP', () => {
    // Local spent 1 of 10 → spendable 9, learned forestry.1
    const local: ProfessionState = {
      xp: { gathering: 9 },
      learned: ['gathering.forestry.1'],
    };
    // Cloud never spent — still shows raw 10
    const cloud: ProfessionState = {
      xp: { gathering: 10 },
      learned: [],
    };
    const m = mergeProfessionState(local, cloud);
    // lifetime max = 10; spent = 1; spendable = 9 (NOT 10+9)
    expect(m.xp.gathering).toBe(9);
    expect(m.learned).toEqual(['gathering.forestry.1']);
  });

  it('drops unknown skill ids and negative XP', () => {
    const dirty: ProfessionState = {
      xp: { gathering: -3, combat: 2 },
      learned: ['gathering.forestry.1', 'not.a.real.skill'],
    };
    const m = mergeProfessionState(dirty, null);
    // forestry.1 cost 1 → earned at least 1, spendable 0 after deduct
    expect(m.xp.gathering ?? 0).toBe(0);
    expect(m.xp.combat).toBe(2);
    expect(m.learned).toEqual(['gathering.forestry.1']);
  });

  it('empty + empty stays empty', () => {
    expect(mergeProfessionState(null, undefined)).toEqual({ xp: {}, learned: [] });
  });
});
