/**
 * CampProductionTick — pure resource production calculator.
 *
 * Each recruited NPC with an assigned role produces resources per tick
 * (60 s real-time). Production rates come from a canonical table and are
 * scaled by the settlement's morale via getMoraleHarvestMultiplier.
 *
 * Pure function — no side effects, no Three.js, testable in isolation.
 */

import {
  type TownshipState,
  type NPCRole,
  getMoraleHarvestMultiplier,
} from './TownshipSystem';

// ── Production rates per role per tick (60 s) ──────────────────────────────

export interface ProductionRate {
  resource: string;
  amount: number;
}

/** What each role produces per 60-second tick. Fighters produce nothing. */
const ROLE_PRODUCTION: Partial<Record<NPCRole, ProductionRate[]>> = {
  woodcutter:      [{ resource: 'wood',  amount: 5 }],
  miner:           [{ resource: 'iron',  amount: 5 }],
  farmer:          [{ resource: 'herb',  amount: 5 }, { resource: 'food', amount: 3 }],
  forager:         [{ resource: 'herb',  amount: 3 }, { resource: 'berry', amount: 2 }],
  trapper:         [{ resource: 'hide',  amount: 3 }, { resource: 'meat', amount: 2 }],
  stall:           [{ resource: 'gold',  amount: 2 }],
  caravan_master:  [{ resource: 'gold',  amount: 5 }],
  fence:           [{ resource: 'gold',  amount: 3 }],
  bazaar_merchant: [{ resource: 'gold',  amount: 8 }],
  diplomat:        [{ resource: 'reputation', amount: 1 }],
};

// ── Follower input ──────────────────────────────────────────────────────────

export interface CampFollower {
  role?: NPCRole;
}

// ── Computation ─────────────────────────────────────────────────────────────

/**
 * Compute total resources produced by all camp followers in one tick.
 * Production is scaled by the settlement's morale multiplier.
 *
 * @returns Record of resource id → total amount produced this tick.
 */
export function computeProduction(
  state: TownshipState,
  followers: CampFollower[],
): Record<string, number> {
  const moraleMult = getMoraleHarvestMultiplier(state.morale);
  const output: Record<string, number> = {};

  for (const follower of followers) {
    if (!follower.role) continue;
    const rates = ROLE_PRODUCTION[follower.role];
    if (!rates) continue;
    for (const { resource, amount } of rates) {
      output[resource] = (output[resource] ?? 0) + Math.floor(amount * moraleMult);
    }
  }

  return output;
}

/**
 * Get the per-tick production summary for a single role (before morale).
 * Used by UI tooltips when assigning roles.
 */
export function getRoleProduction(role: NPCRole): ProductionRate[] {
  return ROLE_PRODUCTION[role] ?? [];
}

export { ROLE_PRODUCTION };
