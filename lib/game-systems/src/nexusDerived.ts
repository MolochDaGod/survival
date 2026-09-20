/**
 * Nexus bake — derived combat/survival sheet from BIO·NEU·KIN·QNT·SYN·CHR·ENT·GRA.
 *
 * SSOT for voxel-era characters and Main Panel defaults.
 * Primary catalog + affinity keys match api-server stats/catalog + stats-guide.html.
 *
 * Diminishing returns (`effectivePoints`) apply when raw investment is scaled;
 * for 0–6 primary ranks DR is identity (all under DR_FULL_CAP).
 */

import { effectivePoints, STAT_CAPS, STAT_DEFAULT, STARTING_BUDGET } from './attributes.js';
import type { GrudgeStats, GrudgeStatKey, PlayerStats } from './types.js';
import { GRUDGE_STAT_KEYS } from './types.js';

// ── Defaults (baked for voxel-era) ───────────────────────────────────────────

/** Empty allocation — player spends STARTING_BUDGET (24) on Main Panel / create. */
export const DEFAULT_STATS: GrudgeStats = {
  bio: STAT_DEFAULT,
  neu: STAT_DEFAULT,
  kin: STAT_DEFAULT,
  qnt: STAT_DEFAULT,
  syn: STAT_DEFAULT,
  chr: STAT_DEFAULT,
  ent: STAT_DEFAULT,
  gra: STAT_DEFAULT,
};

/**
 * Voxel-era starter: minimal survival triad (BIO/NEU/KIN = 1 each = 3 pts).
 * Remaining unspent = STARTING_BUDGET − 3 = 21.
 */
export const VOXEL_ERA_STARTER_STATS: GrudgeStats = {
  bio: 1,
  neu: 1,
  kin: 1,
  qnt: 0,
  syn: 0,
  chr: 0,
  ent: 0,
  gra: 0,
};

export function cloneStats(s: GrudgeStats = DEFAULT_STATS): GrudgeStats {
  return { ...s };
}

export function isValidGrudgeStats(s: unknown): s is GrudgeStats {
  if (!s || typeof s !== 'object') return false;
  return GRUDGE_STAT_KEYS.every((k) => typeof (s as GrudgeStats)[k] === 'number');
}

// ── Affinity catalog (matches stats-guide /api/stats/primary) ────────────────

export interface NexusAffinity {
  key: string;
  domain: GrudgeStatKey;
  label: string;
  kind: 'pct' | 'flat';
}

export interface NexusPrimaryDef {
  key: GrudgeStatKey;
  abbr: string;
  label: string;
  color: string;
  archetype: string;
  description: string;
  affinities: string[];
}

