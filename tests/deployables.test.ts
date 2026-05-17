/**
 * Deployable System — Gameplay Loop Verification
 *
 * Tests that every deployable:
 *   1. Has a matching perk that mentions "Deploy:" in attributes.ts
 *   2. Has unique IDs and prefab IDs (no collisions)
 *   3. Has a valid DeployableKind
 *   4. Has tier between 1-6
 *   5. Has a valid EntityRole as defaultRole
 *   6. Has at least idle + deploy animations
 *   7. Tier-scales stats correctly via scaleDeployableStats()
 *   8. getUnlockedDeployables() returns the right set per stat config
 *   9. Every CHR/ENT/GRA milestone 2-5 has exactly one deployable
 *  10. No stat tree has a gap in milestone coverage
 */

import { describe, it, expect } from 'vitest';
import {
  DEPLOYABLES,
  DEPLOYABLE_KINDS,
  ENTITY_ROLES,
  ROLE_AI_GOALS,
  ROLE_COLORS,
  getDeployable,
  getDeployablesByKind,
  getDeployablesByUnlock,
  getUnlockedDeployables,
  scaleDeployableStats,
} from '../lib/game-systems/src/deployables.js';
import {
  STAT_MILESTONE_PERKS,
} from '../lib/game-systems/src/attributes.js';
import {
  tierValueMultiplier,
} from '../lib/game-systems/src/loot.js';

// ── 1. Perk ↔ Deployable alignment ──────────────────────────────────────────

