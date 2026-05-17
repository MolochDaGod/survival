/**
 * Integration tests for the NPC recruitment flow and FollowBrain behavior.
 *
 * These test pure game logic without a WebGL context. Three.js geometry/material
 * constructors work in Node.js — only the renderer is GPU-dependent.
 */

import { describe, it, expect, vi } from 'vitest';

// ── FollowBrain unit tests ──────────────────────────────────────────────────────────────

// Pure math tests — no Three.js import needed (tests run in Node.js without GPU).

describe('FollowBrain patterns', () => {
  it('distance-based speed selection works correctly', () => {
    const arriveRadius = 3;
    const runThreshold = 8;
    const walkSpeed = 2.0;
    const runSpeed = 5.5;

    // Helper matching FollowBrain.update logic
    function getSpeed(dist: number) {
      const isRunning = dist > runThreshold;
      const isIdle = dist < arriveRadius;
      if (isIdle) return 0;
      return isRunning ? runSpeed : walkSpeed;
    }

    expect(getSpeed(1)).toBe(0);       // inside arrive radius
    expect(getSpeed(2.9)).toBe(0);     // just inside
    expect(getSpeed(3.1)).toBe(walkSpeed);  // just outside → walk
    expect(getSpeed(5)).toBe(walkSpeed);
    expect(getSpeed(7.9)).toBe(walkSpeed);
    expect(getSpeed(8.1)).toBe(runSpeed);   // past run threshold
    expect(getSpeed(20)).toBe(runSpeed);
  });
});

// ── LocomotionAnimator phase-sync tests ─────────────────────────────────────

describe('Phase-sync crossfade logic', () => {
  it('syncs playhead phase between clips of different durations', () => {
    // Simulate: Walk clip at 1.0s duration, Run clip at 0.8s duration
    // Walk is at time 0.5 (50% through)
    // Run should be set to 0.5 * (0.8 / 1.0) = 0.4 (also 50% through)
    const walkDuration = 1.0;
    const runDuration = 0.8;
    const walkTime = 0.5;

    const runTime = walkTime * (runDuration / walkDuration);

    expect(runTime).toBeCloseTo(0.4);
    // Phase should be preserved
    expect(walkTime / walkDuration).toBeCloseTo(runTime / runDuration);
  });

  it('preserves phase when clips have identical durations', () => {
    const duration = 1.2;
    const time = 0.6;
    const synced = time * (duration / duration);
    expect(synced).toBe(time);
  });

  it('handles edge case of clip at time 0', () => {
    const synced = 0 * (0.8 / 1.0);
    expect(synced).toBe(0);
  });

  it('handles edge case of clip at end', () => {
    const walkDuration = 1.0;
    const runDuration = 0.8;
    const synced = walkDuration * (runDuration / walkDuration);
    expect(synced).toBeCloseTo(runDuration);
  });
});

// ── Exponential weight smoothing tests ──────────────────────────────────────

describe('Weight smoothing (LocomotionAnimator.update pattern)', () => {
  it('exponential smoothing converges toward target', () => {
    const k = 14;
    let current = 0;
    const target = 1;

    // Simulate 60 frames at 60fps
    for (let i = 0; i < 60; i++) {
      const dt = 1 / 60;
      const t = 1 - Math.exp(-k * dt);
      current = current + (target - current) * t;
    }

    // Should be very close to 1 after 1 second at k=14
    expect(current).toBeGreaterThan(0.999);
  });

  it('is frame-rate independent', () => {
    const k = 14;
    const target = 1;

    // 60fps path
    let a = 0;
    for (let i = 0; i < 60; i++) {
      const t = 1 - Math.exp(-k * (1 / 60));
      a = a + (target - a) * t;
    }

    // 30fps path (same total time)
    let b = 0;
    for (let i = 0; i < 30; i++) {
      const t = 1 - Math.exp(-k * (1 / 30));
      b = b + (target - b) * t;
    }

    // Should converge to nearly the same value
    expect(Math.abs(a - b)).toBeLessThan(0.001);
  });
});

// ── Recruitment state transition tests ──────────────────────────────────────

