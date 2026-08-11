/**
 * RecruitRequirements — the Four Requirements from info.html.
 *
 *   1. Successful dialog (caller handles SYN/KIN checks)
 *   2. Claim flag planted (CampClaimSystem)
 *   3. Campfire + storage crate in claim radius
 *   4. One personal tent per recruited member
 *
 * Without these, NPCs will not commit (or desert at dawn).
 */

import type { CampClaimSystem } from '../survival/camp/CampClaimSystem';
import type { TownshipState } from './TownshipSystem';

export interface RecruitGateResult {
  ok: boolean;
  missing: string[];
  /** Short HUD line. */
  message: string;
}

const CAMPFIRE_IDS = /campfire|orc_pot|cauldron|cooking|build_campfire/i;
const STORAGE_IDS = /barrel|crate|storage|orc_box|orc_barrel|build_storage/i;
const TENT_IDS = /tent|build_tent/i;

/**
 * Evaluate whether the camp infrastructure allows another recruit.
 */
export function evaluateRecruitGate(
  camp: CampClaimSystem | null | undefined,
  state: TownshipState,
  currentPopulation: number,
): RecruitGateResult {
  const missing: string[] = [];

  if (!camp || !camp.isClaimed()) {
    missing.push('Claim Flag (plant a banner)');
  }

  // Serialize snapshot-style introspection via public APIs
  const buffs = camp?.getBuffs?.({ x: 0, y: 0, z: 0 } as any);
  // Prefer serialize for structure counts if available
  const snap = camp?.serialize?.() ?? null;

  let hasFire = false;
  let hasStorage = false;
  let tentCount = 0;

  if (snap) {
    for (const b of snap.benches) {
      if (CAMPFIRE_IDS.test(b.itemId) || b.profession === 'chemistry') hasFire = true;
      if (STORAGE_IDS.test(b.itemId)) hasStorage = true;
    }
    for (const b of snap.buildings) {
      if (CAMPFIRE_IDS.test(b.itemId)) hasFire = true;
      if (STORAGE_IDS.test(b.itemId)) hasStorage = true;
      if (TENT_IDS.test(b.itemId)) tentCount++;
    }
  }

  // Soft fallback: if claimed, assume middle-camp bootstrap registered fire/storage
  if (camp?.isClaimed() && snap) {
    if (snap.benches.length > 0) hasFire = hasFire || snap.benches.some((b) => /campfire|chemistry/i.test(b.itemId + b.profession));
    if (snap.buildings.length > 0) {
      hasStorage = hasStorage || snap.buildings.some((b) => STORAGE_IDS.test(b.itemId));
      tentCount = Math.max(
        tentCount,
        snap.buildings.filter((b) => TENT_IDS.test(b.itemId)).length,
      );
    }
  }

  // Bootstrap middle camp registers campfire + barrel + tent — count those
  if (camp?.isClaimed() && !hasFire && (buffs?.benchCount ?? 0) > 0) hasFire = true;
  if (camp?.isClaimed() && !hasStorage && (buffs?.buildingCount ?? 0) > 0) hasStorage = true;

  if (!hasFire) missing.push('Campfire');
  if (!hasStorage) missing.push('Storage crate / barrel');

  // Need a free tent for the new member (population = current living count)
  // tentCount should be >= population + 1 for the new recruit
  // At pop 0, need 1 tent for first hire
  if (tentCount < currentPopulation + 1) {
    // Allow first recruit if at least one tent OR bootstrap claimed with buildings
    if (!(camp?.isClaimed() && currentPopulation === 0 && tentCount >= 0 && (buffs?.buildingCount ?? 0) > 0)) {
      if (tentCount < currentPopulation + 1) {
        missing.push(`Personal tent (${tentCount}/${currentPopulation + 1})`);
      }
    }
  }

  // Soften tent rule when camp is claimed with any buildings (early game bootstrap)
  if (
    missing.some((m) => m.startsWith('Personal tent')) &&
    camp?.isClaimed() &&
    (buffs?.buildingCount ?? 0) >= 1
  ) {
    const idx = missing.findIndex((m) => m.startsWith('Personal tent'));
    if (idx >= 0 && currentPopulation < 3) missing.splice(idx, 1);
  }

  if (!state || !canRecruitSafe(state)) {
    missing.push(`Recruit cap (${state.population}/${state.recruitCap})`);
  }

  if (missing.length === 0) {
    return { ok: true, missing: [], message: 'Ready to recruit.' };
  }

  return {
    ok: false,
    missing,
    message: `Need: ${missing.join(' · ')}`,
  };
}

function canRecruitSafe(state: TownshipState): boolean {
  return state.population < Math.max(1, state.recruitCap);
}

/**
 * Dialog stat check (SYN/KIN/NEU/ENT) — simplified d20 vs target.
 * Returns success and a flavor line.
 */
export function rollRecruitDialog(
  attrValue: number,
  difficulty: number,
): { success: boolean; roll: number; line: string } {
  const roll = Math.floor(Math.random() * 20) + 1 + Math.floor((attrValue - 10) / 2);
  const success = roll >= difficulty;
  return {
    success,
    roll,
    line: success
      ? `"Alright. You've got a fire and a flag. I'll take a tent."`
      : `"Not yet. Come back when you look like you can keep me alive." (need ${difficulty}, rolled ${roll})`,
  };
}
