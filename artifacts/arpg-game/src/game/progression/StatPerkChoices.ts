/**
 * StatPerkChoices.ts — Grudge Nexus level-up choice tree
 *
 * Pattern (per the 8 Nexus stats — BIO, NEU, KIN, QNT, SYN, CHR, ENT, GRA):
 *   Tier 1-3: auto-grant single milestone perk (existing system, unchanged).
 *   Tier 4 : pick 1-of-3 ACTIVE skills    (assigned to hotkey 1..8 by stat order).
 *   Tier 5 : pick 1-of-3 PASSIVE bonuses (always-on stat modifiers).
 *   Tier 6 : the chosen tier-4 active gets its UPGRADED form (Shift+1..Shift+8).
 *
 * Hotkey order matches STAT_META: BIO=1, NEU=2, KIN=3, QNT=4, SYN=5, CHR=6, ENT=7, GRA=8.
 * Upgrades fire on Shift+<digit> when stat reaches tier 6.
 *
 * Execution: actives are data-driven; the AbilitySystem dispatches by `kind`.
 * VFX is 3D-only (NoiseSphereVFX, ExplosionVFX, particle systems) — never 2D sprites.
 *
 * Authoring note: NEW stat-tier SVG icons live at /icons/perks/stat-tiers/<stat>-t<n>.svg.
 * Active/passive icons here use emoji as a portable fallback; replace with PNG paths
 * when art is finalised.
 */

import type { GrudgeStats } from '../CharacterConfig';

// ─── Active skill kinds (dispatch tags for AbilitySystem) ────────────────────

export type ActiveKind =
  | 'self_buff'        // params: { duration, modifier?: PerkEffect, healFlat?, shieldHp? }
  | 'aoe_burst'        // params: { radius, damage, durationS?, slowPct?, knockback? }
  | 'projectile'       // params: { speed, damage, range, pierce?, element? }
  | 'mobility'         // params: { distance, iframes?, durationS?, leavesTrail? }
  | 'summon'           // params: { count, durationS, dpsPerUnit }
  | 'single_target'    // params: { range, damage, controlS?, pinS? }
  | 'utility';         // params: { healFlat?, repairPct?, cleanseFlags? }

export interface ActiveSkillDef {
  id: string;
  name: string;
  description: string;
  /** Emoji or /icons/... path. */
  icon: string;
  kind: ActiveKind;
  /** Cooldown in seconds. */
  cooldownS: number;
  /** Mana / energy cost (PlayerStats.mana). */
  energyCost: number;
  /** Base damage if applicable (0 for utility / pure buffs). */
  damage: number;
  /** Theme accent (matches stat color when possible). */
  color: string;
  /** Per-kind tuning bag — read by the AbilitySystem dispatcher. */
  params: Record<string, number | boolean | string>;
  /** Hotkey label shown in HUD/help (e.g. "1", "Shift+3"). Bound at runtime. */
  hotkeyHint: string;
  /** Optional: id of the base active this entry upgrades (tier-6 upgrade only). */
  upgradeOf?: string;
}

// ─── Passive perk effect ──────────────────────────────────────────────────────

export interface PassivePerkEffect {
  [statKey: string]: number | boolean | string;
}

export interface PassivePerkDef {
  id: string;
  name: string;
  description: string;
  icon: string;
  effect: PassivePerkEffect;
}

// ─── Hotkey order: same order as STAT_META ────────────────────────────────────

export const STAT_HOTKEY_ORDER: (keyof GrudgeStats)[] = [
  'bio', 'neu', 'kin', 'qnt', 'syn', 'chr', 'ent', 'gra',
];

export function baseHotkeyFor(stat: keyof GrudgeStats): string {
  const idx = STAT_HOTKEY_ORDER.indexOf(stat);
  return idx >= 0 ? String(idx + 1) : '?';
}

export function upgradeHotkeyFor(stat: keyof GrudgeStats): string {
  return `Shift+${baseHotkeyFor(stat)}`;
}

// ─── TIER-4 ACTIVES — 8 stats × 3 options = 24 base actives ───────────────────

