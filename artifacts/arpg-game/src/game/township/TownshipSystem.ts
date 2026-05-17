/**
 * TownshipSystem — runtime settlement progression manager.
 *
 * Tracks the player's camp state from lone bedroll to walled stronghold.
 * Reads Township profession passives from ProfessionsService to determine:
 *   - Recruit cap (how many NPCs can live in the camp)
 *   - Available NPC roles (which hire types are unlocked)
 *   - Building permissions (which structures can be placed)
 *   - Settlement tier (Camp → Tribe → Village → Town → Stronghold)
 *   - Morale modifier (affects NPC combat damage + harvest yield)
 *
 * The tier auto-promotes/demotes based on current population. Losing
 * NPCs (death, desertion after a raid loss) can drop your tier.
 *
 * Designed to be read by:
 *   - CitySpawner (recruit cap check before allowing recruitNearest)
 *   - FollowBrain (morale modifier on NPC combat stats)
 *   - ModularBuilding (building cost reduction + recipe availability)
 *   - GameCanvas UI (tier badge, population count, morale bar)
 */

import { ProfessionsService } from '../progression/ProfessionsService';

// ── Settlement Tiers ────────────────────────────────────────────────────────

export type SettlementTier = 'camp' | 'tribe' | 'village' | 'town' | 'stronghold';

export interface TierDef {
  id: SettlementTier;
  label: string;
  minPopulation: number;
  /** Township XP granted on first reaching this tier. */
  xpReward: number;
  description: string;
}

export const SETTLEMENT_TIERS: TierDef[] = [
  { id: 'camp',       label: 'Lone Camp',   minPopulation: 0,  xpReward: 0,   description: 'A claim flag and a tent. You gather alone.' },
  { id: 'tribe',      label: 'Tribe',       minPopulation: 5,  xpReward: 50,  description: 'Shared cooking pot, morale aura. +10% hire combat damage.' },
  { id: 'village',    label: 'Village',      minPopulation: 10, xpReward: 80,  description: 'Trade post payouts, tier-2 schematics, embassy.' },
  { id: 'town',       label: 'Town',         minPopulation: 20, xpReward: 120, description: 'Bazaar slots, tier-3 schematics, town banner. Reputation broadcasts.' },
  { id: 'stronghold', label: 'Stronghold',   minPopulation: 30, xpReward: 200, description: 'Fortress keep, heavy turrets, captain + squad. Lord\'s Hall authority.' },
];

export function getTierForPopulation(pop: number): TierDef {
  let best = SETTLEMENT_TIERS[0];
  for (const t of SETTLEMENT_TIERS) {
    if (pop >= t.minPopulation) best = t;
  }
  return best;
}

// ── NPC Roles ───────────────────────────────────────────────────────────────

export type NPCRole =
  | 'woodcutter' | 'miner' | 'farmer' | 'forager' | 'trapper'   // Harvesters
  | 'stall' | 'caravan_master' | 'fence' | 'bazaar_merchant'     // Vendors
  | 'sentry' | 'gate_guard' | 'gunner' | 'captain' | 'mercenary' // Fighters
  | 'diplomat';                                                    // Diplomacy

export interface NPCRoleDef {
  id: NPCRole;
  label: string;
  family: 'harvester' | 'vendor' | 'fighter' | 'diplomacy';
  /** Township skill ID that unlocks this role. */
  unlockSkill: string;
  /** HP at spawn. */
  hp: number;
  /** Whether this NPC counts against recruit cap (false = uses follower slots). */
  usesRecruitCap: boolean;
  description: string;
}

export const NPC_ROLES: NPCRoleDef[] = [
  // Harvesters
  { id: 'woodcutter',      label: 'Woodcutter',      family: 'harvester',  unlockSkill: 'township.buildings.2', hp: 60,  usesRecruitCap: true,  description: 'Chops trees within 80m. +5 wood/day.' },
  { id: 'miner',           label: 'Miner',           family: 'harvester',  unlockSkill: 'township.buildings.3', hp: 60,  usesRecruitCap: true,  description: 'Mines ore veins. +5 iron/day.' },
  { id: 'farmer',          label: 'Farmer',          family: 'harvester',  unlockSkill: 'township.buildings.4', hp: 60,  usesRecruitCap: true,  description: 'Tends fields. +5 herb/day.' },
  { id: 'forager',         label: 'Forager',         family: 'harvester',  unlockSkill: 'gathering.forestry.2', hp: 60,  usesRecruitCap: true,  description: 'Collects berries and mushrooms.' },
  { id: 'trapper',         label: 'Trapper',         family: 'harvester',  unlockSkill: 'hunting.trapping.3',   hp: 80,  usesRecruitCap: true,  description: 'Resets snares, gathers carcasses.' },
  // Vendors
  { id: 'stall',           label: 'Stall Vendor',    family: 'vendor',     unlockSkill: 'township.trade.1',     hp: 40,  usesRecruitCap: true,  description: 'Mans market stall. Auto-sells junk.' },
  { id: 'caravan_master',  label: 'Caravan Master',  family: 'vendor',     unlockSkill: 'township.trade.2',     hp: 80,  usesRecruitCap: true,  description: 'Drives caravan. Passive gold income.' },
  { id: 'fence',           label: 'Fence',           family: 'vendor',     unlockSkill: 'township.trade.3',     hp: 60,  usesRecruitCap: true,  description: 'Buys stolen goods at +50%.' },
  { id: 'bazaar_merchant', label: 'Bazaar Merchant', family: 'vendor',     unlockSkill: 'township.trade.4',     hp: 80,  usesRecruitCap: true,  description: 'Rotating rare goods. 3 slots per bazaar.' },
  // Fighters
  { id: 'sentry',          label: 'Sentry',          family: 'fighter',    unlockSkill: 'township.defenses.1',  hp: 120, usesRecruitCap: true,  description: 'Mans watchtower. Ranged crossbow.' },
  { id: 'gate_guard',      label: 'Gate Guard',      family: 'fighter',    unlockSkill: 'township.defenses.2',  hp: 200, usesRecruitCap: true,  description: 'Patrols gates. Melee. Hired in pairs.' },
  { id: 'gunner',          label: 'Turret Gunner',   family: 'fighter',    unlockSkill: 'township.defenses.3',  hp: 150, usesRecruitCap: true,  description: '+30% turret accuracy, +20% fire rate.' },
  { id: 'captain',         label: 'Captain',         family: 'fighter',    unlockSkill: 'township.defenses.4',  hp: 300, usesRecruitCap: true,  description: 'Elite companion + 3-NPC squad.' },
  { id: 'mercenary',       label: 'Mercenary',       family: 'fighter',    unlockSkill: 'township.leadership.2',hp: 250, usesRecruitCap: false, description: 'Party follower. Uses Follower slots.' },
  // Diplomacy
  { id: 'diplomat',        label: 'Diplomat Envoy',  family: 'diplomacy',  unlockSkill: 'township.diplomacy.3', hp: 60,  usesRecruitCap: true,  description: 'Mans embassy. +1 faction rep/day.' },
];

