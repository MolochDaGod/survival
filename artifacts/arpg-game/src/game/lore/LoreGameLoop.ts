/**
 * LoreGameLoop — orchestrates the Survivor's Loop from info.html + lore.html.
 *
 * Stages (soft, not railroading):
 *   alone → claimed → recruited → tribe → village → town → pledged
 *
 * Applies:
 *   • Settlement buffs (regen, hire damage)
 *   • Smooth Talker passive heal near allies
 *   • Tier-up toasts + township XP
 *   • Faction rep day ticks
 *   • Production reputation → diplomat
 */

import * as THREE from 'three';
import type { PlayerController } from '../PlayerController';
import type { CampClaimSystem } from '../survival/camp/CampClaimSystem';
import type { CitySpawner } from '../ai/CitySpawner';
import {
  computeSettlementBuffs,
  SettlementProgressTracker,
  type ActiveSettlementBuffs,
} from '../township/SettlementBuffs';
import { computeTownshipState } from '../township/TownshipSystem';
import { getReputationService } from '../faction/ReputationService';
import { evaluateRecruitGate } from '../township/RecruitRequirements';
import { ProfessionsService } from '../progression/ProfessionsService';
import type { PlayerStats } from '../types';

export type SurvivorStage =
  | 'alone'
  | 'claimed'
  | 'recruited'
  | 'tribe'
  | 'village'
  | 'town'
  | 'pledged';

export class LoreGameLoop {
  private player: PlayerController;
  private stats: PlayerStats;
  private campClaim: CampClaimSystem | null = null;
  private citySpawner: CitySpawner | null = null;
  private tierTracker = new SettlementProgressTracker();
  private stage: SurvivorStage = 'alone';
  private regenAccum = 0;

  buffs: ActiveSettlementBuffs = computeSettlementBuffs(computeTownshipState(0));

  onStageChange: ((stage: SurvivorStage, blurb: string) => void) | null = null;
  onToast: ((title: string, body: string) => void) | null = null;

  constructor(player: PlayerController, stats: PlayerStats) {
    this.player = player;
    this.stats = stats;

    this.tierTracker.onTierUp = (tier, xp) => {
      this.onToast?.(
        `Settlement: ${tier}`,
        `+${xp} Township XP — ${this.buffs.flavor}`,
      );
      this.refreshStage();
    };
  }

  attach(camp: CampClaimSystem | null, city: CitySpawner | null): void {
    this.campClaim = camp;
    this.citySpawner = city;
    if (camp) {
      const prev = camp.onClaimed;
      camp.onClaimed = (pos, race) => {
        prev?.(pos, race);
        this.refreshStage();
        this.onToast?.('Claim planted', '80 m of camp authority. Fire, crate, tent — then recruits.');
      };
    }
  }

  getStage(): SurvivorStage {
    return this.stage;
  }

  getRecruitGateMessage(): string {
    const pop = this.citySpawner?.getFollowerCount() ?? 0;
    const state = computeTownshipState(pop);
    return evaluateRecruitGate(this.campClaim, state, pop).message;
  }

  canRecruitNow(): boolean {
    const pop = this.citySpawner?.getFollowerCount() ?? 0;
    const state = computeTownshipState(pop);
    return evaluateRecruitGate(this.campClaim, state, pop).ok;
  }

  /**
   * Per-frame: regen, smooth talker, rep time, stage.
   */
  update(dt: number): void {
    const pop = this.citySpawner?.getFollowerCount() ?? 0;
    const state = computeTownshipState(pop);
    this.buffs = computeSettlementBuffs(state);
    this.tierTracker.check(pop);

    getReputationService().update(dt);

    // Cooking pot + Smooth Talker heal while in claim radius
    const inCamp = this.isPlayerInCamp();
    let heal = 0;
    if (inCamp) heal += this.buffs.campRegenPerSec;
    if (this.buffs.smoothTalkerHeal > 0 && pop > 0 && inCamp) {
      heal += this.buffs.smoothTalkerHeal;
    }
    if (heal > 0 && this.stats.health < this.stats.maxHealth) {
      this.regenAccum += heal * dt;
      if (this.regenAccum >= 1) {
        const pts = Math.floor(this.regenAccum);
        this.regenAccum -= pts;
        this.stats.health = Math.min(this.stats.maxHealth, this.stats.health + pts);
        this.player.onStatChange?.();
      }
    }

    this.refreshStage();
  }

  /** When production yields 'reputation', feed diplomat. */
  onProductionResources(res: Record<string, number>): void {
    const rep = res.reputation ?? 0;
    if (rep > 0) {
      getReputationService().onDiplomatTick(rep, this.buffs.bannerRepBonus);
    }
  }

  private isPlayerInCamp(): boolean {
    if (!this.campClaim?.isClaimed()) return false;
    const flag = this.campClaim.getFlagPosition();
    if (!flag) return false;
    return this.player.position.distanceTo(flag) <= 80;
  }

  private refreshStage(): void {
    const pop = this.citySpawner?.getFollowerCount() ?? 0;
    const claimed = this.campClaim?.isClaimed() ?? false;
    const pledged = getReputationService().getPledged();
    const tier = computeTownshipState(pop).tier;

    let next: SurvivorStage = 'alone';
    if (pledged) next = 'pledged';
    else if (tier === 'town' || tier === 'stronghold') next = 'town';
    else if (tier === 'village') next = 'village';
    else if (tier === 'tribe' || pop >= 5) next = 'tribe';
    else if (pop >= 1) next = 'recruited';
    else if (claimed) next = 'claimed';

    if (next !== this.stage) {
      this.stage = next;
      this.onStageChange?.(next, STAGE_BLURB[next]);
    }
  }
}

const STAGE_BLURB: Record<SurvivorStage, string> = {
  alone: 'Survive alone — explore, harvest, raise a wall.',
  claimed: 'Camp claimed. Place fire, crate, tent — then recruit.',
  recruited: 'Allies under your banner. Grow to five for Tribe.',
  tribe: 'Tribe — shared pot, morale aura. Defend what you built.',
  village: 'Village — trade posts and embassies open.',
  town: 'Town — your banner reaches the Network.',
  pledged: 'You fly a colour. Four other banners watch.',
};
