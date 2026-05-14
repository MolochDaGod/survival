/**
 * Biome → creature spawn table for Grudge Nexus.
 *
 * Derived from the per-creature `biomes` array in `creatures.ts`. The
 * spawner (Phase 2) reads this to decide what's eligible to spawn given
 * the player's current biome, weighted by threat level so common low-tier
 * mobs outnumber elites.
 *
 * Weighting model (intentionally simple):
 *   weight = max(1, 6 - threatLevel)
 *   threat 1 → 5, threat 2 → 4, threat 3 → 3, threat 4 → 2, threat 5 → 1
 *
 * That gives a roughly 5:4:3:2:1 distribution within a biome — boss mechs
 * are rare, swarm vermin are common — without per-creature hand-tuning.
 *
 * Override the weight by editing `BIOME_WEIGHT_OVERRIDES` below for any
 * key that needs a custom rarity (e.g. "Whale should be rarer than its
 * threat level implies").
 *
 * Two special biome tags:
 *   • 'water'      — used by ANY water body across all land biomes; the
 *                    spawner unions land-biome creatures with water ones
 *                    when sampling near a water surface.
 *   • 'settlement' — only inside outpost colliders; the city spawner
 *                    consults this independently of the wave spawner.
 */

import {
  Biome,
  CreatureDef,
  CREATURES,
} from './creatures';

interface SpawnWeight {
  creature: CreatureDef;
  weight: number;
}

/**
 * Per-key weight overrides. Empty for now; populate as we tune.
 * Example:  whale: 0.25,  // 4× rarer than its threat level suggests
 */
const BIOME_WEIGHT_OVERRIDES: Record<string, number> = {
  whale:    0.25,   // deep-water spawn — rare encounter
  shark:    0.5,    // dangerous; rare
  pug:      2.0,    // settlements should feel "lived in"
  rat:      1.5,    // sprawl plague
};

function baseWeight(c: CreatureDef): number {
  const w = Math.max(1, 6 - c.threatLevel);
  const ovr = BIOME_WEIGHT_OVERRIDES[c.key];
  return ovr !== undefined ? w * ovr : w;
}

/** Build the table once at module load — small cost, big read frequency. */
function buildTable(): Record<Biome, SpawnWeight[]> {
  const biomes: Biome[] = [
    'permafrost', 'glasslands', 'derelict-sprawl', 'anomaly-field',
    'cinder-wastes', 'water', 'settlement',
  ];
  const out: Partial<Record<Biome, SpawnWeight[]>> = {};
  for (const b of biomes) {
    out[b] = CREATURES
      .filter((c) => c.biomes.includes(b))
      .map((c) => ({ creature: c, weight: baseWeight(c) }));
  }
  return out as Record<Biome, SpawnWeight[]>;
}

export const BIOME_SPAWN_TABLE: Record<Biome, SpawnWeight[]> = buildTable();

/**
 * Sample one creature from a biome's table using weighted random selection.
 * Returns null when the biome is empty (shouldn't happen with the current
 * registry — every biome has at least one entry).
 */
export function sampleCreatureForBiome(
  biome: Biome,
  rng: () => number = Math.random,
): CreatureDef | null {
  const list = BIOME_SPAWN_TABLE[biome];
  if (!list || list.length === 0) return null;
  let total = 0;
  for (const e of list) total += e.weight;
  let r = rng() * total;
  for (const e of list) {
    r -= e.weight;
    if (r <= 0) return e.creature;
  }
  return list[list.length - 1].creature;
}

/**
 * Filtered sampler — used by the wave spawner to draw only hostile mobs
 * from the player's current biome (huntables are spawned by a separate
 * ambient system that uses `sampleCreatureForBiome` directly).
 */
export function sampleHostileForBiome(
  biome: Biome,
  rng: () => number = Math.random,
): CreatureDef | null {
  const list = BIOME_SPAWN_TABLE[biome]?.filter(
    (e) => e.creature.role.startsWith('hostile-'),
  );
  if (!list || list.length === 0) return null;
  let total = 0;
  for (const e of list) total += e.weight;
  let r = rng() * total;
  for (const e of list) {
    r -= e.weight;
    if (r <= 0) return e.creature;
  }
  return list[list.length - 1].creature;
}
