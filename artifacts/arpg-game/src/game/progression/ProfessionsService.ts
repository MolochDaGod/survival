/**
 * ProfessionsService — runtime singleton for the SWG-style profession
 * system. Owns:
 *
 *   • per-profession XP balances
 *   • the set of learned skill ids
 *   • a tiny event emitter so React UIs can re-render when something changes
 *   • a derived `effects` cache (sum of every learned skill's passive)
 *
 * The engine code calls `gainXp` / `getEffect` directly. UI code uses
 * `subscribe` to pick up state changes.
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

type Listener = (state: Readonly<ProfessionState>) => void;

class ProfessionsServiceImpl {
  private state: ProfessionState = { xp: {}, learned: [] };
  private effects: ProfessionEffects = {};
  private listeners = new Set<Listener>();

  // ─── State accessors ─────────────────────────────────────────────────────

  getState(): Readonly<ProfessionState> {
    return this.state;
  }

  getXp(prof: Profession): number {
    return this.state.xp[prof] ?? 0;
  }

  isLearned(skillId: string): boolean {
    return this.state.learned.includes(skillId);
  }

  /**
   * Returns true if the player meets prereqs and has the XP cost in the
   * relevant profession; does NOT actually spend.
   */
  canLearn(skillId: string): boolean {
    const skill = getSkill(skillId);
    if (!skill) return false;
    if (this.isLearned(skillId)) return false;
    if (this.getXp(skill.prof) < skill.cost) return false;
    return skill.prereq.every(id => this.isLearned(id));
  }

  // ─── Mutators ────────────────────────────────────────────────────────────

  /** Add XP to a profession. Negative values are ignored. */
  gainXp(prof: Profession, amount: number): void {
    if (amount <= 0) return;
    if (!PROFESSIONS.includes(prof)) return;
    this.state = {
      ...this.state,
      xp: { ...this.state.xp, [prof]: (this.state.xp[prof] ?? 0) + Math.round(amount) },
    };
    this.emit();
  }

  /** Spend XP and add the skill to the learned set. Returns true on success. */
  learnSkill(skillId: string): boolean {
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
    this.emit();
    return true;
  }

  /** Replace the entire state. Used by SaveGameService on load. */
  hydrate(next: ProfessionState | null | undefined): void {
    if (!next || typeof next !== 'object') {
      this.state = { ...EMPTY_PROFESSION_STATE, xp: {}, learned: [] };
    } else {
      // Defensive copy — drop unknown skills + bad XP entries.
      const cleanLearned = (next.learned ?? []).filter(id => !!getSkill(id));
      const cleanXp: ProfessionState['xp'] = {};
      for (const p of PROFESSIONS) {
        const v = next.xp?.[p];
        if (typeof v === 'number' && v >= 0 && Number.isFinite(v)) cleanXp[p] = Math.round(v);
      }
      this.state = { xp: cleanXp, learned: Array.from(new Set(cleanLearned)) };
    }
    this.recomputeEffects();
    this.emit();
  }

  /** Clean snapshot for SaveGameService.serialize. */
  serialize(): ProfessionState {
    return {
      xp: { ...this.state.xp },
      learned: [...this.state.learned],
    };
  }

  /** Reset to a fresh state — used on character switch. */
  reset(): void {
    this.state = { xp: {}, learned: [] };
    this.effects = {};
    this.emit();
  }

  // ─── Effects (engine-facing) ─────────────────────────────────────────────

  /** Get the aggregated passive value for a single effect key. */
  getEffect(key: ProfessionEffectKey): number {
    return this.effects[key] ?? 0;
  }

  getAllEffects(): Readonly<ProfessionEffects> {
    return this.effects;
  }

  private recomputeEffects(): void {
    this.effects = aggregatePassives(this.state.learned);
  }

  // ─── Event emitter ───────────────────────────────────────────────────────

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }

  private emit(): void {
    for (const l of this.listeners) {
      try { l(this.state); } catch (err) { console.error('[professions] listener threw', err); }
    }
  }

  // ─── Convenience: branches grouped by profession (re-export for UI) ──────

  branchesFor(prof: Profession) {
    return PROFESSION_BRANCHES[prof];
  }
}

/** Singleton — there is only ever one player, one progression. */
export const ProfessionsService = new ProfessionsServiceImpl();
