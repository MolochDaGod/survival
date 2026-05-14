/**
 * StatProgressionService — runtime singleton that owns post-creation growth
 * for the 8 Grudge Stats (BIO/NEU/KIN/QNT/SYN/CHR/ENT/GRA).
 *
 * Two income streams:
 *   • Free Points  — +1 per character level (so total free = current level).
 *                    The player spends these on any stat from the MainPanel.
 *   • Weapon XP    — earned passively from combat (kills, damage). The player
 *                    routes 100 XP at a time at any of the 8 stats via the
 *                    MainPanel dropdown. 100 weapon XP = 1 banked stat point.
 *
 * Both income streams ultimately feed each stat's `statBank`. When a stat's
 * bank reaches `costForNext(effectiveValue)` points, the stat auto-promotes
 * by 1 pip (capped at STAT_MAX). The cost curve from CharacterConfig is
 * preserved exactly.
 *
 * Persistence: scoped per active character via the `activeSuffix()` helper,
 * so multi-character saves do not collide.
 */

import {
  costForNext,
  STAT_MAX,
  type GrudgeStats,
} from '../CharacterConfig';
import { activeSuffix } from '../activeCharacter';

const STORAGE_KEY = 'grudge_nexus_stat_progression';
const WEAPON_XP_PER_POINT = 100;

const STAT_KEYS: (keyof GrudgeStats)[] = [
  'bio', 'neu', 'kin', 'qnt', 'syn', 'chr', 'ent', 'gra',
];

function emptyStatRecord(): Record<keyof GrudgeStats, number> {
  return { bio: 0, neu: 0, kin: 0, qnt: 0, syn: 0, chr: 0, ent: 0, gra: 0 };
}

export interface StatProgression {
  /** Pips earned post-creation per stat (added to the saved creation values). */
  bonusStats: Record<keyof GrudgeStats, number>;
  /** Banked stat points awaiting a pip promotion (per stat). */
  statBank:   Record<keyof GrudgeStats, number>;
  /** Free points earned from level-ups, not yet allocated to any stat. */
  freePoints: number;
  /** Highest character level that has already granted its free point. */
  freePointsUpToLevel: number;
  /** Unallocated weapon-XP pool, drawn down by the dropdown allocator. */
  weaponXp: number;
}

function emptyState(): StatProgression {
  return {
    bonusStats: emptyStatRecord(),
    statBank:   emptyStatRecord(),
    freePoints: 0,
    freePointsUpToLevel: 0,
    weaponXp: 0,
  };
}

type Listener = (state: Readonly<StatProgression>) => void;

class StatProgressionServiceImpl {
  private state: StatProgression = emptyState();
  private loadedKey: string | null = null;
  private listeners = new Set<Listener>();

  // ─── Storage ──────────────────────────────────────────────────────────────
  private storageKey(): string { return `${STORAGE_KEY}${activeSuffix()}`; }

  private ensureLoaded(): void {
    const key = this.storageKey();
    if (this.loadedKey === key) return;
    this.loadedKey = key;
    try {
      const raw = localStorage.getItem(key);
      if (!raw) { this.state = emptyState(); return; }
      const parsed = JSON.parse(raw) as Partial<StatProgression>;
      this.state = {
        bonusStats: { ...emptyStatRecord(), ...(parsed.bonusStats ?? {}) },
        statBank:   { ...emptyStatRecord(), ...(parsed.statBank   ?? {}) },
        freePoints: parsed.freePoints ?? 0,
        freePointsUpToLevel: parsed.freePointsUpToLevel ?? 0,
        weaponXp:   parsed.weaponXp ?? 0,
      };
    } catch {
      this.state = emptyState();
    }
  }

  private persist(): void {
    try {
      localStorage.setItem(this.storageKey(), JSON.stringify(this.state));
    } catch { /* quota */ }
  }

  /** Force a re-read on character switch. Call from CharacterSelect flow. */
  reset(): void {
    this.loadedKey = null;
    this.ensureLoaded();
    this.emit();
  }