export const NEXUS_PRIMARY: NexusPrimaryDef[] = [
  {
    key: 'bio',
    abbr: 'BIO',
    label: 'Biomass',
    color: '#4caf50',
    archetype: 'Survivor / Forager / Field Medic',
    description:
      'Max health, natural healing, toxin resistance, implant compatibility, food and harvest yields.',
    affinities: [
      'maxHpBonus', 'oocHealRate', 'allyAuraHealRate',
      'foodBuffDurationBonus', 'foodEffectBonus', 'cookingYieldBonus',
      'harvestYieldBonus', 'harvestRareBonus', 'harvestSpeedBonus',
      'skinningYieldBonus', 'fishingYieldBonus', 'baitDurationBonus',
      'treeRegrowSpeedBonus',
      'coldResistBonus', 'heatResistBonus', 'radResistBonus',
      'weaponPoisonOnHit', 'poisonArmourPenetration',
      'potionPotencyBonus', 'distillYieldBonus', 'biomeDamageBonus',
    ],
  },
  {
    key: 'neu',
    abbr: 'NEU',
    label: 'Neural Integrity',
    color: '#00bcd4',
    archetype: 'Hacker / Scout / Sniper',
    description:
      'Sanity, psionic defense, AI co-processor cap, neural-hack resistance — drives gadgets, stealth, and perception.',
    affinities: [
      'gadgetCooldownReduction', 'gadgetCritBonus', 'gadgetCritChance', 'gadgetEffectBonus',
      'trapRareDropBonus', 'trapTriggerBonus', 'passiveTrapXpRate',
      'stealthBonus', 'lockpickSpeedBonus', 'pickpocketYieldBonus', 'backstabDamageBonus',
      'nightHerbVisionRange', 'fogRevealRange', 'spyglassZoomBonus',
      'crystalDetectRange', 'minimapEnemyRange', 'permafrostMinimapRange', 'npcAlertRange',
      'rifleAccuracyBonus', 'rifleHeadshotBonus',
    ],
  },
  {
    key: 'kin',
    abbr: 'KIN',
    label: 'Kinetic Efficiency',
    color: '#ff9800',
    archetype: 'Bladesman / Gunfighter / Sprinter',
    description:
      'Movement speed, melee damage, stamina regen, zero-G combat — the warrior stat.',
    affinities: [
      'bladeAttackSpeedBonus', 'bladeCritDamageBonus', 'bladeUseDamageBonus',
      'bladesmithDamageBonus', 'hammerUseDamageBonus', 'gunsmithDamageBonus',
      'pistolCritBonus', 'pistolDamageBonus', 'pistolReloadSpeedBonus',
      'rifleDamageBonus', 'explosionDamageBonus', 'explosionRadiusBonus',
      'staggerChanceBonus', 'parryStaminaBonus',
      'sprintCostReduction', 'staminaRegenBonus', 'oocSpeedBonus',
      'shieldBreakBonus', 'damageReductionBonus', 'armourDefenseBonus', 'bloodTrailDuration',
    ],
  },
  {
    key: 'qnt',
    abbr: 'QNT',
    label: 'Quantum Aptitude',
    color: '#9c27b0',
    archetype: 'Salvager / Anomaly Hunter / Probability Engineer',
    description:
      'Tech comprehension, quantum-device operation, probability manipulation — biases rare-drop chance.',
    affinities: [
      'anomalyShardBonus', 'crystalYieldBonus', 'derelictDoubleDropChance',
      'veinDoubleYieldChance', 'ironYieldBonus', 'copperYieldBonus',
      'salvageYieldBonus', 'smeltYieldBonus', 'permafrostYieldBonus',
    ],
  },
  {
    key: 'syn',
    abbr: 'SYN',
    label: 'Synthetic Affinity',
    color: '#2196f3',
    archetype: 'Architect / Drone Master / Quartermaster',
    description:
      'Hacking skill, drone control, AI negotiation, swarm intelligence — drives turrets, building, and hires.',
    affinities: [
      'turretDamageBonus', 'buildingHpBonus', 'wallHpBonus',
      'buildCostReduction', 'craftCostReduction', 'craftQualityBonus',
      'recruitCapBonus', 'followerSlots', 'campMoraleBonus',
      'bountyContractSlots', 'bountyGoldBonus', 'bountyXpBonus',
      'bountyMissionXpBonus', 'bountyRareContractBonus',
      'sellGoldBonus', 'passiveGoldRate', 'reputationGainBonus',
    ],
  },
  {
    key: 'chr',
    abbr: 'CHR',
    label: 'Chronal Stability',
    color: '#c9a000',
    archetype: 'Chrono-Operative / Echo Reader',
    description:
      'Temporal anomaly resistance, time perception, causality protection — drives time-slip actives and echo-strike combos.',
    affinities: [
      'timeSlowDuration', 'rewindWindowS', 'echoStrikeMult',
      'chronalSicknessResist', 'causalityShieldHp', 'temporalDodgeChance',
      'phaseAnchorRadius', 'paradoxDuplicateDuration',
      'timelineRewindRange', 'chronoGearUnlock',
    ],
  },
  {
    key: 'ent',
    abbr: 'ENT',
    label: 'Entropic Resistance',
    color: '#f44336',
    archetype: 'Reclaimer / Preserver',
    description:
      'Equipment durability, resource preservation, decay resistance — drives decay-wave actives and salvage perks.',
    affinities: [
      'gearDurabilityBonus', 'salvageYieldBonus', 'resourceSpoilageReduction',
      'corrosionResist', 'decayWaveDamage', 'armorCorrodePct',
      'entropicShroudResist', 'repairCostReduction',
      'gearMinDurability', 'passiveEntropyHeal',
    ],
  },
  {
    key: 'gra',
    abbr: 'GRA',
    label: 'Gravitic Harmony',
    color: '#009688',
    archetype: 'Orbital Specialist',
    description:
      'Fall damage reduction, zero-G adaptation, spatial force manipulation — drives grav-pulse actives and levitation.',
    affinities: [
      'fallDamageReduction', 'zeroGStability', 'gravPulseKnockback',
      'levitateDuration', 'airMoveSpeedBonus', 'groundHazardImmunity',
      'anchorSlamDamage', 'anchorPinDuration',
      'wallRunDuration', 'gravityFieldRadius',
    ],
  },
];