export const TIER4_BY_STAT: Record<keyof GrudgeStats, [ActiveSkillDef, ActiveSkillDef, ActiveSkillDef]> = {
  bio: [
    {
      id: 'bio_adrenaline_surge', name: 'Adrenaline Surge',
      description: 'Inject combat stims. Heal 30 HP and absorb the next 25 damage for 4 s.',
      icon: '💉', kind: 'self_buff', cooldownS: 18, energyCost: 25, damage: 0, color: '#4caf50',
      params: { healFlat: 30, shieldHp: 25, durationS: 4 }, hotkeyHint: '1',
    },
    {
      id: 'bio_toxic_counter', name: 'Toxic Counter',
      description: 'Release a 4 m toxin cloud. 8 DPS to enemies inside for 6 s.',
      icon: '☣️', kind: 'aoe_burst', cooldownS: 22, energyCost: 30, damage: 48, color: '#4caf50',
      params: { radius: 4, durationS: 6, dps: 8 }, hotkeyHint: '1',
    },
    {
      id: 'bio_cellular_lockdown', name: 'Cellular Lockdown',
      description: 'Become invulnerable for 1.5 s. You cannot move or attack while active.',
      icon: '🛡️', kind: 'self_buff', cooldownS: 35, energyCost: 20, damage: 0, color: '#4caf50',
      params: { durationS: 1.5, immobile: true, invulnerable: true }, hotkeyHint: '1',
    },
  ],
  neu: [
    {
      id: 'neu_mind_spike', name: 'Mind Spike',
      description: 'Hurl a psionic spike at your target. 50 damage, 25 m range.',
      icon: '🧠', kind: 'projectile', cooldownS: 6, energyCost: 25, damage: 50, color: '#00bcd4',
      params: { speed: 30, range: 25, element: 'psionic' }, hotkeyHint: '2',
    },
    {
      id: 'neu_neural_overclock', name: 'Neural Overclock',
      description: '+30 % attack speed and +20 % move speed for 8 s.',
      icon: '⚡', kind: 'self_buff', cooldownS: 25, energyCost: 35, damage: 0, color: '#00bcd4',
      params: { durationS: 8, atkSpeed: 0.30, moveSpeed: 0.20 }, hotkeyHint: '2',
    },
    {
      id: 'neu_psionic_shield', name: 'Psionic Shield',
      description: 'Generate a 60 HP shield around you for 12 s.',
      icon: '🔵', kind: 'self_buff', cooldownS: 30, energyCost: 40, damage: 0, color: '#00bcd4',
      params: { shieldHp: 60, durationS: 12 }, hotkeyHint: '2',
    },
  ],
  kin: [
    {
      id: 'kin_phase_dash', name: 'Phase Dash',
      description: 'Blink 8 m forward, passing through obstacles and enemies.',
      icon: '🏃', kind: 'mobility', cooldownS: 8, energyCost: 20, damage: 0, color: '#ff9800',
      params: { distance: 8, iframes: 0.4 }, hotkeyHint: '3',
    },
    {
      id: 'kin_ground_pound', name: 'Ground Pound',
      description: 'Leap and slam down. 60 damage in a 4 m radius, knocks enemies back.',
      icon: '💥', kind: 'aoe_burst', cooldownS: 12, energyCost: 30, damage: 60, color: '#ff9800',
      params: { radius: 4, knockback: 5 }, hotkeyHint: '3',
    },
    {
      id: 'kin_combat_dance', name: 'Combat Dance',
      description: '4 invincibility-frame rolls over 3 s. Reset your stamina to full.',
      icon: '🌀', kind: 'self_buff', cooldownS: 18, energyCost: 25, damage: 0, color: '#ff9800',
      params: { durationS: 3, rollCount: 4, restoreStamina: true }, hotkeyHint: '3',
    },
  ],
  qnt: [
    {
      id: 'qnt_quantum_grenade', name: 'Quantum Grenade',
      description: 'Throw a quantum charge that detonates in 1.5 s. 70 damage in 4 m.',
      icon: '🧨', kind: 'projectile', cooldownS: 10, energyCost: 30, damage: 70, color: '#9c27b0',
      params: { speed: 18, range: 20, fuseS: 1.5, radius: 4, element: 'quantum' }, hotkeyHint: '4',
    },
    {
      id: 'qnt_phase_step', name: 'Phase Step',
      description: 'Phase 12 m forward and become invisible for 0.8 s.',
      icon: '👻', kind: 'mobility', cooldownS: 15, energyCost: 35, damage: 0, color: '#9c27b0',
      params: { distance: 12, invisS: 0.8 }, hotkeyHint: '4',
    },
    {
      id: 'qnt_probability_bubble', name: 'Probability Bubble',
      description: 'Slow enemy projectiles 70 % inside a 5 m bubble around you for 6 s.',
      icon: '🫧', kind: 'aoe_burst', cooldownS: 22, energyCost: 40, damage: 0, color: '#9c27b0',
      params: { radius: 5, durationS: 6, projectileSlowPct: 0.70 }, hotkeyHint: '4',
    },
  ],
  syn: [
    {
      id: 'syn_combat_drone', name: 'Combat Drone',
      description: 'Deploy a hover drone that auto-fires at nearby enemies for 15 s.',
      icon: '🤖', kind: 'summon', cooldownS: 25, energyCost: 35, damage: 0, color: '#2196f3',
      params: { count: 1, durationS: 15, dpsPerUnit: 12, leashRange: 18 }, hotkeyHint: '5',
    },
    {
      id: 'syn_emp_burst', name: 'EMP Burst',
      description: '5 m radius pulse. 30 damage and disables enemy abilities for 4 s.',
      icon: '📡', kind: 'aoe_burst', cooldownS: 14, energyCost: 30, damage: 30, color: '#2196f3',
      params: { radius: 5, disableS: 4 }, hotkeyHint: '5',
    },
    {
      id: 'syn_override_protocol', name: 'Override Protocol',
      description: 'Hack a target enemy. They fight for you for 5 s.',
      icon: '🕹️', kind: 'single_target', cooldownS: 30, energyCost: 45, damage: 0, color: '#2196f3',
      params: { range: 18, controlS: 5 }, hotkeyHint: '5',
    },
  ],
  chr: [
    {
      id: 'chr_time_slip', name: 'Time Slip',
      description: 'Slow time around you to 50 % for 4 s. You move at normal speed.',
      icon: '⏳', kind: 'self_buff', cooldownS: 18, energyCost: 35, damage: 0, color: '#ffeb3b',
      params: { durationS: 4, worldTimeScale: 0.5 }, hotkeyHint: '6',
    },
    {
      id: 'chr_rewind', name: 'Rewind',
      description: 'Teleport back to your location 3 s ago. Restore HP to that point.',
      icon: '⏪', kind: 'mobility', cooldownS: 25, energyCost: 40, damage: 0, color: '#ffeb3b',
      params: { rewindS: 3, restoreHp: true }, hotkeyHint: '6',
    },
    {
      id: 'chr_echo_strike', name: 'Echo Strike',
      description: 'Your next 3 attacks within 5 s repeat 1 s later for 50 % damage.',
      icon: '👁️', kind: 'self_buff', cooldownS: 14, energyCost: 25, damage: 0, color: '#ffeb3b',
      params: { durationS: 5, attackEchoes: 3, echoDelayS: 1, echoMult: 0.5 }, hotkeyHint: '6',
    },
  ],
  ent: [
    {
      id: 'ent_decay_wave', name: 'Decay Wave',
      description: 'Cone wave 8 m forward. 40 damage and corrodes enemy armor 30 % for 6 s.',
      icon: '🌊', kind: 'aoe_burst', cooldownS: 12, energyCost: 30, damage: 40, color: '#f44336',
      params: { radius: 8, cone: true, armorCorrodePct: 0.30, durationS: 6 }, hotkeyHint: '7',
    },
    {
      id: 'ent_entropic_shroud', name: 'Entropic Shroud',
      description: '50 % damage resistance and 5 HP/s regen for 6 s.',
      icon: '🌫️', kind: 'self_buff', cooldownS: 22, energyCost: 35, damage: 0, color: '#f44336',
      params: { durationS: 6, damageResistPct: 0.50, regenHps: 5 }, hotkeyHint: '7',
    },
    {
      id: 'ent_salvage_burst', name: 'Salvage Burst',
      description: 'Instantly repair all equipped gear by 30 %.',
      icon: '🔧', kind: 'utility', cooldownS: 40, energyCost: 30, damage: 0, color: '#f44336',
      params: { repairPct: 0.30 }, hotkeyHint: '7',
    },
  ],
  gra: [
    {
      id: 'gra_grav_pulse', name: 'Grav Pulse',
      description: 'Push enemies in a 6 m radius back 5 m. 25 damage on contact.',
      icon: '🌀', kind: 'aoe_burst', cooldownS: 10, energyCost: 25, damage: 25, color: '#009688',
      params: { radius: 6, knockback: 5 }, hotkeyHint: '8',
    },
    {
      id: 'gra_levitate', name: 'Levitate',
      description: 'Float for 5 s. Immune to ground hazards. +40 % move speed in air.',
      icon: '🪶', kind: 'self_buff', cooldownS: 18, energyCost: 30, damage: 0, color: '#009688',
      params: { durationS: 5, hover: true, moveSpeed: 0.40 }, hotkeyHint: '8',
    },
    {
      id: 'gra_anchor_slam', name: 'Anchor Slam',
      description: 'Pin a target enemy to the ground for 3 s. 50 damage on impact.',
      icon: '⚓', kind: 'single_target', cooldownS: 12, energyCost: 35, damage: 50, color: '#009688',
      params: { range: 12, pinS: 3 }, hotkeyHint: '8',
    },
  ],
};