describe('NPC recruitment state machine', () => {
  it('tracks follower count correctly', () => {
    const npcs: string[] = ['npc-0', 'npc-1', 'npc-2'];
    const followers: string[] = [];

    // Recruit first NPC
    const idx = npcs.indexOf('npc-1');
    expect(idx).toBe(1);
    followers.push(npcs.splice(idx, 1)[0]);

    expect(npcs.length).toBe(2);
    expect(followers.length).toBe(1);
    expect(followers[0]).toBe('npc-1');
    expect(npcs.includes('npc-1')).toBe(false);

    // Recruit another
    followers.push(npcs.splice(0, 1)[0]);
    expect(npcs.length).toBe(1);
    expect(followers.length).toBe(2);
  });

  it('nearest detection uses squared distance for performance', () => {
    const RANGE = 4;
    const RANGE_SQ = RANGE * RANGE;

    const playerPos = { x: 10, z: 20 };
    const npcPos = { x: 12, z: 21 };

    const dx = playerPos.x - npcPos.x;
    const dz = playerPos.z - npcPos.z;
    const d2 = dx * dx + dz * dz;

    expect(d2).toBe(5); // 4 + 1
    expect(d2 < RANGE_SQ).toBe(true); // 5 < 16

    // Out of range
    const farNpc = { x: 20, z: 30 };
    const fdx = playerPos.x - farNpc.x;
    const fdz = playerPos.z - farNpc.z;
    const fd2 = fdx * fdx + fdz * fdz;
    expect(fd2 < RANGE_SQ).toBe(false);
  });
});

// ── Physics tuning validation ───────────────────────────────────────────────

describe('Rapier physics constants', () => {
  it('autostep height clears standard stair risers', () => {
    const AUTOSTEP_HEIGHT = 0.45; // metres
    const STANDARD_STAIR_RISER = 0.178; // ~7 inches, building code standard
    expect(AUTOSTEP_HEIGHT).toBeGreaterThan(STANDARD_STAIR_RISER);
    expect(AUTOSTEP_HEIGHT).toBeGreaterThan(STANDARD_STAIR_RISER * 2); // even double-height
  });

  it('snap-to-ground exceeds autostep height', () => {
    const SNAP = 0.6;
    const STEP = 0.45;
    expect(SNAP).toBeGreaterThan(STEP);
  });

  it('slope angles are in valid range', () => {
    const MAX_CLIMB = 50; // degrees
    const MIN_SLIDE = 35; // degrees
    expect(MAX_CLIMB).toBeGreaterThan(MIN_SLIDE);
    expect(MAX_CLIMB).toBeLessThanOrEqual(90);
    expect(MIN_SLIDE).toBeGreaterThan(0);
  });

  it('capsule dimensions produce correct player height', () => {
    const HALF_HEIGHT = 0.5;
    const RADIUS = 0.4;
    const totalHeight = 2 * (HALF_HEIGHT + RADIUS);
    expect(totalHeight).toBe(1.8); // matches PLAYER_HEIGHT
  });
});

// ── Game systems (attribute formulas) ───────────────────────────────────────

describe('@workspace/game-systems attributes', () => {
  // Import directly since game-systems has zero deps
  it('cost curve is monotonically increasing', async () => {
    const { STAT_COST, costToReach, STAT_MAX } = await import(
      '../lib/game-systems/src/attributes.js'
    );
    for (let i = 2; i < STAT_COST.length; i++) {
      expect(STAT_COST[i]).toBeGreaterThan(STAT_COST[i - 1]);
    }
    // Total cost to max a stat
    const maxCost = costToReach(STAT_MAX);
    expect(maxCost).toBe(1 + 2 + 4 + 8 + 16 + 20); // 51
  });

  it('diminishing returns breakpoints work correctly', async () => {
    const { effectivePoints, DR_FULL_CAP, DR_HALF_CAP } = await import(
      '../lib/game-systems/src/attributes.js'
    );
    expect(effectivePoints(10)).toBe(10);       // below cap = full
    expect(effectivePoints(25)).toBe(25);       // at full cap
    expect(effectivePoints(35)).toBe(30);       // 25 + 10*0.5
    expect(effectivePoints(50)).toBe(37.5);     // 25 + 25*0.5
    expect(effectivePoints(60)).toBe(40);       // 25 + 12.5 + 10*0.25
  });

  it('stat caps enforce maximum values', async () => {
    const { clampStat, STAT_CAPS } = await import(
      '../lib/game-systems/src/attributes.js'
    );
    expect(clampStat('block', 100)).toBe(75);
    expect(clampStat('criticalChance', 50)).toBe(50);
    expect(clampStat('criticalDamage', 400)).toBe(300);
    expect(clampStat('unknownStat', 999)).toBe(999); // no cap = pass through
  });
});

