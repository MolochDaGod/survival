/**
 * @workspace/game-systems — Nexus Milestone Perk Effects
 *
 * Bridges STAT_MILESTONE_PERKS (flavour text + icons in attributes.ts) to
 * quantified gameplay effects that the engine can read each frame.
 *
 * Every milestone perk maps to a flat key→number effect bag. The engine
 * sums effects via `getMilestoneEffects(stats)` and applies the result
 * as an additive/multiplicative overlay on PlayerStats — the same pattern
 * used by the 4-track perk system in PerkSystem.ts.
 *
 * Pure functions. Zero runtime dependencies. Import from any package.
 */

import type { GrudgeStats, GrudgeStatKey } from './types.js';
import { STAT_MILESTONE_PERKS } from './attributes.js';

// ── Effect keys ─────────────────────────────────────────────────────────────
// These are the canonical stat-modifier keys consumed by the game engine.
// Names match the convention in PerkSystem.ts so both systems merge cleanly.

export interface MilestoneEffectBag {
  [key: string]: number;
}

// ── Per-milestone effect tables ─────────────────────────────────────────────
// Each stat has 6 milestones (levels 1-6). Index 0 = milestone 1.

const BIO_EFFECTS: MilestoneEffectBag[] = [
  { maxHp: 5,  bleedResist: 0.10 },                                          // Iron Constitution
  { maxHp: 10, toxinResist: 0.15, hpRegen: 0.5 },                            // Cellular Regen
  { maxHp: 20, implantSlots: 1, toxinResist: 0.30 },                         // Augment Compatibility
  { maxHp: 35, hpRegen: 1.5, diseaseImmune: 1 },                             // Nanoflesh Matrix
  { maxHp: 55, hpRegen: 2.5, combatRegen: 1 },                               // Apex Physiology
  { maxHp: 80, deathDefiance: 1 },                                            // Undying Protocol
];

const NEU_EFFECTS: MilestoneEffectBag[] = [
  { maxSanity: 5, psionicShield: 0.10 },                                     // Signal Clarity
  { hackResist: 0.15, aiCoprocTier: 1 },                                     // Neural Firewall
  { psionicShield: 0.25, neuralOverclock: 0.20 },                            // Deep Focus
  { hackResist: 0.30, aiCoprocTier: 2, mindLink: 1 },                        // Synaptic Overdrive
  { psionicMastery: 1, realityAnchor: 1 },                                   // Transcendent Logic
  { psionicImmune: 1, quantumCognition: 1, aiSymbiosis: 1 },                 // Enlightened Arch.
];

const KIN_EFFECTS: MilestoneEffectBag[] = [
  { moveSpeed: 0.05, fallDmgResist: 0.10 },                                  // Fleet Footed
  { meleeDamage: 0.10, staminaRegen: 0.5 },                                  // Combat Cadence
  { moveSpeed: 0.15, zeroGCombat: 1, dodgeWindow: 0.020 },                   // Zero-G Trained
  { meleeDamage: 0.25, momentumStrikes: 1 },                                 // Kinetic Amplifier
  { sprintFree: 1, aerialAssault: 1 },                                       // Apex Predator
  { knockbackImmune: 1, groundSlam: 1, meleeDamage: 0.40 },                  // Unstoppable Force
];

const QNT_EFFECTS: MilestoneEffectBag[] = [
  { techComprehension: 5 },                                                   // Tech Intuition
  { hazardDetect: 1, quantumDeviceSlots: 1 },                                // Probability Sense
  { quantumShield: 1, quantumDeviceSlots: 2, exoticCraft: 1 },               // Field Theorist
  { phaseStep: 1, quantumGrenade: 1 },                                       // Phase Manipulator
  { probabilityBubble: 1, quantumDeviceSlots: 3 },                           // Reality Weaver
  { temporalSuspension: 1, quantumDeviceSlots: 4 },                          // Quantum Sovereign
];

const SYN_EFFECTS: MilestoneEffectBag[] = [
  { droneSlots: 1, deviceRadar: 1 },                                         // Network Aware
  { hackSpeed: 0.30, aiNegotiation: 1 },                                     // Ghost Protocol
  { droneSlots: 2, swarmIntel: 1, firewallBypass: 1 },                       // Swarm Link
  { droneRepair: 1, factionTrust: 0.20, firewallBypass: 2 },                 // Neural Mesh
  { droneDiplomacy: 1, droneInheritSkills: 1 },                              // Hive Mind Conduit
  { machineAlly: 1, droneAutonomous: 1 },                                    // Synthetic Ascension
];

