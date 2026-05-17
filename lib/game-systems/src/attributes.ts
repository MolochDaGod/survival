/**
 * @workspace/game-systems — Canonical Nexus 8-Stat Attribute System
 *
 * BIO · NEU · KIN · QNT · SYN · CHR · ENT · GRA
 * 37 derived stats · Diminishing returns · Stat caps
 *
 * This is the SINGLE SOURCE OF TRUTH for attributes across all Grudge
 * Studio games. Do NOT duplicate or create alternative attribute systems.
 */

import type { GrudgeStats, GrudgeStatKey, StatMeta } from './types.js';

// ── Constants ───────────────────────────────────────────────────────────────

export const STARTING_BUDGET = 24;
export const STAT_MIN = 0;
export const STAT_MAX = 6;
export const STAT_DEFAULT = 0;

/** Cost to go from (level-1) → level. Index 0 is unused. */
export const STAT_COST: number[] = [0, 1, 2, 4, 8, 16, 20];

// ── Cost Helpers ────────────────────────────────────────────────────────────

export function costToReach(level: number): number {
  let total = 0;
  for (let i = 1; i <= level; i++) total += STAT_COST[i];
  return total;
}

export function costForNext(currentLevel: number): number {
  if (currentLevel >= STAT_MAX) return Infinity;
  return STAT_COST[currentLevel + 1];
}

export function computeSpentPoints(stats: GrudgeStats): number {
  return (Object.keys(stats) as GrudgeStatKey[]).reduce(
    (sum, k) => sum + costToReach(stats[k]),
    0,
  );
}

// ── Stat Metadata ───────────────────────────────────────────────────────────

export const STAT_META: StatMeta[] = [
  { key: 'bio', abbr: 'BIO', label: 'Biomass',            color: '#4caf50', icon: '/icons/stats/bio.png', desc: 'Max health, natural healing, toxin resistance & implant compatibility' },
  { key: 'neu', abbr: 'NEU', label: 'Neural Integrity',   color: '#00bcd4', icon: '/icons/stats/neu.png', desc: 'Sanity, psionic defense, AI co-processor cap & neural hack resistance' },
  { key: 'kin', abbr: 'KIN', label: 'Kinetic Efficiency', color: '#ff9800', icon: '/icons/stats/kin.png', desc: 'Movement speed, melee damage, stamina regen & zero-G combat' },
  { key: 'qnt', abbr: 'QNT', label: 'Quantum Aptitude',   color: '#9c27b0', icon: '/icons/stats/qnt.png', desc: 'Tech comprehension, quantum device operation & probability manipulation' },
  { key: 'syn', abbr: 'SYN', label: 'Synthetic Affinity', color: '#2196f3', icon: '/icons/stats/syn.png', desc: 'Hacking skill, drone control, AI negotiation & swarm intelligence' },
  { key: 'chr', abbr: 'CHR', label: 'Chronal Stability',  color: '#ffeb3b', icon: '/icons/stats/chr.png', desc: 'Temporal anomaly resistance, time perception & causality protection' },
  { key: 'ent', abbr: 'ENT', label: 'Entropic Resistance',color: '#f44336', icon: '/icons/stats/ent.png', desc: 'Equipment durability, resource preservation & decay resistance' },
  { key: 'gra', abbr: 'GRA', label: 'Gravitic Harmony',   color: '#009688', icon: '/icons/stats/gra.png', desc: 'Fall damage reduction, zero-G adaptation & spatial force manipulation' },
];

// ── Diminishing Returns ─────────────────────────────────────────────────────

export const DR_FULL_CAP = 25;
export const DR_HALF_CAP = 50;
export const DR_HALF_MULT = 0.5;
export const DR_QUARTER_MULT = 0.25;

export function effectivePoints(actual: number): number {
  if (actual <= DR_FULL_CAP) return actual;
  if (actual <= DR_HALF_CAP) return DR_FULL_CAP + (actual - DR_FULL_CAP) * DR_HALF_MULT;
  return DR_FULL_CAP + (DR_HALF_CAP - DR_FULL_CAP) * DR_HALF_MULT + (actual - DR_HALF_CAP) * DR_QUARTER_MULT;
}

// ── Stat Caps ───────────────────────────────────────────────────────────────

export const STAT_CAPS: Record<string, number> = {
  block:           75,
  criticalChance:  75,
  blockEffect:     90,
  criticalDamage:  300,
  accuracy:        100,
  resistance:      75,
  drainHealth:     50,
  drainMana:       50,
  reflectDamage:   50,
  absorbHealth:    50,
  absorbMana:      50,
};

export function clampStat(key: string, value: number): number {
  const cap = STAT_CAPS[key];
  return cap !== undefined ? Math.min(cap, value) : value;
}

