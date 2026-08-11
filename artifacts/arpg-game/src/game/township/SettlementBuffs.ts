/**
 * SettlementBuffs — tier unlocks from info.html Settlement Tiers.
 *
 * Camp  (1–4): manual harvest only
 * Tribe (5+):  cooking pot regen + morale aura +10% hire damage
 * Village(10+): trade post gold, tier-2 schematics
 * Town  (20+): bazaar slots, tier-3, town banner broadcast
 * Stronghold(30+): fortress bonuses
 */

import type { SettlementTier, TownshipState } from './TownshipSystem';
import { getTierForPopulation } from './TownshipSystem';
import { ProfessionsService } from '../progression/ProfessionsService';

export interface ActiveSettlementBuffs {
  tier: SettlementTier;
  /** HP/sec while in camp radius (Tribe+ cooking pot). */
  campRegenPerSec: number;
  /** Multiplier on hire combat damage. */
  hireDamageMult: number;
  /** Passive gold per production tick (village+). */
  tradeGoldPerTick: number;
  /** Schematics tier 1–3. */
  schematicTier: number;
  /** Town banner: rep gain bonus while claimed. */
  bannerRepBonus: number;
  /** Smooth Talker (Diplomacy 1): heal near friendlies. */
  smoothTalkerHeal: number;
  flavor: string;
}

const TIER_ORDER: SettlementTier[] = ['camp', 'tribe', 'village', 'town', 'stronghold'];

export function tierIndex(t: SettlementTier): number {
  return Math.max(0, TIER_ORDER.indexOf(t));
}

export function computeSettlementBuffs(state: TownshipState): ActiveSettlementBuffs {
  const tier = state.tier;
  const ti = tierIndex(tier);

  // Diplomacy rank 1 — Smooth Talker (1 HP/s near camp friendlies)
  const smooth = ProfessionsService.isLearned('township.diplomacy.1') ? 1 : 0;

  return {
    tier,
    campRegenPerSec: ti >= 1 ? 0.5 + state.morale * 0.005 : 0, // Tribe+ cooking pot
    hireDamageMult:
      ti >= 1
        ? 1.1 * (state.morale >= 70 ? 1 : 0.5 + (state.morale / 70) * 0.5)
        : 1.0,
    tradeGoldPerTick: ti >= 2 ? 3 + Math.floor(state.passiveGoldPerDay / 10) : 0,
    schematicTier: ti >= 3 ? 3 : ti >= 2 ? 2 : 1,
    bannerRepBonus: ti >= 3 ? 0.15 : 0,
    smoothTalkerHeal: smooth,
    flavor:
      ti >= 4
        ? 'Stronghold — fortress authority'
        : ti >= 3
          ? 'Town — banner broadcasts on the Network'
          : ti >= 2
            ? 'Village — trade posts pay out'
            : ti >= 1
              ? 'Tribe — shared pot and morale aura'
              : 'Camp — gather by hand',
  };
}

/** Track tier promotions for XP grants (once per tier). */
export class SettlementProgressTracker {
  private highestGranted = 0;
  onTierUp: ((tier: SettlementTier, xp: number) => void) | null = null;

  check(population: number): void {
    const def = getTierForPopulation(population);
    const idx = tierIndex(def.id);
    if (idx > this.highestGranted && def.xpReward > 0) {
      this.highestGranted = idx;
      ProfessionsService.gainXp('township', def.xpReward);
      this.onTierUp?.(def.id, def.xpReward);
    }
  }

  serialize(): number {
    return this.highestGranted;
  }

  restore(v: number): void {
    this.highestGranted = v ?? 0;
  }
}
