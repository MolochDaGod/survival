/**
 * PerkSystem.ts — Grudge Nexus perk tree definition
 *
 * Four stat tracks, each with 30 icons and 5 unlock tiers.
 * Tier thresholds (stat points invested): 3 → 5 → 8 → 13 → 20
 *   Each tier unlocks a set of perk choices (3-6 per tier).
 *
 * Cross-stat combo perks fire when two tracks both reach a threshold.
 *
 * Icon path convention:
 *   /icons/perks/<track>/<n>.png   (n = 1..30, matching the source pack)
 *
 * Pack origins:
 *   hero/    ← Hero Achievements ("RPG Weapon achievements icons")    – class/weapon mastery
 *   warrior/ ← Warrior Achievements ("RPG Weapon achievements icons") – combat/strength feats
 *   smarts/  ← Smarts Achievements ("RPG Game achievements icons")    – intelligence/stealth
 *   maker/   ← Maker Achievements  ("RPG Profession achievements 2")  – crafting/building
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type StatTrack = 'hero' | 'warrior' | 'smarts' | 'maker';

/** Minimum points in each listed track to unlock this perk. */
export interface PerkRequirement {
  track: StatTrack;
  points: number;
}

export interface Perk {
  id: string;
  name: string;
  description: string;
  icon: string;           // URL path to the icon PNG
  tier: 1 | 2 | 3 | 4 | 5;
  requires: PerkRequirement[];
  passive: PerkEffect;
}

export interface PerkEffect {
  /** Multiplier or flat bonus applied to the player stat named by key. */
  [statKey: string]: number;
}