// ── Milestone Perks ─────────────────────────────────────────────────────────

export interface MilestonePerk {
  perkName: string;
  perkDesc: string;
  icon: string;
}

export interface Badge {
  statKey: GrudgeStatKey;
  milestone: number;
  perkName: string;
  perkDesc: string;
  icon: string;
}

export const STAT_MILESTONE_PERKS: Record<GrudgeStatKey, MilestonePerk[]> = {
  bio: [
    { perkName: 'Iron Constitution',     perkDesc: '+5 Max HP. Minor bleed resistance.',                                    icon: '🩸' },
    { perkName: 'Cellular Regen',        perkDesc: '+10 Max HP. Toxin Resist I. Natural regen 0.5 HP/s.',                   icon: '🔄' },
    { perkName: 'Augment Compatibility', perkDesc: '+20 Max HP. Implant Slot unlocked. Toxin Resist II.',                    icon: '🔩' },
    { perkName: 'Nanoflesh Matrix',      perkDesc: '+35 Max HP. Rapid Heal I. Disease Immunity.',                            icon: '🧬' },
    { perkName: 'Apex Physiology',       perkDesc: '+55 Max HP. Rapid Heal II. Combat Regen.',                               icon: '💪' },
    { perkName: 'Undying Protocol',      perkDesc: '+80 Max HP. Death Defiance: survive one lethal blow once per mission.',  icon: '☠️' },
  ],
  neu: [
    { perkName: 'Signal Clarity',        perkDesc: '+5 Sanity. Psionic Shielding I.',                                       icon: '📡' },
    { perkName: 'Neural Firewall',       perkDesc: 'Hack Resist I. AI Co-Processor Tier I unlocked.',                       icon: '🧱' },
    { perkName: 'Deep Focus',            perkDesc: 'Psionic Shielding II. Neural Overclock (temp INT +20%).',               icon: '🎯' },
    { perkName: 'Synaptic Overdrive',    perkDesc: 'Hack Resist II. AI Co-Proc Tier II. Mind Link with allies.',            icon: '⚡' },
    { perkName: 'Transcendent Logic',    perkDesc: 'Psionic Mastery. Reality Anchor. Neural Dominance.',                    icon: '🌐' },
    { perkName: 'Enlightened Arch.',     perkDesc: 'Full Psionic Immunity. Quantum Cognition. AI Symbiosis.',               icon: '🧠' },
  ],
  kin: [
    { perkName: 'Fleet Footed',          perkDesc: '+5% movement speed. Minor fall damage resist.',                         icon: '🏃' },
    { perkName: 'Combat Cadence',        perkDesc: '+10% melee damage. Stamina Regen +0.5/s.',                              icon: '⚔️' },
    { perkName: 'Zero-G Trained',        perkDesc: '+15% movement. Zero-G combat unlock. Dodge window +20ms.',              icon: '🚀' },
    { perkName: 'Kinetic Amplifier',     perkDesc: '+25% melee damage. Momentum Strikes (combo chain bonus).',              icon: '💥' },
    { perkName: 'Apex Predator',         perkDesc: 'Sprint never drains stamina. Aerial assault unlocked.',                 icon: '🐆' },
    { perkName: 'Unstoppable Force',     perkDesc: 'Immune to knockback. Ground slam ability. +40% melee damage total.',    icon: '🌪️' },
  ],
  qnt: [
    { perkName: 'Tech Intuition',        perkDesc: 'Quantum devices recognized on scan. +5 tech comprehension.',            icon: '🔭' },
    { perkName: 'Probability Sense',     perkDesc: 'Hazard pre-detection. +1 quantum device slot.',                         icon: '🎲' },
    { perkName: 'Field Theorist',        perkDesc: 'Quantum shield modulator. +2 device slots. Exotic material crafting.',  icon: '🧪' },
    { perkName: 'Phase Manipulator',     perkDesc: 'Phase-step dodge (short blink). Quantum grenade fabrication.',          icon: '🌀' },
    { perkName: 'Reality Weaver',        perkDesc: 'Probability bubble (slow projectiles near you). +3 device slots.',      icon: '🕸️' },
    { perkName: 'Quantum Sovereign',     perkDesc: 'Temporal suspension (stop time for 2s, 1×/mission). Max device slots.', icon: '⏳' },
  ],
  syn: [
    { perkName: 'Network Aware',         perkDesc: 'Nearby devices show on minimap. +1 drone slot.',                        icon: '📶' },
    { perkName: 'Ghost Protocol',        perkDesc: 'Hack speed +30%. Basic AI negotiation unlocked.',                       icon: '👻' },
    { perkName: 'Swarm Link',            perkDesc: '+2 drone slots. Swarm intel (area scan). Firewall bypass I.',           icon: '🤖' },
    { perkName: 'Neural Mesh',           perkDesc: 'Passive drone repair. AI faction trust +20. Firewall bypass II.',       icon: '🕹️' },
    { perkName: 'Hive Mind Conduit',     perkDesc: 'Direct AI faction diplomacy. Drones inherit combat skills.',            icon: '🧿' },
    { perkName: 'Synthetic Ascension',   perkDesc: 'Become machine-recognized ally. Full drone autonomous control.',        icon: '💎' },
  ],
  chr: [
    { perkName: 'Temporal Grounding',    perkDesc: 'Anomaly resistance +10%. Chronal sickness immunity. Danger-sense HUD overlay.',                                       icon: '⏱️' },
    { perkName: 'Echo Perception',       perkDesc: 'Deploy: Temporal Scout drone (reveals enemies 30m, shows paths 2s ahead). Causality shield I.',                      icon: '👁️' },
    { perkName: 'Phase Anchor',          perkDesc: 'Deploy: Stasis Turret (slows enemies 40%). Rewind I (undo last action). Cannot be time-displaced.',                   icon: '⚓' },
    { perkName: 'Paradox Engine',        perkDesc: 'Deploy: Rewind Anchor (teleport back with HP snapshot). Duplicate self for 5s. Chrono gear unlock.',                  icon: '🔮' },
    { perkName: 'Timeline Bender',       perkDesc: 'Deploy: Temporal Stasis Mine ×2 (freeze enemies 6m AoE, 3s). Rewind II (15s window).',                                icon: '🌊' },
    { perkName: 'Eternal Observer',      perkDesc: 'Outside timeline during death (1×/mission). All chronal deployables +50% duration. Perfect chronal immunity.',        icon: '♾️' },
  ],
  ent: [
    { perkName: 'Hardy Materials',       perkDesc: 'Equipment durability +20%. Salvage yield +10%. Reduced repair cost at field stations.',                               icon: '🪨' },
    { perkName: 'Decay Shield',          perkDesc: 'Deploy: Salvage Drone (auto-harvests resources 40m, +15% yield). Resource spoilage –30%. Corrosion resist I.',        icon: '🛡️' },
    { perkName: 'Reclamation Expert',    perkDesc: 'Deploy: Repair Pylon (heals allies 3 HP/s in 12m, repairs buildings). Craft from degraded materials. Repair –25%.',   icon: '♻️' },
    { perkName: 'Entropy Sink',          perkDesc: 'Deploy: Entropy Field Generator (5 corrosion DPS + slow, 10m). Gear never breaks below 10%.',                         icon: '🌀' },
    { perkName: 'Void Preservation',     perkDesc: 'Deploy: Field Recycler (portable salvage station, +25% yield). Full corrosion immunity.',                             icon: '🫙' },
    { perkName: 'Eternal Engine',        perkDesc: 'Gear is indestructible. All entropic deployables +50% duration. Entropy absorption heals 1 HP/s passively.',          icon: '⚙️' },
  ],
  gra: [
    { perkName: 'Light Footed',          perkDesc: 'Fall damage –25%. Minor zero-G stability. Grav-assisted dodge (longer roll distance).',                               icon: '🪶' },
    { perkName: 'Grav Adapted',          perkDesc: 'Deploy: Gravity Sentry (pulls enemies in 14m, detonates on death). Fall damage –50%. Zero-G navigation.',             icon: '🌙' },
    { perkName: 'Force Sense',           perkDesc: 'Deploy: Mass Driver Turret (heavy kinetic slugs, 35m range). Grav-pulse push ability. Wall-running.',                 icon: '🎯' },
    { perkName: 'Orbital Mastery',       perkDesc: 'Deploy: Gravity Anchor (pin enemies 3s in 8m, allies +15% speed). Full zero-G combat. Personal gravity manipulation.', icon: '🛸' },
    { perkName: 'Graviton Weave',        perkDesc: 'Deploy: Graviton Exoframe mech (+200 HP shield, gravity slam, jet jumps, 60s). Launch enemies skyward.',              icon: '🌌' },
    { perkName: 'Event Horizon Body',    perkDesc: 'Deploy: Orbital Strike Beacon (300 damage 10m AoE after 4s). All gravitic deployables +50% stats. Gravity reversal.', icon: '🕳️' },
  ],
};

export function getBadgesEarned(stats: GrudgeStats): Badge[] {
  const earned: Badge[] = [];
  for (const key of Object.keys(stats) as GrudgeStatKey[]) {
    const val = stats[key];
    for (let m = 1; m <= val; m++) {
      const perk = STAT_MILESTONE_PERKS[key][m - 1];
      earned.push({ statKey: key, milestone: m, ...perk });
    }
  }
  return earned;
}