// ─── TIER-6 UPGRADES — one per tier-4 active (24 total) ───────────────────────
//
// Each upgrade carries `upgradeOf: <base_id>`. When the player has chosen the
// matching base AND reached stat tier 6, the upgrade replaces the base hotkey
// behaviour (and its enhanced form is also bound to Shift+<digit>).

export const TIER6_BY_BASE_ID: Record<string, ActiveSkillDef> = {
  // ── BIO upgrades ───────────────────────────────────────────────────────────
  bio_adrenaline_surge: {
    id: 'bio_adrenaline_cascade', name: 'Adrenaline Cascade', upgradeOf: 'bio_adrenaline_surge',
    description: 'Heal 60 HP, absorb 50 dmg for 8 s, and cleanse bleed + infection.',
    icon: '💉', kind: 'self_buff', cooldownS: 18, energyCost: 25, damage: 0, color: '#4caf50',
    params: { healFlat: 60, shieldHp: 50, durationS: 8, cleanseBleed: true, cleanseInfection: true },
    hotkeyHint: 'Shift+1',
  },
  bio_toxic_counter: {
    id: 'bio_necrotoxin_bloom', name: 'Necrotoxin Bloom', upgradeOf: 'bio_toxic_counter',
    description: '6 m cloud. 14 DPS for 9 s. Enemies inside slowed 25 %.',
    icon: '☣️', kind: 'aoe_burst', cooldownS: 22, energyCost: 30, damage: 126, color: '#4caf50',
    params: { radius: 6, durationS: 9, dps: 14, slowPct: 0.25 }, hotkeyHint: 'Shift+1',
  },
  bio_cellular_lockdown: {
    id: 'bio_stasis_pod', name: 'Stasis Pod', upgradeOf: 'bio_cellular_lockdown',
    description: '3 s invulnerability, regen 40 HP over duration, move at 50 % speed.',
    icon: '🛡️', kind: 'self_buff', cooldownS: 35, energyCost: 20, damage: 0, color: '#4caf50',
    params: { durationS: 3, invulnerable: true, healFlat: 40, moveSpeed: -0.50 }, hotkeyHint: 'Shift+1',
  },

  // ── NEU upgrades ───────────────────────────────────────────────────────────
  neu_mind_spike: {
    id: 'neu_mind_lance', name: 'Mind Lance', upgradeOf: 'neu_mind_spike',
    description: '80 damage psionic lance. Pierces up to 3 enemies in a line.',
    icon: '🧠', kind: 'projectile', cooldownS: 6, energyCost: 25, damage: 80, color: '#00bcd4',
    params: { speed: 40, range: 30, pierce: 3, element: 'psionic' }, hotkeyHint: 'Shift+2',
  },
  neu_neural_overclock: {
    id: 'neu_synaptic_surge', name: 'Synaptic Surge', upgradeOf: 'neu_neural_overclock',
    description: '+50 % attack speed, +30 % move speed, +20 % damage for 10 s.',
    icon: '⚡', kind: 'self_buff', cooldownS: 25, energyCost: 35, damage: 0, color: '#00bcd4',
    params: { durationS: 10, atkSpeed: 0.50, moveSpeed: 0.30, dmgBonus: 0.20 }, hotkeyHint: 'Shift+2',
  },
  neu_psionic_shield: {
    id: 'neu_aegis_lattice', name: 'Aegis Lattice', upgradeOf: 'neu_psionic_shield',
    description: '120 HP shield for 15 s. Reflects 25 % of damage taken back to attackers.',
    icon: '🔵', kind: 'self_buff', cooldownS: 30, energyCost: 40, damage: 0, color: '#00bcd4',
    params: { shieldHp: 120, durationS: 15, reflectPct: 0.25 }, hotkeyHint: 'Shift+2',
  },

  // ── KIN upgrades ───────────────────────────────────────────────────────────
  kin_phase_dash: {
    id: 'kin_slipstream', name: 'Slipstream', upgradeOf: 'kin_phase_dash',
    description: 'Blink 14 m. Leaves a damage trail (40 dmg). Removes all slows on use.',
    icon: '🏃', kind: 'mobility', cooldownS: 8, energyCost: 20, damage: 40, color: '#ff9800',
    params: { distance: 14, iframes: 0.5, leavesTrail: true, cleanseSlow: true }, hotkeyHint: 'Shift+3',
  },
  kin_ground_pound: {
    id: 'kin_seismic_slam', name: 'Seismic Slam', upgradeOf: 'kin_ground_pound',
    description: '100 damage in a 6 m radius. Stuns hit enemies for 1.5 s.',
    icon: '💥', kind: 'aoe_burst', cooldownS: 12, energyCost: 30, damage: 100, color: '#ff9800',
    params: { radius: 6, knockback: 7, stunS: 1.5 }, hotkeyHint: 'Shift+3',
  },
  kin_combat_dance: {
    id: 'kin_whirling_gale', name: 'Whirling Gale', upgradeOf: 'kin_combat_dance',
    description: '6 i-frame rolls over 4 s. Each roll leaves a slash dealing 25 damage.',
    icon: '🌀', kind: 'self_buff', cooldownS: 18, energyCost: 25, damage: 150, color: '#ff9800',
    params: { durationS: 4, rollCount: 6, restoreStamina: true, slashDamage: 25 }, hotkeyHint: 'Shift+3',
  },

  // ── QNT upgrades ───────────────────────────────────────────────────────────
  qnt_quantum_grenade: {
    id: 'qnt_antimatter_charge', name: 'Antimatter Charge', upgradeOf: 'qnt_quantum_grenade',
    description: '120 damage in 6 m. Leaves a probability rift slowing enemies 30 % for 4 s.',
    icon: '🧨', kind: 'projectile', cooldownS: 10, energyCost: 30, damage: 120, color: '#9c27b0',
    params: { speed: 22, range: 24, fuseS: 1.5, radius: 6, riftSlowPct: 0.30, riftDurationS: 4 },
    hotkeyHint: 'Shift+4',
  },
  qnt_phase_step: {
    id: 'qnt_reality_skip', name: 'Reality Skip', upgradeOf: 'qnt_phase_step',
    description: '20 m teleport, 2 s invisibility, +25 % damage on next attack.',
    icon: '👻', kind: 'mobility', cooldownS: 15, energyCost: 35, damage: 0, color: '#9c27b0',
    params: { distance: 20, invisS: 2, nextAttackBonus: 0.25 }, hotkeyHint: 'Shift+4',
  },
  qnt_probability_bubble: {
    id: 'qnt_causality_field', name: 'Causality Field', upgradeOf: 'qnt_probability_bubble',
    description: '8 m field. Slows projectiles 90 % and grants 30 % deflect chance for 9 s.',
    icon: '🫧', kind: 'aoe_burst', cooldownS: 22, energyCost: 40, damage: 0, color: '#9c27b0',
    params: { radius: 8, durationS: 9, projectileSlowPct: 0.90, deflectChance: 0.30 },
    hotkeyHint: 'Shift+4',
  },

  // ── SYN upgrades ───────────────────────────────────────────────────────────
  syn_combat_drone: {
    id: 'syn_hk_swarm', name: 'Hunter-Killer Swarm', upgradeOf: 'syn_combat_drone',
    description: 'Deploy 3 drones for 25 s. Each does 20 DPS and seeks separate targets.',
    icon: '🤖', kind: 'summon', cooldownS: 25, energyCost: 35, damage: 0, color: '#2196f3',
    params: { count: 3, durationS: 25, dpsPerUnit: 20, leashRange: 22 }, hotkeyHint: 'Shift+5',
  },
  syn_emp_burst: {
    id: 'syn_cascade_emp', name: 'Cascade EMP', upgradeOf: 'syn_emp_burst',
    description: '8 m pulse. 60 damage, disables 7 s, drains 50 % enemy energy.',
    icon: '📡', kind: 'aoe_burst', cooldownS: 14, energyCost: 30, damage: 60, color: '#2196f3',
    params: { radius: 8, disableS: 7, energyDrainPct: 0.50 }, hotkeyHint: 'Shift+5',
  },
  syn_override_protocol: {
    id: 'syn_hostile_takeover', name: 'Hostile Takeover', upgradeOf: 'syn_override_protocol',
    description: 'Hacked target fights for you for 8 s. Retains its buffs and debuffs.',
    icon: '🕹️', kind: 'single_target', cooldownS: 30, energyCost: 45, damage: 0, color: '#2196f3',
    params: { range: 22, controlS: 8, retainEffects: true }, hotkeyHint: 'Shift+5',
  },

  // ── CHR upgrades ───────────────────────────────────────────────────────────
  chr_time_slip: {
    id: 'chr_temporal_stasis', name: 'Temporal Stasis', upgradeOf: 'chr_time_slip',
    description: 'World slows to 20 % for 6 s. You move at full speed.',
    icon: '⏳', kind: 'self_buff', cooldownS: 18, energyCost: 35, damage: 0, color: '#ffeb3b',
    params: { durationS: 6, worldTimeScale: 0.2 }, hotkeyHint: 'Shift+6',
  },
  chr_rewind: {
    id: 'chr_causal_loop', name: 'Causal Loop', upgradeOf: 'chr_rewind',
    description: 'Rewind 6 s. Restores HP, energy, and clears debuffs.',
    icon: '⏪', kind: 'mobility', cooldownS: 25, energyCost: 40, damage: 0, color: '#ffeb3b',
    params: { rewindS: 6, restoreHp: true, restoreEnergy: true, cleanseAll: true },
    hotkeyHint: 'Shift+6',
  },
  chr_echo_strike: {
    id: 'chr_temporal_echo', name: 'Temporal Echo', upgradeOf: 'chr_echo_strike',
    description: 'Your next 5 attacks repeat 1 s later for 100 % damage.',
    icon: '👁️', kind: 'self_buff', cooldownS: 14, energyCost: 25, damage: 0, color: '#ffeb3b',
    params: { durationS: 6, attackEchoes: 5, echoDelayS: 1, echoMult: 1.0 }, hotkeyHint: 'Shift+6',
  },

  // ── ENT upgrades ───────────────────────────────────────────────────────────
  ent_decay_wave: {
    id: 'ent_annihilation_pulse', name: 'Annihilation Pulse', upgradeOf: 'ent_decay_wave',
    description: '12 m cone. 70 damage and 60 % armor corrosion for 10 s.',
    icon: '🌊', kind: 'aoe_burst', cooldownS: 12, energyCost: 30, damage: 70, color: '#f44336',
    params: { radius: 12, cone: true, armorCorrodePct: 0.60, durationS: 10 }, hotkeyHint: 'Shift+7',
  },
  ent_entropic_shroud: {
    id: 'ent_void_mantle', name: 'Void Mantle', upgradeOf: 'ent_entropic_shroud',
    description: '75 % DR, 10 HP/s, reflects 25 % damage for 10 s.',
    icon: '🌫️', kind: 'self_buff', cooldownS: 22, energyCost: 35, damage: 0, color: '#f44336',
    params: { durationS: 10, damageResistPct: 0.75, regenHps: 10, reflectPct: 0.25 },
    hotkeyHint: 'Shift+7',
  },
  ent_salvage_burst: {
    id: 'ent_phoenix_reclamation', name: 'Phoenix Reclamation', upgradeOf: 'ent_salvage_burst',
    description: 'Fully repair all gear and heal 50 HP. 50 s cooldown.',
    icon: '🔧', kind: 'utility', cooldownS: 50, energyCost: 30, damage: 0, color: '#f44336',
    params: { repairPct: 1.0, healFlat: 50 }, hotkeyHint: 'Shift+7',
  },

  // ── GRA upgrades ───────────────────────────────────────────────────────────
  gra_grav_pulse: {
    id: 'gra_singularity_burst', name: 'Singularity Burst', upgradeOf: 'gra_grav_pulse',
    description: 'Pull enemies in then explode. 60 damage in 8 m.',
    icon: '🌀', kind: 'aoe_burst', cooldownS: 10, energyCost: 25, damage: 60, color: '#009688',
    params: { radius: 8, pullFirst: true, knockback: 0 }, hotkeyHint: 'Shift+8',
  },
  gra_levitate: {
    id: 'gra_zero_g_drift', name: 'Zero-G Drift', upgradeOf: 'gra_levitate',
    description: 'Hover for 8 s with full mobility. Can attack and aim while flying.',
    icon: '🪶', kind: 'self_buff', cooldownS: 18, energyCost: 30, damage: 0, color: '#009688',
    params: { durationS: 8, hover: true, moveSpeed: 0.40, attackWhileHover: true }, hotkeyHint: 'Shift+8',
  },
  gra_anchor_slam: {
    id: 'gra_gravity_coffin', name: 'Gravity Coffin', upgradeOf: 'gra_anchor_slam',
    description: 'Pin target for 5 s, 90 damage. Effect spreads to all enemies within 3 m of target.',
    icon: '⚓', kind: 'single_target', cooldownS: 12, energyCost: 35, damage: 90, color: '#009688',
    params: { range: 14, pinS: 5, splashRadius: 3 }, hotkeyHint: 'Shift+8',
  },
};