export interface ComboUnlock {
  id: string;
  name: string;
  description: string;
  icon: string;
  requireA: PerkRequirement;
  requireB: PerkRequirement;
  passive: PerkEffect;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function icon(track: StatTrack, n: number): string {
  return `/icons/perks/${track}/${n}.png`;
}

// Tier thresholds
const T1 = 3;
const T2 = 5;
const T3 = 8;
const T4 = 13;
const T5 = 20;

function req(track: StatTrack, pts: number): PerkRequirement {
  return { track, points: pts };
}

// ─── HERO TRACK  (core vitals, survival, base character power) ────────────────
// Icons 1-6: HP/Survival perks    | 7-12: Stamina/Endurance
// 13-18: Regen/Healing           | 19-24: Ultimate resilience
// 25-30: Legendary hero traits

export const HERO_PERKS: Perk[] = [
  // ── Tier 1 (3 pts) ──────────────────────────────────────────────────────────
  { id: 'iron_will',       name: 'Iron Will',         tier: 1, requires: [req('hero', T1)], icon: icon('hero', 1),  description: '+15 max HP. Pain does not slow you.', passive: { maxHp: 15 } },
  { id: 'survivor_blood',  name: "Survivor's Blood",  tier: 1, requires: [req('hero', T1)], icon: icon('hero', 2),  description: 'HP regen starts after 8 s out of combat (vs 12 s).', passive: { combatRegenDelay: -4 } },
  { id: 'gut_feeling',     name: 'Gut Feeling',        tier: 1, requires: [req('hero', T1)], icon: icon('hero', 3),  description: 'Hunger and thirst drain 10 % slower.', passive: { hungerRate: -0.10, thirstRate: -0.10 } },

  // ── Tier 2 (5 pts) ──────────────────────────────────────────────────────────
  { id: 'steady_breath',   name: 'Steady Breath',      tier: 2, requires: [req('hero', T2)], icon: icon('hero', 4),  description: '+20 max Stamina. Stamina recharges 15 % faster.', passive: { maxStamina: 20, staminaRegen: 0.15 } },
  { id: 'heat_resist',     name: 'Heat Resistance',    tier: 2, requires: [req('hero', T2)], icon: icon('hero', 5),  description: 'Body temperature changes 20 % slower.', passive: { tempDeltaRate: -0.20 } },
  { id: 'toughened',       name: 'Toughened',           tier: 2, requires: [req('hero', T2)], icon: icon('hero', 6),  description: 'All incoming damage reduced by 5 %.', passive: { damageTaken: -0.05 } },

  // ── Tier 3 (8 pts) ──────────────────────────────────────────────────────────
  { id: 'blood_clot',      name: 'Blood Clot',          tier: 3, requires: [req('hero', T3)], icon: icon('hero', 7),  description: 'Bleeding stops 40 % faster without bandages.', passive: { bleedStopRate: 0.40 } },
  { id: 'second_wind',     name: 'Second Wind',          tier: 3, requires: [req('hero', T3)], icon: icon('hero', 8),  description: 'Once per encounter, when HP drops below 15 %, regain 20 HP instantly.', passive: { secondWindHp: 20 } },
  { id: 'immune_system',   name: 'Immune System',        tier: 3, requires: [req('hero', T3)], icon: icon('hero', 9),  description: 'Infection contracts 50 % slower. Antibiotics are 25 % more effective.', passive: { infectRate: -0.50, medicineEfficiency: 0.25 } },

  // ── Tier 4 (13 pts) ─────────────────────────────────────────────────────────
  { id: 'death_defier',    name: 'Death Defier',         tier: 4, requires: [req('hero', T4)], icon: icon('hero', 10), description: 'Survive one lethal hit per zone visit (HP set to 1).', passive: { deathDefyCharges: 1 } },
  { id: 'fatigue_mastery', name: 'Fatigue Mastery',       tier: 4, requires: [req('hero', T4)], icon: icon('hero', 11), description: 'Fatigue penalties don\'t apply until below 25 % fatigue bar.', passive: { fatigueThreshold: 0.25 } },
  { id: 'hunters_pace',    name: "Hunter's Pace",         tier: 4, requires: [req('hero', T4)], icon: icon('hero', 12), description: 'Move speed +8 % while below 50 % stamina (adrenaline surge).', passive: { adrenalineSpeed: 0.08 } },

  // ── Tier 5 (20 pts) ─────────────────────────────────────────────────────────
  { id: 'apex_survivor',   name: 'Apex Survivor',         tier: 5, requires: [req('hero', T5)], icon: icon('hero', 13), description: '+50 max HP. +30 max Stamina. All vital drains reduced 15 %.', passive: { maxHp: 50, maxStamina: 30, vitalDrain: -0.15 } },
  { id: 'undying',         name: 'Undying',                tier: 5, requires: [req('hero', T5)], icon: icon('hero', 14), description: 'Death Defier recharges every 90 s of survival.', passive: { deathDefyRechargeS: 90 } },
  { id: 'nexus_chosen',    name: 'Nexus Chosen',           tier: 5, requires: [req('hero', T5)], icon: icon('hero', 15), description: 'All stat track bonuses increased by 10 % (multiplicative).', passive: { globalPerkBonus: 0.10 } },
];

// ─── WARRIOR TRACK  (melee combat, weapons, raw damage) ──────────────────────
// Icons 1-6: Melee basics     | 7-12: Weapon handling
// 13-18: Combat mastery       | 19-24: Berserker
// 25-30: Legendary warrior

export const WARRIOR_PERKS: Perk[] = [
  // ── Tier 1 ────────────────────────────────────────────────────────────────
  { id: 'heavy_hands',     name: 'Heavy Hands',       tier: 1, requires: [req('warrior', T1)], icon: icon('warrior', 1),  description: 'Melee damage +12 %.', passive: { meleeDamage: 0.12 } },
  { id: 'quick_draw',      name: 'Quick Draw',          tier: 1, requires: [req('warrior', T1)], icon: icon('warrior', 2),  description: 'Weapon swap time reduced by 30 %.', passive: { swapTime: -0.30 } },
  { id: 'grip',            name: 'Grip',                tier: 1, requires: [req('warrior', T1)], icon: icon('warrior', 3),  description: 'Weapon recoil reduced by 15 %.', passive: { recoil: -0.15 } },

  // ── Tier 2 ────────────────────────────────────────────────────────────────
  { id: 'riposte',         name: 'Riposte',             tier: 2, requires: [req('warrior', T2)], icon: icon('warrior', 4),  description: 'Successful parries deal 25 % of the blocked damage back.', passive: { parryReflect: 0.25 } },
  { id: 'combat_roll',     name: 'Combat Roll',          tier: 2, requires: [req('warrior', T2)], icon: icon('warrior', 5),  description: 'Roll costs 25 % less stamina.', passive: { rollStaminaCost: -0.25 } },
  { id: 'bloodthirst',     name: 'Bloodthirst',          tier: 2, requires: [req('warrior', T2)], icon: icon('warrior', 6),  description: 'Killing an enemy restores 8 HP.', passive: { killHealFlat: 8 } },

  // ── Tier 3 ────────────────────────────────────────────────────────────────
  { id: 'brutality',       name: 'Brutality',            tier: 3, requires: [req('warrior', T3)], icon: icon('warrior', 7),  description: 'Critical hit chance +8 %. Critical hit damage ×1.4.', passive: { critChance: 0.08, critMult: 0.40 } },
  { id: 'stagger_master',  name: 'Stagger Master',        tier: 3, requires: [req('warrior', T3)], icon: icon('warrior', 8),  description: 'Heavy melee attacks stagger enemies 50 % longer.', passive: { staggerDuration: 0.50 } },
  { id: 'ammo_efficient',  name: 'Ammo Efficient',        tier: 3, requires: [req('warrior', T3)], icon: icon('warrior', 9),  description: '15 % chance any bullet does not consume ammo.', passive: { ammoSaveChance: 0.15 } },

  // ── Tier 4 ────────────────────────────────────────────────────────────────
  { id: 'berserker',       name: 'Berserker',             tier: 4, requires: [req('warrior', T4)], icon: icon('warrior', 10), description: 'Below 30 % HP: melee damage +35 %, attack speed +20 %.', passive: { lowHpMeleeDmg: 0.35, lowHpAtkSpeed: 0.20 } },
  { id: 'weapon_expert',   name: 'Weapon Expert',          tier: 4, requires: [req('warrior', T4)], icon: icon('warrior', 11), description: 'All weapon damage +15 %. ADS time −20 %.', passive: { allWeaponDmg: 0.15, adsTime: -0.20 } },
  { id: 'executioner',     name: 'Executioner',            tier: 4, requires: [req('warrior', T4)], icon: icon('warrior', 12), description: 'Enemies below 20 % HP take 50 % more damage from you.', passive: { executeThreshold: 0.20, executeDmg: 0.50 } },

  // ── Tier 5 ────────────────────────────────────────────────────────────────
  { id: 'war_machine',     name: 'War Machine',            tier: 5, requires: [req('warrior', T5)], icon: icon('warrior', 13), description: 'Melee and ranged damage +25 %. Never stagger from hits below 20 damage.', passive: { allDamage: 0.25, staggerImmune: 20 } },
  { id: 'onslaught',       name: 'Onslaught',              tier: 5, requires: [req('warrior', T5)], icon: icon('warrior', 14), description: 'Each consecutive hit on the same enemy increases damage by 5 % (stacks ×6).', passive: { onslaughtPerHit: 0.05, onslaughtMax: 6 } },
  { id: 'nexus_blade',     name: 'Nexus Blade',            tier: 5, requires: [req('warrior', T5)], icon: icon('warrior', 15), description: 'Melee hits sometimes unleash a Nexus energy burst (no cooldown, random 20 % chance).', passive: { nexusBurstChance: 0.20 } },
];

// ─── SMARTS TRACK  (intelligence, stealth, medicine, tactical) ───────────────

export const SMARTS_PERKS: Perk[] = [
  // ── Tier 1 ────────────────────────────────────────────────────────────────
  { id: 'field_medic',     name: 'Field Medic',        tier: 1, requires: [req('smarts', T1)], icon: icon('smarts', 1),  description: 'Healing items restore 20 % more HP.', passive: { healingBonus: 0.20 } },
  { id: 'scavenger',       name: 'Scavenger',           tier: 1, requires: [req('smarts', T1)], icon: icon('smarts', 2),  description: 'Loot containers have a 20 % chance to yield +1 bonus item.', passive: { lootBonusChance: 0.20 } },
  { id: 'light_step',      name: 'Light Step',          tier: 1, requires: [req('smarts', T1)], icon: icon('smarts', 3),  description: 'Movement noise radius reduced by 30 % (AI alert range).', passive: { noiseRadius: -0.30 } },

  // ── Tier 2 ────────────────────────────────────────────────────────────────
  { id: 'quick_bandage',   name: 'Quick Bandage',       tier: 2, requires: [req('smarts', T2)], icon: icon('smarts', 4),  description: 'Bandage / med-kit apply time −35 %.', passive: { medApplyTime: -0.35 } },
  { id: 'trap_sense',      name: 'Trap Sense',           tier: 2, requires: [req('smarts', T2)], icon: icon('smarts', 5),  description: 'Highlight traps and tripwires within 12 m.', passive: { trapSenseRange: 12 } },
  { id: 'night_vision',    name: 'Night Vision',         tier: 2, requires: [req('smarts', T2)], icon: icon('smarts', 6),  description: 'Ambient visibility +30 % at night (shader gamma boost).', passive: { nightVisibility: 0.30 } },

  // ── Tier 3 ────────────────────────────────────────────────────────────────
  { id: 'engineer_eye',    name: "Engineer's Eye",       tier: 3, requires: [req('smarts', T3)], icon: icon('smarts', 7),  description: 'See enemy HP bars beyond 15 m range and through thin cover.', passive: { enemyHpRange: 15 } },
  { id: 'adrenaline_rush', name: 'Adrenaline Rush',      tier: 3, requires: [req('smarts', T3)], icon: icon('smarts', 8),  description: 'Using a med-item while below 30 % HP gives +25 % speed for 6 s.', passive: { adrenalineSpeed: 0.25, adrenalineDur: 6 } },
  { id: 'poison_resist',   name: 'Poison Resistance',    tier: 3, requires: [req('smarts', T3)], icon: icon('smarts', 9),  description: 'Environmental toxins and enemy poison do 40 % less damage.', passive: { poisonDmgTaken: -0.40 } },

  // ── Tier 4 ────────────────────────────────────────────────────────────────
  { id: 'ghost',           name: 'Ghost',                tier: 4, requires: [req('smarts', T4)], icon: icon('smarts', 10), description: 'Standing still for 3 s renders you undetectable to AI unless you attack.', passive: { ghostStandDuration: 3 } },
  { id: 'combat_medic',    name: 'Combat Medic',          tier: 4, requires: [req('smarts', T4)], icon: icon('smarts', 11), description: 'Can use healing items without breaking sprint or ADS.', passive: { healWhileMoving: 1 } },
  { id: 'resourceful',     name: 'Resourceful',           tier: 4, requires: [req('smarts', T4)], icon: icon('smarts', 12), description: 'Crafting costs reduced by 20 %.', passive: { craftCost: -0.20 } },

  // ── Tier 5 ────────────────────────────────────────────────────────────────
  { id: 'tactician',       name: 'Tactician',             tier: 5, requires: [req('smarts', T5)], icon: icon('smarts', 13), description: 'Radar range +50 %. Enemy pathing visible on radar for 10 s after detection.', passive: { radarRange: 0.50, enemyTrailDur: 10 } },
  { id: 'master_chemist',  name: 'Master Chemist',         tier: 5, requires: [req('smarts', T5)], icon: icon('smarts', 14), description: 'Craft medkits and ammo with 50 % fewer materials.', passive: { craftCostAdvanced: -0.50 } },
  { id: 'nexus_mind',      name: 'Nexus Mind',             tier: 5, requires: [req('smarts', T5)], icon: icon('smarts', 15), description: 'All cooldowns (abilities, second-wind, death-defy) reduced by 25 %.', passive: { globalCooldown: -0.25 } },
];

// ─── MAKER TRACK  (crafting, building, resource gathering) ────────────────────

export const MAKER_PERKS: Perk[] = [
  // ── Tier 1 ────────────────────────────────────────────────────────────────
  { id: 'pack_mule',       name: 'Pack Mule',          tier: 1, requires: [req('maker', T1)], icon: icon('maker', 1),  description: '+6 inventory slots.', passive: { inventorySlots: 6 } },
  { id: 'quick_hands',     name: 'Quick Hands',         tier: 1, requires: [req('maker', T1)], icon: icon('maker', 2),  description: 'Crafting speed +25 %.', passive: { craftSpeed: 0.25 } },
  { id: 'material_sense',  name: 'Material Sense',       tier: 1, requires: [req('maker', T1)], icon: icon('maker', 3),  description: 'Gather +20 % resources from nodes (wood/stone/metal).', passive: { gatherYield: 0.20 } },

  // ── Tier 2 ────────────────────────────────────────────────────────────────
  { id: 'field_repair',    name: 'Field Repair',        tier: 2, requires: [req('maker', T2)], icon: icon('maker', 4),  description: 'Repair weapons in the field using basic materials (no workbench needed).', passive: { fieldRepair: 1 } },
  { id: 'builder_sense',   name: 'Builder Sense',        tier: 2, requires: [req('maker', T2)], icon: icon('maker', 5),  description: 'Build placement time −40 % and structures cost 15 % fewer materials.', passive: { buildTime: -0.40, buildCost: -0.15 } },
  { id: 'recycler',        name: 'Recycler',             tier: 2, requires: [req('maker', T2)], icon: icon('maker', 6),  description: 'Scrapping items returns 40 % of materials (was 0 %).', passive: { scrapReturn: 0.40 } },

  // ── Tier 3 ────────────────────────────────────────────────────────────────
  { id: 'modder',          name: 'Modder',               tier: 3, requires: [req('maker', T3)], icon: icon('maker', 7),  description: 'Unlock weapon mod slots. Attach scopes, suppressors, extended mags.', passive: { weaponModSlots: 1 } },
  { id: 'mass_production', name: 'Mass Production',       tier: 3, requires: [req('maker', T3)], icon: icon('maker', 8),  description: 'Craft in batches of 3 for the cost of 2.', passive: { craftBatch: 3, craftBatchCost: 2 } },
  { id: 'structure_hp',    name: 'Reinforced Builds',     tier: 3, requires: [req('maker', T3)], icon: icon('maker', 9),  description: 'Player-built structures have +40 % HP.', passive: { structureHp: 0.40 } },

  // ── Tier 4 ────────────────────────────────────────────────────────────────
  { id: 'legendary_craft', name: 'Legendary Craft',       tier: 4, requires: [req('maker', T4)], icon: icon('maker', 10), description: '5 % chance crafted items become RARE quality (+15 % stats).', passive: { rareCraftChance: 0.05 } },
  { id: 'trapper',         name: 'Trapper',               tier: 4, requires: [req('maker', T4)], icon: icon('maker', 11), description: 'Craft and deploy bear traps + tripwire explosives.', passive: { trapAccess: 1 } },
  { id: 'supply_cache',    name: 'Supply Cache',           tier: 4, requires: [req('maker', T4)], icon: icon('maker', 12), description: 'Place a hidden 8-slot supply cache anywhere in the world (3 per zone).', passive: { cachesPerZone: 3 } },

  // ── Tier 5 ────────────────────────────────────────────────────────────────
  { id: 'master_builder',  name: 'Master Builder',         tier: 5, requires: [req('maker', T5)], icon: icon('maker', 13), description: 'Build advanced structures: turrets, powered gates, loot room.', passive: { advancedBuild: 1 } },
  { id: 'invention',       name: 'Invention',              tier: 5, requires: [req('maker', T5)], icon: icon('maker', 14), description: 'Random chance each day to discover a new crafting recipe.', passive: { dailyRecipeChance: 0.30 } },
  { id: 'nexus_forge',     name: 'Nexus Forge',            tier: 5, requires: [req('maker', T5)], icon: icon('maker', 15), description: 'Forge a Nexus-tier weapon once per playthrough (requires rare materials).', passive: { nexusForge: 1 } },
];

// ─── COMBO PERKS  (cross-stat unlocks — 3 + 5 / 5 + 5 / etc.) ────────────────
// These use icons 16-30 from each pack (the higher-tier "legendary" icons)

export const COMBO_PERKS: ComboUnlock[] = [
  // Warrior 3 + Hero 5 → Unstoppable Force
  {
    id: 'unstoppable',      name: 'Unstoppable Force',
    description: 'You can\'t be stunned or knocked back. Sprint through enemies without slowing.',
    icon: icon('warrior', 16),
    requireA: req('warrior', T1), requireB: req('hero', T2),
    passive: { stunImmune: 1, sprintThroughEnemies: 1 },
  },
  // Smarts 3 + Warrior 5 → Death From Above
  {
    id: 'death_from_above', name: 'Death From Above',
    description: 'Jump attacks deal ×2.5 damage and stagger all nearby enemies.',
    icon: icon('warrior', 17),
    requireA: req('smarts', T1), requireB: req('warrior', T2),
    passive: { jumpAtkMult: 2.5, jumpStaggerRadius: 4 },
  },
  // Maker 3 + Smarts 3 → Improvised Arsenal
  {
    id: 'improvised_arsenal', name: 'Improvised Arsenal',
    description: 'Craft improvised weapons (nailbat, pipe bomb) from junk using no workbench.',
    icon: icon('maker', 16),
    requireA: req('maker', T1), requireB: req('smarts', T1),
    passive: { improvisedWeapons: 1 },
  },
  // Hero 5 + Warrior 5 → Living Weapon
  {
    id: 'living_weapon',    name: 'Living Weapon',
    description: 'Your body IS a weapon. Unarmed damage increases by 200 % and never triggers fatigue.',
    icon: icon('hero', 16),
    requireA: req('hero', T2), requireB: req('warrior', T2),
    passive: { unarmedDmg: 2.0, unarmedFatigue: 0 },
  },
  // Smarts 5 + Maker 5 → Quartermaster
  {
    id: 'quartermaster',    name: 'Quartermaster',
    description: '+12 inventory slots. All consumables stack to 50 (was 10). Auto-sort on loot.',
    icon: icon('smarts', 16),
    requireA: req('smarts', T2), requireB: req('maker', T2),
    passive: { inventorySlots: 12, stackSize: 50 },
  },
  // Warrior 8 + Smarts 8 → Predator
  {
    id: 'predator',         name: 'Predator',
    description: 'Sprinting before attacking grants a 3-second predator window: +40 % dmg, silent movement.',
    icon: icon('warrior', 18),
    requireA: req('warrior', T3), requireB: req('smarts', T3),
    passive: { predatorWindow: 3, predatorDmg: 0.40 },
  },
  // Hero 8 + Maker 8 → Fortified
  {
    id: 'fortified',        name: 'Fortified',
    description: 'Natural armour (+10 DR). Built structures now also heal you when you stand near them.',
    icon: icon('hero', 17),
    requireA: req('hero', T3), requireB: req('maker', T3),
    passive: { naturalArmour: 10, structureHealRadius: 5 },
  },
  // All 4 tracks at 5 pts → Nexus Awakened
  {
    id: 'nexus_awakened',   name: 'Nexus Awakened',
    description: 'You have mastered all disciplines. Unlock the Grudge Nexus signature ability: Temporal Surge.',
    icon: icon('hero', 18),
    requireA: req('hero', T2),  requireB: req('warrior', T2),  // checks hero+warrior; engine also checks smarts+maker ≥5
    passive: { nexusAbility: 1 },
  },
];

// ─── All perks by track ───────────────────────────────────────────────────────

export const ALL_PERKS: Record<StatTrack, Perk[]> = {
  hero:    HERO_PERKS,
  warrior: WARRIOR_PERKS,
  smarts:  SMARTS_PERKS,
  maker:   MAKER_PERKS,
};

/** Return all perks unlockable for a given set of stat point totals. */
export function getUnlockedPerks(
  points: Record<StatTrack, number>,
): Perk[] {
  const unlocked: Perk[] = [];
  for (const track of Object.keys(ALL_PERKS) as StatTrack[]) {
    for (const perk of ALL_PERKS[track]) {
      if (perk.requires.every(r => (points[r.track] ?? 0) >= r.points)) {
        unlocked.push(perk);
      }
    }
  }
  return unlocked;
}

/** Return all combo perks unlockable for a given set of stat point totals. */
export function getUnlockedCombos(
  points: Record<StatTrack, number>,
  requireAllFour?: boolean,
): ComboUnlock[] {
  return COMBO_PERKS.filter(c => {
    const a = (points[c.requireA.track] ?? 0) >= c.requireA.points;
    const b = (points[c.requireB.track] ?? 0) >= c.requireB.points;
    if (c.id === 'nexus_awakened' && requireAllFour) {
      return a && b &&
        (points.smarts ?? 0) >= T2 &&
        (points.maker  ?? 0) >= T2;
    }
    return a && b;
  });
}

/** Sum all passive effects from an array of unlocked perks. */
export function sumPassives(perks: Array<Perk | ComboUnlock>): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const p of perks) {
    for (const [key, val] of Object.entries(p.passive)) {
      totals[key] = (totals[key] ?? 0) + val;
    }
  }
  return totals;
}