// ── 37 derived (combat sheet labels from stats-guide) ────────────────────────

export interface NexusDerivedSheet {
  // Core pools / offense / defense (main panel vitals)
  health: number;
  mana: number;
  stamina: number;
  damage: number;
  defense: number;
  magicDefense: number;
  healPower: number;
  block: number;
  blockEffect: number;
  evasion: number;
  accuracy: number;
  criticalChance: number;
  criticalDamage: number;
  attackSpeed: number;
  movementSpeed: number;
  resistance: number;
  cdrResist: number;
  defenseBreakResist: number;
  armorPenetration: number;
  blockPenetration: number;
  defenseBreak: number;
  drainHealth: number;
  drainMana: number;
  cooldownReduction: number;
  abilityCost: number;
  spellAccuracy: number;
  stagger: number;
  ccResistance: number;
  damageReduction: number;
  bleedResist: number;
  statusEffect: number;
  spellblock: number;
  dodge: number;
  reflexTime: number;
  criticalEvasion: number;
  fallDamage: number;
  comboCooldownRed: number;
}

export const NEXUS_DERIVED_META: { key: keyof NexusDerivedSheet; label: string; description: string }[] = [
  { key: 'health', label: 'Health', description: 'Maximum Health Points' },
  { key: 'mana', label: 'Mana', description: 'Maximum Mana Points' },
  { key: 'stamina', label: 'Stamina', description: 'Maximum Stamina Points' },
  { key: 'damage', label: 'Damage', description: 'Base Attack Damage' },
  { key: 'defense', label: 'Defense', description: 'Physical Defense Rating' },
  { key: 'magicDefense', label: 'Magic Defense', description: 'Magic Defense Rating' },
  { key: 'healPower', label: 'Heal Power', description: 'Healing Output Bonus' },
  { key: 'block', label: 'Block', description: 'Block Chance' },
  { key: 'blockEffect', label: 'Block Effect', description: 'Block Damage Reduction Factor' },
  { key: 'evasion', label: 'Evasion', description: 'Evasion Chance' },
  { key: 'accuracy', label: 'Accuracy', description: 'Hit / Debuff Accuracy' },
  { key: 'criticalChance', label: 'Critical Chance', description: 'Critical Strike Chance' },
  { key: 'criticalDamage', label: 'Critical Damage', description: 'Critical Strike Multiplier' },
  { key: 'attackSpeed', label: 'Attack Speed', description: 'Attack Speed Bonus' },
  { key: 'movementSpeed', label: 'Movement Speed', description: 'Movement Speed Bonus' },
  { key: 'resistance', label: 'Resistance', description: 'Debuff Resistance' },
  { key: 'cdrResist', label: 'CDR Resist', description: 'Cooldown Reduction Resistance' },
  { key: 'defenseBreakResist', label: 'Defense Break Resist', description: 'Defense Break Resistance' },
  { key: 'armorPenetration', label: 'Armor Penetration', description: 'Armor Penetration' },
  { key: 'blockPenetration', label: 'Block Penetration', description: 'Block Penetration' },
  { key: 'defenseBreak', label: 'Defense Break', description: 'Defense Break Factor' },
  { key: 'drainHealth', label: 'Drain Health', description: 'Health Drain (Lifesteal)' },
  { key: 'drainMana', label: 'Drain Mana', description: 'Mana Drain (Manasteal)' },
  { key: 'cooldownReduction', label: 'Cooldown Reduction', description: 'Cooldown Reduction' },
  { key: 'abilityCost', label: 'Ability Cost', description: 'Ability Cost Reduction' },
  { key: 'spellAccuracy', label: 'Spell Accuracy', description: 'Spell Hit Accuracy' },
  { key: 'stagger', label: 'Stagger', description: 'Stagger Chance' },
  { key: 'ccResistance', label: 'CC Resistance', description: 'Crowd Control Resistance' },
  { key: 'damageReduction', label: 'Damage Reduction', description: 'Flat Damage Reduction' },
  { key: 'bleedResist', label: 'Bleed Resist', description: 'Bleed Resistance' },
  { key: 'statusEffect', label: 'Status Effect', description: 'Status Effect Amplification' },
  { key: 'spellblock', label: 'Spellblock', description: 'Spell Block Chance' },
  { key: 'dodge', label: 'Dodge', description: 'Dodge Chance' },
  { key: 'reflexTime', label: 'Reflex Time', description: 'Reflex Time Bonus' },
  { key: 'criticalEvasion', label: 'Critical Evasion', description: 'Critical Evasion Chance' },
  { key: 'fallDamage', label: 'Fall Damage', description: 'Fall Damage Reduction' },
  { key: 'comboCooldownRed', label: 'Combo Cooldown Red', description: 'Combo Cooldown Reduction' },
];

