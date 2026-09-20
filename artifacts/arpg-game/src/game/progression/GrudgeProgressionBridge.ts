/**
 * GrudgeProgressionBridge — SWG-*style* progression for **Grudges** content.
 *
 * This is NOT Star Wars Galaxies data. Pattern only:
 *   Profession XP → learn skills → unlock recipes / abilities / weapon passives
 *   Nexus attributes (BIO…GRA) → milestone passives → combat pools
 *   Diablo-style affixes on gear → Inventory.getTotalStats → getAttackDamage
 *
 * SSOT tables (Grudges):
 *   docs/inventory/professions.csv → Professions.ts
 *   docs/inventory/recipes.csv     → Recipes.ts (unlockedBySkill)
 *   docs/inventory/xp-sources.csv  → GameEngine / GameCanvas grant sites
 *   constants.ts WEAPONS / ABILITIES — Grudges hotbar + weapon kit
 *
 * Do not invent a parallel skill tree. Extend this bridge + the CSVs.
 */

import type { Profession } from './Professions';
import { getSkill } from './Professions';
import { ProfessionsService } from './ProfessionsService';
import type { WeaponType } from '../types';

/** Grudges hotbar ability id → profession skill that unlocks it. */
export const ABILITY_UNLOCK_BY_PROFESSION_SKILL: Record<string, string> = {
  // Combat tree — blades / hammers
  whirlwind: 'combat.blades.1',
  shield_bash: 'combat.hammers.1',
  berserker_rage: 'combat.blades.4',
  // Chemistry / Quantum flavor — potions & anomalies unlock caster kit
  fireball: 'chemistry.goos.2',
  lightning_strike: 'chemistry.demo.2',
  ice_spike: 'gathering.permafrost.2',
};

/**
 * Which Grudges weapon types feed which profession on kill
 * (xp-sources.csv combat rows + signature rule).
 */
export const WEAPON_TYPE_TO_COMBAT_BRANCH: Partial<Record<WeaponType, string>> = {
  pistol: 'pistol',
  rifle: 'rifle',
  smg: 'rifle',
  shotgun: 'rifle',
  gun: 'rifle',
  bow: 'rifle',
  crossbow: 'rifle',
  sword: 'blades',
  greatsword: 'blades',
  sword_shield: 'blades',
  dagger: 'blades',
  knife: 'blades',
  scythe: 'blades',
  spear: 'blades',
  javelin: 'blades',
  axe: 'hammers',
  hatchet: 'hammers',
  greataxe: 'hammers',
  hammer: 'hammers',
  mace: 'hammers',
};

/** Craft XP routing — Grudges recipe id prefixes → profession (xp-sources.csv). */
export function professionXpForCraft(recipeId: string): { prof: Profession; amount: number } {
  if (recipeId.startsWith('build_')) return { prof: 'township', amount: 12 };
  if (
    recipeId.startsWith('cook_') ||
    recipeId.startsWith('brew_') ||
    recipeId === 'fillet_fish' ||
    recipeId === 'open_can' ||
    recipeId === 'boil_water' ||
    recipeId === 'craft_bandage'
  ) {
    return { prof: 'chemistry', amount: 10 };
  }
  return { prof: 'crafting', amount: 10 };
}

/** True if the player has unlocked a Grudges hotbar ability via profession. */
export function isAbilityUnlockedByProfession(abilityId: string): boolean {
  const skillId = ABILITY_UNLOCK_BY_PROFESSION_SKILL[abilityId];
  if (!skillId) return true; // unmapped abilities keep their constants.ts default
  return ProfessionsService.isLearned(skillId);
}

/**
 * Sync AbilitySystem unlock flags from current profession state.
 * Call after hydrate / learnSkill / character bind.
 */
export function syncAbilitiesFromProfessions(
  unlockAbility: (abilityId: string) => void,
  setLocked?: (abilityId: string, unlocked: boolean) => void,
): void {
  for (const [abilityId, skillId] of Object.entries(ABILITY_UNLOCK_BY_PROFESSION_SKILL)) {
    const ok = ProfessionsService.isLearned(skillId);
    if (ok) unlockAbility(abilityId);
    else setLocked?.(abilityId, false);
  }
}

/** Human-readable unlock hint for UI (Grudges skill name). */
export function abilityUnlockHint(abilityId: string): string | null {
  const skillId = ABILITY_UNLOCK_BY_PROFESSION_SKILL[abilityId];
  if (!skillId) return null;
  const skill = getSkill(skillId);
  if (!skill) return `Requires profession skill ${skillId}`;
  if (ProfessionsService.isLearned(skillId)) return null;
  return `Unlock via ${skill.prof} → ${skill.name} (${skillId})`;
}

export const PROGRESSION_PILLARS = {
  style: 'swg-style',
  note:
    'Profession XP trees + recipe/ability gates. Content is Grudges (factions, Nexus stats, Diablo loot) — not SWG IP.',
  pillars: [
    { id: 'professions', owns: 'XP, skill unlocks, passives, recipe grants', ssot: 'Professions.ts / professions.csv' },
    { id: 'crafting', owns: 'Recipes gated by unlockedBySkill', ssot: 'Recipes.ts / recipes.csv' },
    { id: 'weapons', owns: 'WEAPONS kit + Diablo affixes + profession damage passives', ssot: 'constants.ts + loot.ts + combatMods' },
    { id: 'abilities', owns: 'Hotbar ABILITIES unlocked by combat/chemistry skills', ssot: 'GrudgeProgressionBridge + AbilitySystem' },
    { id: 'attributes', owns: 'BIO…GRA milestones + weapon XP / free points', ssot: 'game-systems perks + StatProgressionService' },
  ],
} as const;