  // ─── Accessors ────────────────────────────────────────────────────────────
  getState(): Readonly<StatProgression> {
    this.ensureLoaded();
    return this.state;
  }

  /** Effective stat value = saved creation value + earned bonus pips. */
  effective(creation: GrudgeStats, key: keyof GrudgeStats): number {
    this.ensureLoaded();
    return Math.min(STAT_MAX, creation[key] + (this.state.bonusStats[key] ?? 0));
  }

  /** Cost in stat points to advance the next pip on a given stat (0 if maxed). */
  costFor(creation: GrudgeStats, key: keyof GrudgeStats): number {
    const eff = this.effective(creation, key);
    if (eff >= STAT_MAX) return 0;
    return costForNext(eff);
  }

  // ─── Income ───────────────────────────────────────────────────────────────

  /**
   * Called by PlayerController on every level-up (and once on first read at
   * level 1). Grants `(level - freePointsUpToLevel)` free points so the pool
   * always equals the character's current level.
   */
  notifyLevel(level: number): void {
    this.ensureLoaded();
    if (level <= this.state.freePointsUpToLevel) return;
    const grant = level - this.state.freePointsUpToLevel;
    this.state.freePoints += grant;
    this.state.freePointsUpToLevel = level;
    this.persist();
    this.emit();
  }

  /** Add unallocated weapon XP. Called from combat / kill hooks. */
  addWeaponXp(amount: number): void {
    if (!Number.isFinite(amount) || amount <= 0) return;
    this.ensureLoaded();
    this.state.weaponXp += amount;
    this.persist();
    this.emit();
  }

  // ─── Spending ─────────────────────────────────────────────────────────────

  /** Spend 1 free point as 1 banked stat point on `key`. Auto-promotes pip. */
  spendFreePointOn(creation: GrudgeStats, key: keyof GrudgeStats): boolean {
    this.ensureLoaded();
    if (this.state.freePoints < 1) return false;
    if (this.effective(creation, key) >= STAT_MAX) return false;
    this.state.freePoints -= 1;
    this.state.statBank[key] += 1;
    this.tryPromote(creation, key);
    this.persist();
    this.emit();
    return true;
  }

  /**
   * Burn 100 weapon XP → +1 banked stat point on `key`. Auto-promotes pip.
   * Returns false if the player does not have enough weapon XP or the stat
   * is already maxed.
   */
  applyWeaponXpToStat(creation: GrudgeStats, key: keyof GrudgeStats): boolean {
    this.ensureLoaded();
    if (this.state.weaponXp < WEAPON_XP_PER_POINT) return false;
    if (this.effective(creation, key) >= STAT_MAX) return false;
    this.state.weaponXp -= WEAPON_XP_PER_POINT;
    this.state.statBank[key] += 1;
    this.tryPromote(creation, key);
    this.persist();
    this.emit();
    return true;
  }

  /** Apply as many 100-XP chunks to `key` as the pool/cap allows. */
  applyAllWeaponXpToStat(creation: GrudgeStats, key: keyof GrudgeStats): number {
    this.ensureLoaded();
    let applied = 0;
    while (this.applyWeaponXpToStat(creation, key)) applied++;
    return applied;
  }

  /** Promote a banked stat into pips while it has the cost covered. */
  private tryPromote(creation: GrudgeStats, key: keyof GrudgeStats): void {
    while (true) {
      const eff = this.effective(creation, key);
      if (eff >= STAT_MAX) break;
      const cost = costForNext(eff);
      if (this.state.statBank[key] < cost) break;
      this.state.statBank[key] -= cost;
      this.state.bonusStats[key] = (this.state.bonusStats[key] ?? 0) + 1;
    }
  }

  // ─── Events ───────────────────────────────────────────────────────────────
  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }

  private emit(): void {
    for (const l of this.listeners) {
      try { l(this.state); } catch { /* listener crash is not fatal */ }
    }
  }
}

export const StatProgressionService = new StatProgressionServiceImpl();
export { STAT_KEYS, WEAPON_XP_PER_POINT };