function drRank(rank: number): number {
  // Ranks 0–6 sit under DR_FULL_CAP; keep hook for future scaled investment.
  return effectivePoints(rank);
}

function cap(key: string, value: number): number {
  const c = STAT_CAPS[key];
  return c !== undefined ? Math.min(c, value) : value;
}

/**
 * Bake the 37 derived combat stats from Nexus primaries.
 * Formula set is the voxel-era / Main Panel SSOT (not legacy STR/VIT).
 */
export function computeDerivedFromNexus(
  stats: GrudgeStats,
  equip: Partial<Record<keyof NexusDerivedSheet, number>> = {},
): NexusDerivedSheet {
  const B = drRank(stats.bio);
  const N = drRank(stats.neu);
  const K = drRank(stats.kin);
  const Q = drRank(stats.qnt);
  const S = drRank(stats.syn);
  const C = drRank(stats.chr);
  const E = drRank(stats.ent);
  const G = drRank(stats.gra);

  const add = (key: keyof NexusDerivedSheet, base: number) =>
    base + (equip[key] ?? 0);

  return {
    health: Math.floor(add('health', 100 + B * 80 + E * 20 + K * 10)),
    mana: Math.floor(add('mana', 50 + N * 45 + Q * 10 + C * 8)),
    stamina: Math.floor(add('stamina', 100 + K * 40 + G * 15 + E * 10)),
    damage: Math.floor(add('damage', 8 + K * 6 + B * 1 + Q * 0.5)),
    defense: Math.floor(add('defense', 5 + E * 8 + B * 3 + K * 2)),
    magicDefense: Math.floor(add('magicDefense', 4 + N * 5 + Q * 4 + C * 3)),
    healPower: Math.floor(add('healPower', B * 4 + E * 1)),
    block: cap('block', add('block', K * 1.2 + E * 2)),
    blockEffect: cap('blockEffect', add('blockEffect', 20 + E * 4 + K * 1)),
    evasion: add('evasion', K * 1.5 + G * 1.2 + N * 0.5),
    accuracy: cap('accuracy', add('accuracy', 70 + N * 3 + K * 1.5 + Q * 1)),
    criticalChance: cap('criticalChance', add('criticalChance', 5 + N * 1.2 + K * 1.5 + Q * 0.8)),
    criticalDamage: cap('criticalDamage', add('criticalDamage', 150 + K * 8 + N * 3)),
    attackSpeed: add('attackSpeed', K * 2.5 + N * 0.5),
    movementSpeed: add('movementSpeed', K * 2 + G * 1.5),
    resistance: cap('resistance', add('resistance', E * 2 + B * 1.5 + N * 1)),
    cdrResist: add('cdrResist', E * 1.5 + C * 1),
    defenseBreakResist: add('defenseBreakResist', E * 2 + B * 1),
    armorPenetration: add('armorPenetration', K * 1.5 + Q * 1.2),
    blockPenetration: add('blockPenetration', K * 1.2 + Q * 0.8),
    defenseBreak: add('defenseBreak', K * 1 + Q * 0.5),
    drainHealth: cap('drainHealth', add('drainHealth', B * 0.8 + E * 0.3)),
    drainMana: cap('drainMana', add('drainMana', N * 0.6 + Q * 0.4)),
    cooldownReduction: add('cooldownReduction', C * 2 + N * 1 + S * 0.5),
    abilityCost: add('abilityCost', N * 1 + C * 1),
    spellAccuracy: cap('accuracy', add('spellAccuracy', 65 + N * 4 + Q * 2 + C * 1)),
    stagger: add('stagger', K * 2 + E * 0.5),
    ccResistance: add('ccResistance', E * 2 + B * 1 + C * 1),
    damageReduction: add('damageReduction', E * 1.5 + B * 0.8 + G * 0.5),
    bleedResist: add('bleedResist', B * 2 + E * 1),
    statusEffect: add('statusEffect', N * 1.5 + Q * 1 + B * 0.5),
    spellblock: add('spellblock', N * 1.2 + E * 1),
    dodge: add('dodge', K * 1.2 + G * 1.5 + C * 1),
    reflexTime: add('reflexTime', C * 2 + N * 1 + K * 0.5),
    criticalEvasion: add('criticalEvasion', N * 1 + G * 0.8 + K * 0.5),
    fallDamage: add('fallDamage', G * 8 + K * 1), // % reduction
    comboCooldownRed: add('comboCooldownRed', C * 1.5 + K * 1),
  };
}

