/**
 * ReputationService — five-faction reputation + pledge (info.html / lore.html).
 *
 * Canonical rules:
 *   • Vector −100…+100 per faction, 8 tiers (Hated→Hero)
 *   • Pledge one faction → enemies drop to Hostile (−50), workable shift −10
 *   • Renounce → abandoned −50, 7-day cooldown (sim as 7× in-game day ticks)
 *   • Diplomat production feeds +rep via onDiplomatTick
 *   • Hostile+ in owned territory → attack-on-sight flag for AI consumers
 *
 * Survival / GRUDGES era only.
 */

import {
  type FactionId,
  type ReputationVector,
  type RepTier,
  FACTIONS,
  FACTION_IDS,
  getRepTier,
  newReputationVector,
} from '../../data/factions';
import { ProfessionsService } from '../progression/ProfessionsService';

export interface ReputationSnapshot {
  vector: ReputationVector;
  pledged: FactionId | null;
  renounceCooldownDays: number;
  heroFaction: FactionId | null;
}

export class ReputationService {
  private vector: ReputationVector = newReputationVector(0);
  private pledged: FactionId | null = null;
  private renounceCooldownDays = 0;
  private heroFaction: FactionId | null = null;
  private dayAccum = 0;

  onChange: ((snap: ReputationSnapshot) => void) | null = null;
  onToast: ((title: string, body: string) => void) | null = null;

  getVector(): ReputationVector {
    return { ...this.vector };
  }

  getPledged(): FactionId | null {
    return this.pledged;
  }

  getRep(faction: FactionId): number {
    return this.vector[faction];
  }

  getTier(faction: FactionId): RepTier {
    return getRepTier(this.vector[faction]).id;
  }

  getTierLabel(faction: FactionId): string {
    return getRepTier(this.vector[faction]).label;
  }

  /** Trade price multiplier from rep tier. */
  getTradePriceMult(faction: FactionId): number {
    const t = this.getTier(faction);
    switch (t) {
      case 'friendly': return 0.9;
      case 'honored': return 0.8;
      case 'allied':
      case 'hero': return 0.7;
      default: return 1;
    }
  }

  /** True if faction AI should attack on sight (hostile+). */
  isHostileTo(faction: FactionId): boolean {
    const t = this.getTier(faction);
    return t === 'hated' || t === 'hostile';
  }

  /** True if guards should intervene for the player in this faction's land. */
  guardsIntervene(faction: FactionId): boolean {
    const t = this.getTier(faction);
    return t === 'honored' || t === 'allied' || t === 'hero';
  }

  /**
   * Adjust reputation. Applies reputationGainBonus from Township Diplomacy.
   */
  addRep(faction: FactionId, amount: number, reason?: string): void {
    const bonus = ProfessionsService.getEffect('reputationGainBonus') || 0;
    const delta = amount > 0 ? amount * (1 + bonus) : amount;
    const prev = this.vector[faction];
    this.vector[faction] = Math.max(-100, Math.min(100, prev + delta));

    // Hero uniqueness
    if (this.vector[faction] >= 100) {
      if (this.heroFaction && this.heroFaction !== faction) {
        this.vector[faction] = 99; // only one hero
      } else {
        this.heroFaction = faction;
      }
    } else if (this.heroFaction === faction && this.vector[faction] < 100) {
      this.heroFaction = null;
    }

    const before = getRepTier(prev);
    const after = getRepTier(this.vector[faction]);
    if (before.id !== after.id) {
      this.onToast?.(
        `${FACTIONS[faction].shortName}: ${after.label}`,
        reason ?? after.description,
      );
    }
    this.emit();
  }

  /**
   * Pledge to a faction (info.html). Enemies → Hostile, workable −10.
   * Forgotten / Keepers often require unaligned — we enforce unaligned always for clean rules.
   */
  pledge(faction: FactionId): { ok: boolean; error?: string } {
    if (this.pledged === faction) {
      return { ok: false, error: 'Already pledged to this banner.' };
    }
    if (this.pledged) {
      return { ok: false, error: 'Renounce your current pledge first.' };
    }
    if (this.renounceCooldownDays > 0) {
      return { ok: false, error: `Renounce cooldown: ${this.renounceCooldownDays} days.` };
    }

    const def = FACTIONS[faction];
    this.pledged = faction;
    this.addRep(faction, 25, `Pledged to ${def.name}`);

    for (const e of def.enemies) {
      this.vector[e] = Math.min(this.vector[e], -50); // Hostile band
      this.onToast?.(
        `${FACTIONS[e].shortName} Hostile`,
        `Pledging to ${def.shortName} made them natural enemies.`,
      );
    }
    for (const w of def.workable) {
      this.vector[w] = Math.max(-25, this.vector[w] - 10);
    }

    ProfessionsService.gainXp('township', 20);
    this.emit();
    return { ok: true };
  }

  /** Renounce current pledge — −50 to abandoned faction, 7-day cooldown. */
  renounce(): { ok: boolean; error?: string } {
    if (!this.pledged) return { ok: false, error: 'No pledge to renounce.' };
    const abandoned = this.pledged;
    this.pledged = null;
    this.addRep(abandoned, -50, `Renounced ${FACTIONS[abandoned].shortName}`);
    this.renounceCooldownDays = 7;
    this.emit();
    return { ok: true };
  }

  /** Call with real-time dt; ~10 min real = 1 in-game day for cooldown. */
  update(dt: number): void {
    this.dayAccum += dt;
    const DAY_SEC = 600;
    while (this.dayAccum >= DAY_SEC) {
      this.dayAccum -= DAY_SEC;
      if (this.renounceCooldownDays > 0) {
        this.renounceCooldownDays--;
        this.emit();
      }
      // Diplomat passive if pledged — small daily rep
      if (this.pledged) {
        // handled by camp production 'reputation' resource + explicit diplomat tick
      }
    }
  }

  /** From CampProductionTick diplomat output. */
  onDiplomatTick(amount: number, bannerBonus = 0): void {
    const mult = 1 + bannerBonus;
    const amt = Math.max(1, Math.round(amount * mult));
    if (this.pledged) {
      this.addRep(this.pledged, amt, 'Diplomat Envoy');
    } else {
      for (const id of FACTION_IDS) {
        this.addRep(id, Math.max(1, Math.floor(amt * 0.2)), 'Surface diplomacy');
      }
    }
  }

  /** Quest / sector completion: small rep toward territory owner. */
  onSectorFavor(faction: FactionId | null, amount = 8): void {
    if (!faction) return;
    this.addRep(faction, amount, 'Territory deeds');
  }

  serialize(): ReputationSnapshot {
    return {
      vector: { ...this.vector },
      pledged: this.pledged,
      renounceCooldownDays: this.renounceCooldownDays,
      heroFaction: this.heroFaction,
    };
  }

  restore(snap: ReputationSnapshot | null | undefined): void {
    if (!snap) return;
    this.vector = { ...newReputationVector(0), ...snap.vector };
    this.pledged = snap.pledged;
    this.renounceCooldownDays = snap.renounceCooldownDays ?? 0;
    this.heroFaction = snap.heroFaction ?? null;
    this.emit();
  }

  private emit(): void {
    this.onChange?.(this.serialize());
  }
}

// Singleton for engine + UI
let _rep: ReputationService | null = null;
export function getReputationService(): ReputationService {
  if (!_rep) _rep = new ReputationService();
  return _rep;
}
