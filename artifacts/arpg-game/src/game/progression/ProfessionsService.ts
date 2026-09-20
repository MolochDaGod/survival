/**
 * ProfessionsService — runtime singleton for the SWG-style profession
 * system. Owns:
 *
 *   • per-profession XP balances (spendable)
 *   • the set of learned skill ids
 *   • a tiny event emitter so React UIs can re-render when something changes
 *   • a derived `effects` cache (sum of every learned skill's passive)
 *   • per-character localStorage persistence (same pattern as StatProgressionService)
 *
 * The engine code calls `gainXp` / `getEffect` directly. UI code uses
 * `subscribe` to pick up state changes.
 *
 * Persistence rules (do not regress):
 *   - Every gainXp / learnSkill writes localStorage immediately.
 *   - hydrate() MERGES cloud/save into local (max XP, union learned).
 *   - Character switch calls reset() so the next ensureLoaded() binds the
 *     active character's suffix key.
 */

import {
  PROFESSIONS,
  PROFESSION_BRANCHES,
  aggregatePassives,
  getSkill,
  EMPTY_PROFESSION_STATE,
  type Profession,
  type ProfessionEffectKey,
  type ProfessionEffects,
  type ProfessionState,
} from './Professions';
import type { WeaponType } from '../types';
import { activeSuffix } from '../activeCharacter';

/**
 * Combat-profession branch matching each WeaponType. A weapon can map to
 * MORE than one branch (e.g. dagger fits both Blades and Theft) — the
 * signature check below returns true if ANY of the candidate branches
 * has at least one learned skill.
 */
const COMBAT_BRANCHES_BY_WEAPON: Partial<Record<WeaponType, string[]>> = {
  pistol: ['pistol'],
  rifle: ['rifle'],
  smg: ['rifle'],
  shotgun: ['rifle'],
  bow: ['rifle'],
  crossbow: ['rifle'],
  gun: ['rifle'],   // legacy generic gun → rifle bucket
  sword: ['blades'],
  greatsword: ['blades'],
  sword_shield: ['blades'],
  scythe: ['blades'],
  spear: ['blades'],
  javelin: ['blades'],
  dagger: ['blades', 'theft'],
  knife: ['blades', 'theft'],
  axe: ['hammers'],
  hatchet: ['hammers'],
  greataxe: ['hammers'],
  hammer: ['hammers'],
  mace: ['hammers'],
};

const STORAGE_KEY = 'grudge_nexus_professions';

type Listener = (state: Readonly<ProfessionState>) => void;

function emptyState(): ProfessionState {
  return { xp: {}, learned: [] };
}

function cleanState(next: ProfessionState | null | undefined): ProfessionState {
  if (!next || typeof next !== 'object') return emptyState();
  const cleanLearned = (next.learned ?? []).filter((id) => !!getSkill(id));
  const cleanXp: ProfessionState['xp'] = {};
  for (const p of PROFESSIONS) {
    const v = next.xp?.[p];
    if (typeof v === 'number' && Number.isFinite(v)) {
      // Spendable balance can be 0 after learning; never store negatives.
      cleanXp[p] = Math.max(0, Math.round(v));
    }
  }
  return { xp: cleanXp, learned: Array.from(new Set(cleanLearned)) };
}

/** Lifetime XP for one profession = spendable balance + costs of learned skills. */
function earnedXpFor(state: ProfessionState, prof: Profession): number {
  let spent = 0;
  for (const id of state.learned) {
    const s = getSkill(id);
    if (s && s.prof === prof) spent += s.cost;
  }
  return (state.xp[prof] ?? 0) + spent;
}

/**
 * Merge two profession states without regressing progress.
 *
 * Learned = union of valid skill ids.
 * Spendable XP = max(lifetime earned) − cost of the union learned set.
 * (Merging raw spendable balances would double-count after a skill learn.)
 */