export function getRoleDef(role: NPCRole): NPCRoleDef | undefined {
  return NPC_ROLES.find(r => r.id === role);
}

// ── Township State ──────────────────────────────────────────────────────────

export interface TownshipState {
  /** Current number of NPCs living in the settlement. */
  population: number;
  /** Current settlement tier (derived from population). */
  tier: SettlementTier;
  /** Morale percentage (0-100). Affects NPC performance. */
  morale: number;
  /** Gold earned passively per day. */
  passiveGoldPerDay: number;
  /** Maximum NPCs allowed (from Leadership skills). */
  recruitCap: number;
  /** Maximum party followers (from Leadership skills). */
  followerCap: number;
  /** Roles currently unlocked. */
  unlockedRoles: NPCRole[];
  /** Building cost reduction percentage. */
  buildCostReduction: number;
  /** Wall HP bonus percentage. */
  wallHpBonus: number;
  /** Building HP bonus percentage. */
  buildingHpBonus: number;
  /** Turret damage bonus percentage. */
  turretDamageBonus: number;
}

/**
 * Compute the current township state from profession passives.
 * Call this whenever profession skills change or NPCs are added/removed.
 */
export function computeTownshipState(currentPopulation: number): TownshipState {
  const svc = ProfessionsService;

  // Read passives from the Township profession tree
  const recruitCapBonus = svc.getEffect('recruitCapBonus');
  const followerSlots = svc.getEffect('followerSlots');
  const campMoraleBonus = svc.getEffect('campMoraleBonus');
  const buildCostReduction = svc.getEffect('buildCostReduction');
  const craftCostReduction = svc.getEffect('craftCostReduction');
  const sellGoldBonus = svc.getEffect('sellGoldBonus');
  const passiveGoldRate = svc.getEffect('passiveGoldRate');
  const wallHpBonus = svc.getEffect('wallHpBonus');
  const buildingHpBonus = svc.getEffect('buildingHpBonus');
  const turretDamageBonus = svc.getEffect('turretDamageBonus');

  // Base recruit cap is 1 (just the player), skills add more
  const recruitCap = 1 + Math.floor(recruitCapBonus);
  const followerCap = Math.floor(followerSlots);

  // Morale: base 50%, bonuses from skills
  const morale = Math.min(100, 50 + campMoraleBonus * 100);

  // Determine which NPC roles are unlocked
  const unlockedRoles: NPCRole[] = [];
  for (const role of NPC_ROLES) {
    if (svc.isLearned(role.unlockSkill)) {
      unlockedRoles.push(role.id);
    }
  }

  // Tier from population
  const tierDef = getTierForPopulation(currentPopulation);

  return {
    population: currentPopulation,
    tier: tierDef.id,
    morale,
    passiveGoldPerDay: passiveGoldRate,
    recruitCap,
    followerCap,
    unlockedRoles,
    buildCostReduction,
    wallHpBonus,
    buildingHpBonus,
    turretDamageBonus,
  };
}

/**
 * Check if the player can recruit one more NPC (within cap).
 */
export function canRecruit(state: TownshipState): boolean {
  return state.population < state.recruitCap;
}

/**
 * Check if a specific NPC role is unlocked.
 */
export function isRoleUnlocked(state: TownshipState, role: NPCRole): boolean {
  return state.unlockedRoles.includes(role);
}

/**
 * Get the morale damage multiplier for allied NPCs.
 * Morale 70+ = no penalty. Below 70 = linear penalty down to 0.5× at 0 morale.
 */
export function getMoraleDamageMultiplier(morale: number): number {
  if (morale >= 70) return 1.0;
  return 0.5 + (morale / 70) * 0.5;
}

/**
 * Get the morale harvest yield multiplier.
 * Morale 80+ = +20% bonus. Below 50 = -20% penalty.
 */
export function getMoraleHarvestMultiplier(morale: number): number {
  if (morale >= 80) return 1.2;
  if (morale >= 50) return 1.0;
  return 0.8;
}
