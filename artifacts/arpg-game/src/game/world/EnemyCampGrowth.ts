/**
 * EnemyCampGrowth — tier progression for persistent AI faction camps.
 *
 * Mirrors the player township ladder (outpost → stronghold). AI island
 * camps start small and accrue population over time when left unchecked.
 */

export type AICampTier = 'outpost' | 'camp' | 'war_camp' | 'stronghold';

export interface AICampTierDef {
  id: AICampTier;
  label: string;
  minPopulation: number;
  /** Uniform GLB scale for the enemy_camp prefab. */
  scale: number;
  /** Defenders spawned when the raid mission is accepted. */
  defenders: number;
  /** Seconds of simulated growth to gain +1 population at this tier. */
  growthSecondsPerPop: number;
}

export const AI_CAMP_TIERS: AICampTierDef[] = [
  { id: 'outpost',    label: 'Outpost',    minPopulation: 0,  scale: 0.5,  defenders: 2, growthSecondsPerPop: 75  },
  { id: 'camp',       label: 'Camp',       minPopulation: 4,  scale: 0.75, defenders: 4, growthSecondsPerPop: 90  },
  { id: 'war_camp',   label: 'War Camp',   minPopulation: 10, scale: 1.0,  defenders: 6, growthSecondsPerPop: 120 },
  { id: 'stronghold', label: 'Stronghold', minPopulation: 20, scale: 1.2,  defenders: 9, growthSecondsPerPop: 180 },
];

export function tierForPopulation(pop: number): AICampTierDef {
  let best = AI_CAMP_TIERS[0];
  for (const t of AI_CAMP_TIERS) {
    if (pop >= t.minPopulation) best = t;
  }
  return best;
}

/** Population gained per second while the camp is alive and not cleared. */
export const AI_CAMP_BASE_GROWTH_RATE = 1 / 120; // ~1 pop / 2 min at base