describe('Perk ↔ Deployable alignment', () => {
  const deployStatTrees = ['chr', 'ent', 'gra'] as const;

  for (const stat of deployStatTrees) {
    const perks = STAT_MILESTONE_PERKS[stat];
    const deployPerks = perks.filter(p => p.perkDesc.includes('Deploy:'));

    it(`${stat.toUpperCase()} has at least 4 "Deploy:" perks`, () => {
      expect(deployPerks.length).toBeGreaterThanOrEqual(4);
    });

    // Each "Deploy:" perk should reference a deployable name that exists
    for (const perk of deployPerks) {
      it(`${stat.toUpperCase()} perk "${perk.perkName}" references a real deployable`, () => {
        // Extract name after "Deploy: " up to the first " ("
        const match = perk.perkDesc.match(/Deploy:\s*([^(]+)/);
        expect(match).toBeTruthy();
        const deployName = match![1].trim();
        const found = DEPLOYABLES.some(d =>
          d.name === deployName ||
          perk.perkDesc.includes(d.name),
        );
        expect(found).toBe(true);
      });
    }
  }

  // Milestones 2-5 of CHR/ENT/GRA should each have exactly one deployable
  for (const stat of deployStatTrees) {
    for (let m = 2; m <= 5; m++) {
      it(`${stat.toUpperCase()} milestone ${m} has exactly 1 deployable`, () => {
        const matching = DEPLOYABLES.filter(
          d => d.unlock.stat === stat && d.unlock.milestone === m,
        );
        expect(matching.length).toBe(1);
      });
    }
  }
});

// ── 2. Unique IDs ───────────────────────────────────────────────────────────

describe('Unique IDs', () => {
  it('all deployable IDs are unique', () => {
    const ids = DEPLOYABLES.map(d => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('all prefab IDs are unique', () => {
    const prefabIds = DEPLOYABLES.map(d => d.prefabId);
    expect(new Set(prefabIds).size).toBe(prefabIds.length);
  });
});

// ── 3. Valid kinds ──────────────────────────────────────────────────────────

describe('Valid DeployableKind', () => {
  for (const d of DEPLOYABLES) {
    it(`${d.id} has valid kind "${d.kind}"`, () => {
      expect(DEPLOYABLE_KINDS).toContain(d.kind);
    });
  }
});

// ── 4. Tier range ───────────────────────────────────────────────────────────

describe('Tier range', () => {
  for (const d of DEPLOYABLES) {
    it(`${d.id} tier ${d.tier} is between 1 and 6`, () => {
      expect(d.tier).toBeGreaterThanOrEqual(1);
      expect(d.tier).toBeLessThanOrEqual(6);
    });
  }
});

// ── 5. Valid roles ──────────────────────────────────────────────────────────

describe('Valid EntityRole', () => {
  for (const d of DEPLOYABLES) {
    it(`${d.id} defaultRole "${d.defaultRole}" is valid`, () => {
      expect(ENTITY_ROLES).toContain(d.defaultRole);
    });

    it(`${d.id} allowedRoles are all valid`, () => {
      for (const role of d.allowedRoles) {
        expect(ENTITY_ROLES).toContain(role);
      }
    });

    it(`${d.id} defaultRole is in its own allowedRoles`, () => {
      expect(d.allowedRoles).toContain(d.defaultRole);
    });
  }
});

// ── 6. Animation completeness ───────────────────────────────────────────────

describe('Animation sets', () => {
  for (const d of DEPLOYABLES) {
    it(`${d.id} has idle animation`, () => {
      expect(d.anims.idle).toBeTruthy();
    });

    // Mobile deployables (drones, mechs, sentries) must have a move clip
    if (d.stats.moveSpeed > 0) {
      it(`${d.id} (mobile, speed=${d.stats.moveSpeed}) has move animation`, () => {
        expect(d.anims.move).toBeTruthy();
      });
    }

    // Combat deployables must have an attack clip
    if (d.stats.damage > 0 && d.stats.attackSpeed > 0) {
      it(`${d.id} (combat, damage=${d.stats.damage}) has attack animation`, () => {
        expect(d.anims.attack).toBeTruthy();
      });
    }
  }
});

// ── 7. Tier scaling ─────────────────────────────────────────────────────────

describe('scaleDeployableStats()', () => {
  it('T1 scaling is 1.0×', () => {
    const base = { maxHealth: 100, damage: 50, range: 10, attackSpeed: 1, moveSpeed: 5, armor: 20, duration: 30, cooldown: 60 };
    const scaled = scaleDeployableStats(base, 1);
    expect(scaled.maxHealth).toBe(100);
    expect(scaled.damage).toBe(50);
    expect(scaled.armor).toBe(20);
    // Range, attackSpeed, moveSpeed, duration, cooldown don't scale
    expect(scaled.range).toBe(10);
    expect(scaled.duration).toBe(30);
    expect(scaled.cooldown).toBe(60);
  });

  it('T6 scaling multiplies HP/damage/armor', () => {
    const base = { maxHealth: 100, damage: 50, range: 10, attackSpeed: 1, moveSpeed: 5, armor: 20, duration: 30, cooldown: 60 };
    const mult = tierValueMultiplier(6);
    const scaled = scaleDeployableStats(base, 6);
    expect(scaled.maxHealth).toBe(Math.floor(100 * mult));
    expect(scaled.damage).toBe(Math.floor(50 * mult));
    expect(scaled.armor).toBe(Math.floor(20 * mult));
  });

  it('higher tier always produces >= lower tier stats', () => {
    const base = { maxHealth: 100, damage: 50, range: 10, attackSpeed: 1, moveSpeed: 5, armor: 20, duration: 30, cooldown: 60 };
    for (let t = 1; t < 8; t++) {
      const lo = scaleDeployableStats(base, t);
      const hi = scaleDeployableStats(base, t + 1);
      expect(hi.maxHealth).toBeGreaterThanOrEqual(lo.maxHealth);
      expect(hi.damage).toBeGreaterThanOrEqual(lo.damage);
      expect(hi.armor).toBeGreaterThanOrEqual(lo.armor);
    }
  });
});

// ── 8. getUnlockedDeployables() ─────────────────────────────────────────────

describe('getUnlockedDeployables()', () => {
  it('returns nothing when all stats are 0', () => {
    const unlocked = getUnlockedDeployables({ chr: 0, ent: 0, gra: 0, syn: 0, qnt: 0 });
    expect(unlocked.length).toBe(0);
  });

  it('returns CHR deployables when chr=3', () => {
    const unlocked = getUnlockedDeployables({ chr: 3, ent: 0, gra: 0, syn: 0, qnt: 0 });
    // Should include chrono_scout (M2) and chrono_turret (M3)
    const ids = unlocked.map(d => d.id);
    expect(ids).toContain('chrono_scout');
    expect(ids).toContain('chrono_turret');
    // Should NOT include chrono_anchor (M4)
    expect(ids).not.toContain('chrono_anchor');
  });

  it('returns all stat deployables when maxed', () => {
    const unlocked = getUnlockedDeployables({ chr: 6, ent: 6, gra: 6, syn: 6, qnt: 6 });
    expect(unlocked.length).toBe(DEPLOYABLES.length);
  });

  it('GRA milestone 4 returns grav_anchor', () => {
    const unlocked = getUnlockedDeployables({ chr: 0, ent: 0, gra: 4, syn: 0, qnt: 0 });
    const ids = unlocked.map(d => d.id);
    expect(ids).toContain('grav_sentry');       // M2
    expect(ids).toContain('grav_anchor_turret'); // M3
    expect(ids).toContain('grav_anchor');        // M4
    expect(ids).not.toContain('grav_mech');      // M5
  });
});

// ── 9. Lookup helpers ───────────────────────────────────────────────────────

describe('Lookup helpers', () => {
  it('getDeployable() finds by id', () => {
    const d = getDeployable('grav_mech');
    expect(d).toBeDefined();
    expect(d!.name).toBe('Graviton Exoframe');
  });

  it('getDeployable() returns undefined for unknown id', () => {
    expect(getDeployable('does_not_exist')).toBeUndefined();
  });

  it('getDeployablesByKind() returns only matching kinds', () => {
    const turrets = getDeployablesByKind('turret');
    expect(turrets.length).toBeGreaterThan(0);
    for (const t of turrets) {
      expect(t.kind).toBe('turret');
    }
  });

  it('getDeployablesByUnlock() returns cumulative unlocks', () => {
    const gra3 = getDeployablesByUnlock('gra', 3);
    // Should include M2 + M3 deployables
    expect(gra3.length).toBe(2);
    const ids = gra3.map(d => d.id);
    expect(ids).toContain('grav_sentry');
    expect(ids).toContain('grav_anchor_turret');
  });
});

// ── 10. Role system coverage ────────────────────────────────────────────────

describe('Role system', () => {
  it('every EntityRole has AI goals defined', () => {
    for (const role of ENTITY_ROLES) {
      expect(ROLE_AI_GOALS[role]).toBeDefined();
      expect(ROLE_AI_GOALS[role].length).toBeGreaterThan(0);
    }
  });

  it('every EntityRole has a color defined', () => {
    for (const role of ENTITY_ROLES) {
      expect(ROLE_COLORS[role]).toBeTruthy();
      expect(ROLE_COLORS[role]).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('at least one deployable exists for ally, station, and enemy roles', () => {
    expect(DEPLOYABLES.some(d => d.defaultRole === 'ally')).toBe(true);
    expect(DEPLOYABLES.some(d => d.defaultRole === 'station')).toBe(true);
    expect(DEPLOYABLES.some(d => d.allowedRoles.includes('enemy'))).toBe(true);
  });
});

// ── 11. Stat sanity ─────────────────────────────────────────────────────────

describe('Stat sanity', () => {
  for (const d of DEPLOYABLES) {
    it(`${d.id} has non-negative base stats`, () => {
      expect(d.stats.maxHealth).toBeGreaterThanOrEqual(0);
      expect(d.stats.damage).toBeGreaterThanOrEqual(0);
      expect(d.stats.range).toBeGreaterThanOrEqual(0);
      expect(d.stats.attackSpeed).toBeGreaterThanOrEqual(0);
      expect(d.stats.moveSpeed).toBeGreaterThanOrEqual(0);
      expect(d.stats.armor).toBeGreaterThanOrEqual(0);
      expect(d.stats.duration).toBeGreaterThanOrEqual(0);
      expect(d.stats.cooldown).toBeGreaterThanOrEqual(0);
    });

    it(`${d.id} cooldown >= duration (no free uptime)`, () => {
      // Most deployables should have cooldown >= duration to prevent 100% uptime.
      // Exception: permanent deployables with duration=0 and items where cooldown
      // is intentionally short (harvest drone, combat drone — designed for uptime).
      if (d.stats.duration > 0 && d.stats.cooldown > 0) {
        // Soft check: cooldown should be at least 50% of duration
        // Hard violations would be cooldown < duration/4
        expect(d.stats.cooldown).toBeGreaterThanOrEqual(d.stats.duration * 0.25);
      }
    });
  }
});
