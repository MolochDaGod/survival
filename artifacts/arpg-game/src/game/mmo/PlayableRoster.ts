/**
 * PlayableRoster — MMO-style operator cast for live play.
 *
 * Mirrors what the site sells (factions, toon soldiers, claim/craft/camp)
 * into selectable avatar bodies. Used by character creation defaults,
 * character select quick-start, MainPanel identity strip, and AI allies.
 */

import {
  TOON_SURVIVAL_ROSTER,
  type ToonCallsignId,
  type ToonSurvivalDef,
  toonDef,
} from '../toon/ToonSurvivalRoster';
import type { CharacterConfig } from '../CharacterConfig';
import { DEFAULT_CHARACTER_CONFIG, DEFAULT_STATS } from '../CharacterConfig';

export interface PlayableOperator {
  id: ToonCallsignId | 'arpg-player';
  callsign: string;
  fullName: string;
  faction: string;
  role: string;
  classId: string;
  icon: string;
  gltfPath: string;
  weaponMode: 'pistol' | 'rifle' | 'shooter' | 'mixed';
  /** Short pitch for character select cards. */
  blurb: string;
  /** Recommended origin / background id. */
  backgroundId: string;
}

const FACTION_BLURB: Record<string, string> = {
  keepers: 'Pilgrim Road wardens — heal, guide, hold the green.',
  scavs: 'Scrap Highway freebooters — strip, rewire, survive.',
  hollow: 'Descent Road iron — wall-line and heavy fire.',
  network: 'Rail Line signals — map, log, snipe the dark.',
  forgotten: 'Tidal Path ghosts — ash, ice, and old debts.',
  survivor: 'Unaffiliated operator — Convergence Nexus free agent.',
};

function fromToon(t: ToonSurvivalDef): PlayableOperator {
  return {
    id: t.id,
    callsign: t.callsign,
    fullName: t.fullName,
    faction: t.faction,
    role: t.role,
    classId: t.classId,
    icon: t.icon,
    gltfPath: t.gltfPath,
    weaponMode: t.weaponMode,
    blurb: FACTION_BLURB[t.faction] ?? FACTION_BLURB.survivor,
    backgroundId:
      t.weaponMode === 'rifle' ? 'military'
      : t.classId === 'medic' ? 'scientist'
      : t.classId === 'engineer' ? 'engineer'
      : t.classId === 'scout' ? 'scout'
      : 'military',
  };
}

/** Canonical 12 toon operators + modular Operator body. */
export const PLAYABLE_OPERATORS: PlayableOperator[] = [
  ...TOON_SURVIVAL_ROSTER.map(fromToon),
  {
    id: 'arpg-player',
    callsign: 'Operator',
    fullName: 'Nexus Operator',
    faction: 'survivor',
    role: 'free-agent',
    classId: 'infantry',
    icon: '🎮',
    gltfPath: '/models/characters/player/arpg-player.glb',
    weaponMode: 'mixed',
    blurb: FACTION_BLURB.survivor,
    backgroundId: 'military',
  },
];

export const PLAYABLE_BY_ID: Record<string, PlayableOperator> = Object.fromEntries(
  PLAYABLE_OPERATORS.map((o) => [o.id, o]),
);

/** Default live body — Hollow Lords line fighter (docs + site cast). */
export const DEFAULT_PLAYABLE_ID: ToonCallsignId = 'toon-brick';

export function getPlayable(id: string | undefined | null): PlayableOperator {
  if (id && PLAYABLE_BY_ID[id]) return PLAYABLE_BY_ID[id];
  return PLAYABLE_BY_ID[DEFAULT_PLAYABLE_ID];
}

/** Build a CharacterConfig for quick-start / MMO roster pick. */
export function configFromPlayable(
  opId: string,
  nameOverride?: string,
): CharacterConfig {
  const op = getPlayable(opId);
  const gender = op.id === 'arpg-player' || /brick|bastion|ledger|rivet|vex|nim|scope/i.test(op.callsign)
    ? 'male' as const
    : 'male' as const; // toon packs are unisex silhouettes; creation still uses male defaults for toons
  return {
    ...DEFAULT_CHARACTER_CONFIG,
    name: nameOverride?.trim() || op.callsign,
    gender,
    bodyProportion: op.id as CharacterConfig['bodyProportion'],
    backgroundId: op.backgroundId,
    stats: { ...DEFAULT_STATS },
    heightCm: 178,
    build: 55,
  };
}

/** Resolve display identity for HUD / MainPanel from a config. */
export function identityFromConfig(config: CharacterConfig | null | undefined): {
  callsign: string;
  icon: string;
  faction: string;
  role: string;
  blurb: string;
} {
  const op = getPlayable(config?.bodyProportion);
  const toon = config?.bodyProportion ? toonDef(config.bodyProportion) : undefined;
  return {
    callsign: config?.name || op.callsign,
    icon: toon?.icon ?? op.icon,
    faction: toon?.faction ?? op.faction,
    role: toon?.role ?? op.role,
    blurb: op.blurb,
  };
}

export function operatorsByFaction(): Record<string, PlayableOperator[]> {
  const map: Record<string, PlayableOperator[]> = {};
  for (const op of PLAYABLE_OPERATORS) {
    (map[op.faction] ??= []).push(op);
  }
  return map;
}