/**
 * Apply Nexus bake onto a PlayerStats combat sheet (runtime vitals).
 * Keeps legacy strength…tactics fields as a bridge so older pipelines still see numbers.
 */
export function applyNexusToPlayerStats(
  base: PlayerStats,
  nexus: GrudgeStats,
  equip: Partial<Record<keyof NexusDerivedSheet, number>> = {},
): PlayerStats {
  const d = computeDerivedFromNexus(nexus, equip);
  const hpFrac = base.maxHealth > 0 ? base.health / base.maxHealth : 1;
  const mpFrac = base.maxMana > 0 ? base.mana / base.maxMana : 1;
  const stFrac = base.maxStamina > 0 ? base.stamina / base.maxStamina : 1;

  return {
    ...base,
    maxHealth: d.health,
    health: Math.max(1, Math.round(d.health * hpFrac)),
    maxMana: d.mana,
    mana: Math.max(0, Math.round(d.mana * mpFrac)),
    maxStamina: d.stamina,
    stamina: Math.max(0, Math.round(d.stamina * stFrac)),
    // Bridge legacy attrs ≈ scaled ranks so old skill trees still read something sensible
    strength: 10 + nexus.kin * 2 + nexus.bio,
    vitality: 10 + nexus.bio * 2 + nexus.ent,
    endurance: 10 + nexus.ent * 2 + nexus.kin,
    intellect: 10 + nexus.neu * 2 + nexus.qnt,
    wisdom: 10 + nexus.neu + nexus.chr + nexus.syn,
    dexterity: 10 + nexus.kin * 2 + nexus.neu,
    agility: 10 + nexus.kin + nexus.gra * 2,
    tactics: 10 + nexus.syn + nexus.qnt + nexus.chr,
  };
}

/** Factory for new voxel-era characters (Main Panel / Foundry create). */
export function createVoxelEraNexusDefaults(opts?: {
  starter?: boolean;
}): { stats: GrudgeStats; derived: NexusDerivedSheet; budget: number; spent: number } {
  const stats = cloneStats(opts?.starter === false ? DEFAULT_STATS : VOXEL_ERA_STARTER_STATS);
  let spent = 0;
  for (const k of GRUDGE_STAT_KEYS) {
    // cost curve: sum STAT_COST[1..rank]
    for (let i = 1; i <= stats[k]; i++) {
      const costs = [0, 1, 2, 4, 8, 16, 20];
      spent += costs[i] ?? 0;
    }
  }
  return {
    stats,
    derived: computeDerivedFromNexus(stats),
    budget: STARTING_BUDGET,
    spent,
  };
}

export { STARTING_BUDGET };