// ─── TIER-5 PASSIVES — 8 stats × 3 options = 24 passives ──────────────────────

export const TIER5_BY_STAT: Record<keyof GrudgeStats, [PassivePerkDef, PassivePerkDef, PassivePerkDef]> = {
  bio: [
    { id: 'bio_pass_hardened_marrow', name: 'Hardened Marrow',
      description: '+25 % maximum HP.', icon: '🦴',
      effect: { maxHpPct: 0.25 } },
    { id: 'bio_pass_regen_network', name: 'Regen Network',
      description: '+1.5 HP / s passive regeneration in and out of combat.', icon: '💗',
      effect: { regenHpsFlat: 1.5 } },
    { id: 'bio_pass_antitoxin', name: 'Antitoxin Cascade',
      description: '50 % poison and bleed resistance.', icon: '💊',
      effect: { poisonResistPct: 0.50, bleedResistPct: 0.50 } },
  ],
  neu: [
    { id: 'neu_pass_quick_synapse', name: 'Quick Synapse',
      description: '−20 % cooldown on all active skills.', icon: '⚡',
      effect: { cooldownReductionPct: 0.20 } },
    { id: 'neu_pass_mental_fortitude', name: 'Mental Fortitude',
      description: '60 % psionic resistance. Immune to fear and confusion.', icon: '🧱',
      effect: { psionicResistPct: 0.60, fearImmune: true } },
    { id: 'neu_pass_neural_capacity', name: 'Neural Capacity',
      description: '+50 maximum energy and +25 % energy regen.', icon: '🔋',
      effect: { maxEnergyFlat: 50, energyRegenPct: 0.25 } },
  ],
  kin: [
    { id: 'kin_pass_quicksilver', name: 'Quicksilver Tendons',
      description: '+15 % movement speed. +25 % stamina regeneration.', icon: '🌬️',
      effect: { moveSpeedPct: 0.15, staminaRegenPct: 0.25 } },
    { id: 'kin_pass_momentum', name: 'Momentum Build',
      description: 'Each kill grants +5 % move speed for 6 s. Stacks up to 3.', icon: '🔥',
      effect: { killMoveStackPct: 0.05, killMoveStackMax: 3, killMoveDurationS: 6 } },
    { id: 'kin_pass_counter_reflex', name: 'Counter Reflexes',
      description: '25 % chance to dodge incoming melee attacks.', icon: '💨',
      effect: { meleeDodgeChance: 0.25 } },
  ],
  qnt: [
    { id: 'qnt_pass_probability_field', name: 'Probability Field',
      description: '+15 % critical hit chance.', icon: '🎲',
      effect: { critChance: 0.15 } },
    { id: 'qnt_pass_phase_resilience', name: 'Phase Resilience',
      description: '20 % chance to take no damage from a hit.', icon: '✨',
      effect: { phaseDodgeChance: 0.20 } },
    { id: 'qnt_pass_quantum_loadout', name: 'Quantum Loadout',
      description: '+2 quantum device / grenade slots.', icon: '🧪',
      effect: { quantumSlots: 2 } },
  ],
  syn: [
    { id: 'syn_pass_drone_affinity', name: 'Drone Affinity',
      description: 'Allied drones do +50 % damage and have +50 % HP.', icon: '🛰️',
      effect: { droneDamagePct: 0.50, droneHpPct: 0.50 } },
    { id: 'syn_pass_hack_mastery', name: 'Hack Mastery',
      description: '−40 % hack time. +1 max ally drone.', icon: '🔓',
      effect: { hackTimePct: -0.40, maxAllyDrones: 1 } },
    { id: 'syn_pass_network_convergence', name: 'Network Convergence',
      description: 'Each allied drone within 12 m grants you +10 % attack speed.', icon: '📶',
      effect: { droneNearbyAtkSpeed: 0.10, droneNearbyRange: 12 } },
  ],
  chr: [
    { id: 'chr_pass_future_sight', name: 'Future Sight',
      description: 'See incoming attacks 1 s early (visual pre-flash). +15 % dodge.', icon: '👁️',
      effect: { precogS: 1, dodgeChance: 0.15 } },
    { id: 'chr_pass_temporal_recovery', name: 'Temporal Recovery',
      description: 'All cooldowns tick 25 % faster.', icon: '⏰',
      effect: { cooldownReductionPct: 0.25 } },
    { id: 'chr_pass_paradox_resilience', name: 'Paradox Resilience',
      description: 'Once per zone, revive at 50 % HP after a fatal blow.', icon: '🔮',
      effect: { reviveCharges: 1, reviveHpPct: 0.50 } },
  ],
  ent: [
    { id: 'ent_pass_indestructible', name: 'Indestructible Gear',
      description: 'Equipment never breaks below 20 % durability.', icon: '🛡️',
      effect: { gearDurabilityFloor: 0.20 } },
    { id: 'ent_pass_salvager_eye', name: "Salvager's Eye",
      description: '+50 % scrap yield. Identify rare materials on the ground.', icon: '🔎',
      effect: { scrapYieldPct: 0.50, identifyRare: true } },
    { id: 'ent_pass_erosion_aura', name: 'Erosion Aura',
      description: 'Enemies within 5 m take 5 DPS decay damage.', icon: '☠️',
      effect: { erosionAuraDps: 5, erosionAuraRange: 5 } },
  ],
  gra: [
    { id: 'gra_pass_featherfall', name: 'Featherfall',
      description: 'Total fall damage immunity. +10 % jump height.', icon: '🪂',
      effect: { fallDamageImmune: true, jumpHeightPct: 0.10 } },
    { id: 'gra_pass_grav_reservoir', name: 'Grav Reservoir',
      description: '+1 grav-tech device slot. Grav abilities cost 25 % less energy.', icon: '🛸',
      effect: { gravSlots: 1, gravEnergyCostPct: -0.25 } },
    { id: 'gra_pass_tidal_push', name: 'Tidal Push',
      description: 'Melee attacks knock enemies back 1 m.', icon: '👊',
      effect: { meleeKnockback: 1 } },
  ],
};

