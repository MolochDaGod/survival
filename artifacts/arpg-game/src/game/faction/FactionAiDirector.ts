/**
 * FactionAiDirector — lightweight "factions are AI players" loop (lore.html).
 *
 * Each faction slowly expands via EnemyCampSystem-compatible pressure:
 *   • Network never raids (sells locations) — lower aggression
 *   • Hollow Lords high raid weight
 *   • Keepers prefer sealing / shrine camps
 *   • Scavengers scrap camps
 *   • Forgotten tidal / marsh pressure
 *
 * Does not replace EnemyCampSystem — modulates timers and toasts.
 */

import type { FactionId } from '../../data/factions';
import { FACTIONS, FACTION_IDS } from '../../data/factions';
import { getReputationService } from './ReputationService';
import type { EnemyCampSystem } from '../world/EnemyCampSystem';

const AGGRESSION: Record<FactionId, number> = {
  keepers: 0.6,
  tech_scavengers: 0.85,
  hollow_lords: 1.2,
  network: 0.15, // never raids — rare "checkpoint" events only
  forgotten: 0.7,
};

export class FactionAiDirector {
  private enemyCamps: EnemyCampSystem | null = null;
  private timer = 120; // first check after 2 min
  private lastToastAt = 0;

  onWorldEvent: ((title: string, body: string) => void) | null = null;

  attach(camps: EnemyCampSystem | null): void {
    this.enemyCamps = camps;
  }

  update(dt: number, gameTimeSec: number): void {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 180 + Math.random() * 120; // 3–5 min

    const rep = getReputationService();
    // Pick a faction that is hostile to the player or naturally aggressive
    const candidates = FACTION_IDS.filter((id) => {
      if (id === 'network') return Math.random() < 0.15;
      return rep.isHostileTo(id) || Math.random() < AGGRESSION[id] * 0.35;
    });
    if (!candidates.length) return;

    const faction = candidates[Math.floor(Math.random() * candidates.length)];
    const def = FACTIONS[faction];

    // Network: information event, not a raid
    if (faction === 'network') {
      if (gameTimeSec - this.lastToastAt > 90) {
        this.lastToastAt = gameTimeSec;
        this.onWorldEvent?.(
          'Network bulletin',
          'Relay chatter: caravan routes updated. Warnings shared before food.',
        );
      }
      return;
    }

    // Signal raid pressure — SurvivorSpawner / EnemyCamp already spawn waves;
    // we add lore flavor + slight rep consequence if player is pledged to enemies
    if (gameTimeSec - this.lastToastAt > 60) {
      this.lastToastAt = gameTimeSec;
      const pledged = rep.getPledged();
      let body = `${def.shortName} warbands move on the surface.`;
      if (pledged && def.enemies.includes(pledged)) {
        body = `${def.shortName} march against your banner (${FACTIONS[pledged].shortName}). Ready the walls.`;
        rep.addRep(faction, -2, 'Warband pressure');
      } else if (pledged === faction) {
        body = `${def.shortName} call on allied camps — stand ready to reinforce.`;
        rep.addRep(faction, 1, 'Militia call');
      }
      this.onWorldEvent?.(`${def.shortName} activity`, body);
    }

    void this.enemyCamps; // reserved for future camp growth hooks
  }
}