export function mergeProfessionState(
  a: ProfessionState | null | undefined,
  b: ProfessionState | null | undefined,
): ProfessionState {
  const left = cleanState(a);
  const right = cleanState(b);
  const learned = Array.from(new Set([...left.learned, ...right.learned]));
  const xp: ProfessionState['xp'] = {};
  for (const p of PROFESSIONS) {
    const earned = Math.max(earnedXpFor(left, p), earnedXpFor(right, p));
    let spent = 0;
    for (const id of learned) {
      const s = getSkill(id);
      if (s && s.prof === p) spent += s.cost;
    }
    const spendable = Math.max(0, earned - spent);
    if (spendable > 0 || spent > 0) xp[p] = spendable;
  }
  return { xp, learned };
}

class ProfessionsServiceImpl {
  private state: ProfessionState = emptyState();
  private effects: ProfessionEffects = {};
  private listeners = new Set<Listener>();
  private loadedKey: string | null = null;

  // ─── Storage ─────────────────────────────────────────────────────────────

  private storageKey(): string {
    return `${STORAGE_KEY}${activeSuffix()}`;
  }

  /** Bind/load the active character's professions blob. Safe to call often. */
  ensureLoaded(): void {
    const key = this.storageKey();
    if (this.loadedKey === key) return;
    this.loadedKey = key;
    try {
      const raw = localStorage.getItem(key);
      if (!raw) {
        this.state = emptyState();
        this.effects = {};
        return;
      }
      const parsed = JSON.parse(raw) as ProfessionState;
      this.state = cleanState(parsed);
      this.recomputeEffects();
    } catch {
      this.state = emptyState();
      this.effects = {};
    }
  }

  private persist(): void {
    this.ensureLoaded();
    try {
      localStorage.setItem(this.storageKey(), JSON.stringify(this.state));
    } catch {
      /* quota */
    }
  }

  // ─── State accessors ─────────────────────────────────────────────────────

  getState(): Readonly<ProfessionState> {
    this.ensureLoaded();
    return this.state;
  }

  getXp(prof: Profession): number {
    this.ensureLoaded();
    return this.state.xp[prof] ?? 0;
  }

  /** Lifetime XP earned for a profession = spendable + cost of learned skills. */
  getEarnedXp(prof: Profession): number {
    this.ensureLoaded();
    let spent = 0;
    for (const id of this.state.learned) {
      const s = getSkill(id);
      if (s && s.prof === prof) spent += s.cost;
    }
    return (this.state.xp[prof] ?? 0) + spent;
  }

  isLearned(skillId: string): boolean {
    this.ensureLoaded();
    return this.state.learned.includes(skillId);
  }

  /**
   * Returns true if the player meets prereqs and has the XP cost in the
   * relevant profession; does NOT actually spend.
   */
  canLearn(skillId: string): boolean {
    this.ensureLoaded();
    const skill = getSkill(skillId);
    if (!skill) return false;
    if (this.isLearned(skillId)) return false;
    if (this.getXp(skill.prof) < skill.cost) return false;
    return skill.prereq.every((id) => this.isLearned(id));
  }

  // ─── Mutators ────────────────────────────────────────────────────────────

  /** Add XP to a profession. Negative values are ignored. Persists immediately. */
  gainXp(prof: Profession, amount: number): void {
    if (amount <= 0) return;
    if (!PROFESSIONS.includes(prof)) return;
    this.ensureLoaded();
    this.state = {
      ...this.state,
      xp: { ...this.state.xp, [prof]: (this.state.xp[prof] ?? 0) + Math.round(amount) },
    };
    this.persist();
    this.emit();
  }

  /** Spend XP and add the skill to the learned set. Returns true on success. */
  learnSkill(skillId: string): boolean {
    this.ensureLoaded();
    const skill = getSkill(skillId);
    if (!skill) return false;
    if (!this.canLearn(skillId)) return false;

    const newXp = { ...this.state.xp };
    newXp[skill.prof] = (newXp[skill.prof] ?? 0) - skill.cost;

    this.state = {
      xp: newXp,
      learned: [...this.state.learned, skillId],
    };
    this.recomputeEffects();
    this.persist();
    this.emit();
    return true;
  }