// ─── Lookup helpers ───────────────────────────────────────────────────────────

export function getActiveSkillById(id: string): ActiveSkillDef | undefined {
  for (const stat of STAT_HOTKEY_ORDER) {
    const found = TIER4_BY_STAT[stat].find(a => a.id === id);
    if (found) return found;
  }
  return TIER6_BY_BASE_ID[id];
}

export function getPassivePerkById(id: string): PassivePerkDef | undefined {
  for (const stat of STAT_HOTKEY_ORDER) {
    const found = TIER5_BY_STAT[stat].find(p => p.id === id);
    if (found) return found;
  }
  return undefined;
}

/**
 * Resolve the active skill that fires when the player presses the base hotkey
 * for `stat`. If stat is at >= tier 6 and the chosen tier-4 active has an
 * upgrade, returns the upgraded version; otherwise the picked base.
 */
export function resolveActiveForStat(
  stat: keyof GrudgeStats,
  statLevel: number,
  pickedBaseId: string | undefined,
): { base: ActiveSkillDef | undefined; upgrade: ActiveSkillDef | undefined } {
  if (!pickedBaseId) return { base: undefined, upgrade: undefined };
  const base = TIER4_BY_STAT[stat].find(a => a.id === pickedBaseId);
  const upgrade = statLevel >= 6 ? TIER6_BY_BASE_ID[pickedBaseId] : undefined;
  return { base, upgrade };
}