const CHR_EFFECTS: MilestoneEffectBag[] = [
  { anomalyResist: 0.10, chronalSicknessImmune: 1 },                         // Temporal Grounding
  { temporalScout: 1, causalityShield: 1 },                                  // Echo Perception
  { stasisTurret: 1, rewind: 1, timeDisplaceImmune: 1 },                     // Phase Anchor
  { rewindAnchor: 1, selfDuplicate: 1 },                                     // Paradox Engine
  { stasisMine: 2, rewindDuration: 15 },                                     // Timeline Bender
  { outsideTimeline: 1, deployableDuration: 0.50 },                          // Eternal Observer
];

const ENT_EFFECTS: MilestoneEffectBag[] = [
  { equipDurability: 0.20, salvageYield: 0.10, repairCostReduce: 0.15 },     // Hardy Materials
  { salvageDrone: 1, resourceSpoilage: -0.30, corrosionResist: 1 },          // Decay Shield
  { repairPylon: 1, degradedCraft: 1, repairCostReduce: 0.25 },              // Reclamation Expert
  { entropyField: 1, gearMinDurability: 0.10 },                              // Entropy Sink
  { fieldRecycler: 1, corrosionImmune: 1 },                                  // Void Preservation
  { gearIndestructible: 1, deployableDuration: 0.50, passiveHpRegen: 1 },    // Eternal Engine
];

const GRA_EFFECTS: MilestoneEffectBag[] = [
  { fallDmgResist: 0.25, rollDistance: 0.15 },                               // Light Footed
  { gravitySentry: 1, fallDmgResist: 0.50, zeroGNav: 1 },                   // Grav Adapted
  { massDriverTurret: 1, gravPush: 1, wallRun: 1 },                          // Force Sense
  { gravityAnchor: 1, zeroGCombat: 1, gravManipulation: 1 },                 // Orbital Mastery
  { gravitonExoframe: 1, enemyLaunch: 1 },                                   // Graviton Weave
  { orbitalStrike: 1, deployableDuration: 0.50, gravityReversal: 1 },        // Event Horizon Body
];

/** Indexed by GrudgeStatKey. Each array has exactly 6 entries (milestones 1-6). */
const MILESTONE_EFFECTS: Record<GrudgeStatKey, MilestoneEffectBag[]> = {
  bio: BIO_EFFECTS,
  neu: NEU_EFFECTS,
  kin: KIN_EFFECTS,
  qnt: QNT_EFFECTS,
  syn: SYN_EFFECTS,
  chr: CHR_EFFECTS,
  ent: ENT_EFFECTS,
  gra: GRA_EFFECTS,
};

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Sum all milestone perk effects the player has earned based on their
 * current Nexus stat levels. Returns a flat key→number bag.
 *
 * Example: If bio=3, returns effects from BIO milestones 1, 2, and 3
 * summed together: { maxHp: 35, bleedResist: 0.10, toxinResist: 0.30, ... }
 */
export function getMilestoneEffects(stats: GrudgeStats): MilestoneEffectBag {
  const bag: MilestoneEffectBag = {};
  for (const key of Object.keys(stats) as GrudgeStatKey[]) {
    const level = stats[key];
    const table = MILESTONE_EFFECTS[key];
    if (!table) continue;
    for (let m = 0; m < Math.min(level, table.length); m++) {
      for (const [ek, ev] of Object.entries(table[m])) {
        bag[ek] = (bag[ek] ?? 0) + ev;
      }
    }
  }
  return bag;
}

/**
 * Merge two effect bags (additive). Non-destructive — returns a new object.
 */
export function mergeEffectBags(a: MilestoneEffectBag, b: MilestoneEffectBag): MilestoneEffectBag {
  const result: MilestoneEffectBag = { ...a };
  for (const [k, v] of Object.entries(b)) {
    result[k] = (result[k] ?? 0) + v;
  }
  return result;
}

/**
 * Read a single effect value from a bag, defaulting to 0.
 */
export function readEffect(bag: MilestoneEffectBag, key: string): number {
  return bag[key] ?? 0;
}

export { MILESTONE_EFFECTS };
