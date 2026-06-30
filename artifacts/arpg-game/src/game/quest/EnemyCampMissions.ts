/**
 * EnemyCampMissions — dynamic raid quests attached to procedural enemy camps.
 *
 * Each camp gets a unique quest id (`enemy_camp_<campId>`) registered when the
 * camp is spawned. Accepting the mission at the camp (Press E) activates the
 * quest and spawns defenders around the site.
 */

import type { QuestDef } from './QuestSystem';
import type { EnemyManager } from '../EnemyManager';
import type { FactionId } from '../../data/factions';
import { FACTIONS } from '../../data/factions';
import type { AICampTier } from '../world/EnemyCampGrowth';
import { AI_CAMP_TIERS } from '../world/EnemyCampGrowth';

export type CampMissionKind = 'patrol' | 'sector' | 'ai_island';

export interface EnemyCampMissionOpts {
  campId: string;
  x: number;
  z: number;
  /** Defenders to spawn when the mission is accepted. */
  killCount: number;
  enemyManager: EnemyManager;
  kind?: CampMissionKind;
  tier?: AICampTier;
  factionId?: FactionId | null;
  sectorName?: string;
  onCleared?: () => void;
}

function missionTitle(opts: EnemyCampMissionOpts): string {
  const tierLabel = AI_CAMP_TIERS.find(t => t.id === opts.tier)?.label ?? 'Camp';
  if (opts.kind === 'ai_island' && opts.factionId) {
    const faction = FACTIONS[opts.factionId].shortName;
    return `Raid ${faction} ${tierLabel}`;
  }
  if (opts.kind === 'sector' && opts.sectorName) {
    return `Clear ${opts.sectorName}`;
  }
  return 'Raid Enemy Camp';
}

/** Build a raid quest for a specific camp location. */
export function createEnemyCampQuest(opts: EnemyCampMissionOpts): QuestDef {
  const { campId, x, z, killCount, enemyManager, onCleared } = opts;
  const title = missionTitle(opts);
  return {
    id: `enemy_camp_${campId}`,
    title,
    description: 'Clear the hostile encampment and secure the area.',
    reward: {
      professionXp: { combat: 45, hunting: 25 },
      weaponXp: 35,
      items: [{ itemId: 'scrap_metal', count: 3 }],
    },
    steps: [
      {
        type: 'goto',
        objective: 'Reach the enemy camp',
        targetPos: { x, z },
        radius: 40,
        dialog: 'Hostile camp detected. Eliminate the defenders to claim the site.',
      },
      {
        type: 'kill',
        killCount,
        objective: `Clear camp defenders (0/${killCount})`,
      },
    ],
    onFinish: () => {
      onCleared?.();
    },
  };
}

/** Roll defender count for a new camp (3–6). */
export function rollCampDefenderCount(): number {
  return 3 + Math.floor(Math.random() * 4);
}