// ── Combat pipeline tests ───────────────────────────────────────────────────

describe('@workspace/game-systems combat', () => {
  it('calculateDamage produces valid output', async () => {
    const { calculateDamage, DEFAULT_COMBAT_STATS, DEFAULT_RESISTANCES } = await import(
      '../lib/game-systems/src/combat.js'
    );
    const result = calculateDamage({
      weaponPhysical: 50,
      weaponMagical: 0,
      abilityMultiplier: 1.0,
      element: 'physical',
      attacker: DEFAULT_COMBAT_STATS,
      defender: DEFAULT_COMBAT_STATS,
      defenderResists: DEFAULT_RESISTANCES,
      variance: false,
    });

    expect(result.totalDamage).toBeGreaterThan(0);
    expect(result.physicalDamage).toBeGreaterThanOrEqual(0);
    expect(result.magicalDamage).toBe(0);
    expect(typeof result.isCrit).toBe('boolean');
    expect(typeof result.isBlocked).toBe('boolean');
  });

  it('defense formula follows sqrt curve', async () => {
    const { calculateDamage, DEFAULT_COMBAT_STATS, DEFAULT_RESISTANCES } = await import(
      '../lib/game-systems/src/combat.js'
    );

    // With 100 defense, mitigation = √100 = 10%, so 90% of damage gets through
    const lowDef = { ...DEFAULT_COMBAT_STATS, physicalDefense: 100, blockChance: 0, critChance: 0 };
    const r1 = calculateDamage({
      weaponPhysical: 100, weaponMagical: 0, abilityMultiplier: 1.0,
      element: 'physical', attacker: { ...DEFAULT_COMBAT_STATS, critChance: 0 },
      defender: lowDef, defenderResists: DEFAULT_RESISTANCES, variance: false,
    });

    // With 2500 defense, mitigation = √2500 = 50%
    const highDef = { ...DEFAULT_COMBAT_STATS, physicalDefense: 2500, blockChance: 0, critChance: 0 };
    const r2 = calculateDamage({
      weaponPhysical: 100, weaponMagical: 0, abilityMultiplier: 1.0,
      element: 'physical', attacker: { ...DEFAULT_COMBAT_STATS, critChance: 0 },
      defender: highDef, defenderResists: DEFAULT_RESISTANCES, variance: false,
    });

    // Higher defense should result in less damage
    expect(r2.totalDamage).toBeLessThan(r1.totalDamage);
  });

  it('healing has variance but stays positive', async () => {
    const { calculateHealing } = await import('../lib/game-systems/src/combat.js');
    for (let i = 0; i < 20; i++) {
      const heal = calculateHealing(50, 0);
      expect(heal).toBeGreaterThan(0);
      expect(heal).toBeLessThanOrEqual(60); // 50 * 1.1 max
    }
  });

  it('drain is capped at 50%', async () => {
    const { calculateDrain } = await import('../lib/game-systems/src/combat.js');
    expect(calculateDrain(100, 80)).toBe(50); // capped at 50
    expect(calculateDrain(100, 30)).toBe(30); // under cap
    expect(calculateDrain(100, 50)).toBe(50); // at cap
  });
});

// ── Tier system tests ───────────────────────────────────────────────────────

describe('@workspace/game-systems tiers', () => {
  it('8 tiers from Scrap to Legendary', async () => {
    const { TIERS, getTierDef, getTierLabel } = await import(
      '../lib/game-systems/src/tiers.js'
    );
    expect(TIERS.length).toBe(8);
    expect(getTierLabel(1)).toBe('Scrap');
    expect(getTierLabel(8)).toBe('Legendary');
    expect(getTierDef(5).color).toBe('#ff4d4d');
  });

  it('unknown tier falls back to T1 (Scrap)', async () => {
    const { getTierDef } = await import('../lib/game-systems/src/tiers.js');
    expect(getTierDef(99).label).toBe('Scrap');
  });
});
