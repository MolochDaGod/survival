/**
 * EngagementRewards — light reward design for session stickiness.
 *
 * Tracks:
 *   • Session time milestones
 *   • Kill / harvest / craft streaks
 *   • Mode mastery (time in combat/harvest/build)
 *   • AFK minute ticks (smaller rewards)
 *   • First claim / first recruit bonuses
 *
 * Grants profession + weapon XP via existing services — no parallel currency.
 */

import { ProfessionsService } from './ProfessionsService';
import { StatProgressionService } from './StatProgressionService';
import type { GameModeId } from '../mode/GameModeController';

export interface EngagementSnapshot {
  sessionSec: number;
  killStreak: number;
  harvestStreak: number;
  bestKillStreak: number;
  modeSeconds: Partial<Record<GameModeId, number>>;
  milestonesHit: string[];
}

type ToastFn = (title: string, body: string) => void;

const SESSION_MILESTONES: Array<{ sec: number; id: string; township: number; weapon: number; title: string }> = [
  { sec: 120, id: 'session_2m', township: 8, weapon: 10, title: 'Warming up' },
  { sec: 300, id: 'session_5m', township: 15, weapon: 20, title: 'Settling in' },
  { sec: 600, id: 'session_10m', township: 25, weapon: 35, title: 'Surface veteran' },
  { sec: 1200, id: 'session_20m', township: 40, weapon: 50, title: 'Long watch' },
  { sec: 1800, id: 'session_30m', township: 60, weapon: 75, title: 'Night shift' },
];

export class EngagementRewards {
  private sessionSec = 0;
  private killStreak = 0;
  private harvestStreak = 0;
  private craftStreak = 0;
  private bestKillStreak = 0;
  private modeSeconds: Partial<Record<GameModeId, number>> = {};
  private milestones = new Set<string>();
  private streakDecay = 0;

  onToast: ToastFn | null = null;

  update(dt: number, mode: GameModeId): void {
    this.sessionSec += dt;
    this.modeSeconds[mode] = (this.modeSeconds[mode] ?? 0) + dt;

    // Streak decays if idle 12s without kill/harvest
    this.streakDecay += dt;
    if (this.streakDecay > 12) {
      this.killStreak = 0;
      this.harvestStreak = 0;
      this.craftStreak = 0;
      this.streakDecay = 0;
    }

    for (const m of SESSION_MILESTONES) {
      if (this.sessionSec >= m.sec && !this.milestones.has(m.id)) {
        this.milestones.add(m.id);
        ProfessionsService.gainXp('township', m.township);
        ProfessionsService.gainXp('survival', Math.floor(m.township * 0.5));
        StatProgressionService.addWeaponXp(m.weapon);
        this.onToast?.(m.title, `+${m.township} Township · +${m.weapon} Weapon XP`);
      }
    }
  }

  onKill(): void {
    this.streakDecay = 0;
    this.killStreak++;
    this.bestKillStreak = Math.max(this.bestKillStreak, this.killStreak);
    if (this.killStreak > 0 && this.killStreak % 5 === 0) {
      const bonus = 5 + this.killStreak;
      ProfessionsService.gainXp('combat', bonus);
      StatProgressionService.addWeaponXp(bonus);
      this.onToast?.(`${this.killStreak} kill streak`, `+${bonus} Combat / Weapon XP`);
    }
  }

  onHarvest(): void {
    this.streakDecay = 0;
    this.harvestStreak++;
    if (this.harvestStreak > 0 && this.harvestStreak % 8 === 0) {
      const bonus = 6 + Math.floor(this.harvestStreak / 2);
      ProfessionsService.gainXp('gathering', bonus);
      this.onToast?.(`${this.harvestStreak} harvest streak`, `+${bonus} Gathering XP`);
    }
  }

  onCraft(): void {
    this.streakDecay = 0;
    this.craftStreak++;
    if (this.craftStreak % 5 === 0) {
      ProfessionsService.gainXp('crafting', 8);
      ProfessionsService.gainXp('township', 4);
    }
  }

  onAfkMinute(): void {
    // Smaller than active play — keeps AFK useful without outpacing engagement
    ProfessionsService.gainXp('survival', 3);
    ProfessionsService.gainXp('township', 2);
  }

  onFirstClaim(): void {
    if (this.milestones.has('first_claim')) return;
    this.milestones.add('first_claim');
    ProfessionsService.gainXp('township', 40);
    StatProgressionService.addWeaponXp(25);
    this.onToast?.('Camp claimed', '+40 Township · +25 Weapon XP — raise walls before night');
  }

  onFirstRecruit(): void {
    if (this.milestones.has('first_recruit')) return;
    this.milestones.add('first_recruit');
    ProfessionsService.gainXp('township', 30);
    this.onToast?.('First recruit', '+30 Township — assign them a tent and a job');
  }

  /** Mode mastery every 3 minutes in a focused mode. */
  checkModeMastery(mode: GameModeId): void {
    if (mode === 'ui' || mode === 'cinema' || mode === 'afk') return;
    const sec = this.modeSeconds[mode] ?? 0;
    const bucket = Math.floor(sec / 180);
    const id = `mastery_${mode}_${bucket}`;
    if (bucket <= 0 || this.milestones.has(id)) return;
    this.milestones.add(id);
    const xp = 12 + bucket * 4;
    const prof =
      mode === 'harvest' ? 'gathering' : mode === 'build' ? 'township' : mode === 'combat' ? 'combat' : 'survival';
    ProfessionsService.gainXp(prof as 'gathering' | 'township' | 'combat' | 'survival', xp);
    this.onToast?.(`${mode} focus`, `+${xp} ${prof} XP`);
  }

  snapshot(): EngagementSnapshot {
    return {
      sessionSec: this.sessionSec,
      killStreak: this.killStreak,
      harvestStreak: this.harvestStreak,
      bestKillStreak: this.bestKillStreak,
      modeSeconds: { ...this.modeSeconds },
      milestonesHit: [...this.milestones],
    };
  }
}