  /**
   * Merge an external snapshot (cloud save / SaveGameService) into local
   * state. Never reduces XP or unlearns skills. Used by GameEngine onLoaded.
   */
  hydrate(next: ProfessionState | null | undefined): void {
    this.ensureLoaded();
    const merged = mergeProfessionState(this.state, next);
    this.state = merged;
    this.recomputeEffects();
    this.persist();
    this.emit();
  }

  /** Clean snapshot for SaveGameService.serialize. */
  serialize(): ProfessionState {
    this.ensureLoaded();
    return {
      xp: { ...this.state.xp },
      learned: [...this.state.learned],
    };
  }

  /**
   * Character switch / new game — drop the in-memory cache so the next
   * ensureLoaded() reads the active character's storage key.
   */
  reset(): void {
    this.loadedKey = null;
    this.state = emptyState();
    this.effects = {};
    this.ensureLoaded();
    this.emit();
  }

  // ─── Effects (engine-facing) ─────────────────────────────────────────────

  /** Get the aggregated passive value for a single effect key. */
  getEffect(key: ProfessionEffectKey): number {
    this.ensureLoaded();
    return this.effects[key] ?? 0;
  }

  getAllEffects(): Readonly<ProfessionEffects> {
    this.ensureLoaded();
    return this.effects;
  }

  private recomputeEffects(): void {
    this.effects = aggregatePassives(this.state.learned);
  }

  // ─── Event emitter ───────────────────────────────────────────────────────

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private emit(): void {
    for (const l of this.listeners) {
      try {
        l(this.state);
      } catch (err) {
        console.error('[professions] listener threw', err);
      }
    }
  }

  // ─── Convenience: branches grouped by profession (re-export for UI) ──────

  branchesFor(prof: Profession) {
    return PROFESSION_BRANCHES[prof];
  }

  // ─── Signature-weapon check (Combat XP bonus gate) ───────────────────────

  /**
   * Returns true if `type` is a signature weapon for any Combat branch the
   * player has trained in (≥1 learned skill in that branch). Used by the
   * runtime to grant the spec's +25% Combat XP bonus.
   */
  isSignatureCombatWeapon(type: WeaponType): boolean {
    this.ensureLoaded();
    const candidates = COMBAT_BRANCHES_BY_WEAPON[type];
    if (!candidates || candidates.length === 0) return false;
    for (const id of this.state.learned) {
      const s = getSkill(id);
      if (!s || s.prof !== 'combat') continue;
      if (candidates.includes(s.branch)) return true;
    }
    return false;
  }

  /**
   * Hunting signature weapons (CSV SIGNATURE WEAPON RULE): bow / crossbow
   * for Animals+Tracking; grant +25% Hunting XP when wielded.
   */
  isSignatureHuntingWeapon(type: WeaponType): boolean {
    this.ensureLoaded();
    if (type !== 'bow' && type !== 'crossbow') return false;
    for (const id of this.state.learned) {
      const s = getSkill(id);
      if (!s || s.prof !== 'hunting') continue;
      if (s.branch === 'animals' || s.branch === 'tracking' || s.branch === 'master') {
        return true;
      }
    }
    return false;
  }

  /** Recipe ids granted by every learned profession skill. */
  getGrantedRecipes(): Set<string> {
    this.ensureLoaded();
    const out = new Set<string>();
    for (const id of this.state.learned) {
      const s = getSkill(id);
      if (!s) continue;
      for (const rid of s.recipes) {
        if (rid && !rid.startsWith('hire_')) out.add(rid);
      }
    }
    return out;
  }

  /**
   * SWG craft gate — `(default)` / empty always open; otherwise require the
   * named skill OR any learned skill that lists this recipe id.
   */
  isRecipeUnlocked(recipeId: string, unlockedBySkill?: string): boolean {
    this.ensureLoaded();
    if (!unlockedBySkill || unlockedBySkill === '(default)' || unlockedBySkill === '—') {
      return true;
    }
    if (this.isLearned(unlockedBySkill)) return true;
    return this.getGrantedRecipes().has(recipeId);
  }
}

/** Singleton — there is only ever one player, one progression. */
export const ProfessionsService = new ProfessionsServiceImpl();
