/**
 * factions — the five MMO factions of Grudges.
 *
 * Data layer only. Mirrors the spec at /info.html (Guilds & Factions section):
 *   • 5 factions, each with a home territory
 *   • Alliance matrix — pledging to one drops 2 natural enemies to Hostile
 *   • 8-tier reputation ladder (Hated -100 → Hero +100)
 *
 * Consumed by:
 *   • sectors.ts (territory ownership)
 *   • WorldGen.ts (settlement faction tagging)
 *   • WorldMapOverlay (faction-colored zone rendering)
 *   • Future ReputationService (player rep tracking + tier broadcasts)
 *
 * No runtime AI / raid / claim-flag systems are implied here. Adding those is
 * a separate task; this file is the single source of truth for what a faction
 * IS so those systems can be layered on without re-defining ids.
 */

export type FactionId =
  | 'keepers'
  | 'tech_scavengers'
  | 'hollow_lords'
  | 'network'
  | 'forgotten';

export interface FactionDef {
  id: FactionId;
  name: string;
  shortName: string;
  /** Territory id from sectors.ts. One faction owns one named territory. */
  territoryId: string;
  /** Two factions are natural enemies — drop to Hostile on pledge. */
  enemies: FactionId[];
  /** Two factions remain workable on pledge (Neutral/Unfriendly). */
  workable: FactionId[];
  /** Hex color for map zones, banners, minimap. */
  color: string;
  /** Single-line creed for UI tooltips. */
  creed: string;
  /** Their playstyle signature (info.html distilled). */
  signature: string;
}

export const FACTIONS: Record<FactionId, FactionDef> = {
  keepers: {
    id: 'keepers',
    name: 'Keepers of the Old Faith',
    shortName: 'Keepers',
    territoryId: 'cathedral_highlands',
    enemies:  ['tech_scavengers', 'hollow_lords'],
    workable: ['network', 'forgotten'],
    color: '#d4b870',
    creed: 'The land is alive. The Way is a parasite. We heal what we can.',
    signature: 'Relic-hammers, hallowed armor, ritual harvest. Hammers + Resolve.',
  },
  tech_scavengers: {
    id: 'tech_scavengers',
    name: 'Tech-Scavengers',
    shortName: 'Scavengers',
    territoryId: 'junkyards',
    enemies:  ['keepers', 'forgotten'],
    workable: ['hollow_lords', 'network'],
    color: '#c87060',
    creed: 'Every wreck is a workshop. Every workshop pays.',
    signature: 'Gunsmithing, tinkering, prototype gadgets. Pistol + Tinkering.',
  },
  hollow_lords: {
    id: 'hollow_lords',
    name: 'Hollow Lords',
    shortName: 'Hollow Lords',
    territoryId: 'the_pit',
    enemies:  ['keepers', 'network'],
    workable: ['tech_scavengers', 'forgotten'],
    color: '#7a2828',
    creed: 'The deep shafts answer to us. The surface follows.',
    signature: 'Warbands, raids, rail rifles, iron law. Rifle + Veterancy.',
  },
  network: {
    id: 'network',
    name: 'The Network',
    shortName: 'Network',
    territoryId: 'switchyard',
    enemies:  ['hollow_lords', 'forgotten'],
    workable: ['keepers', 'tech_scavengers'],
    color: '#3d7eb8',
    creed: 'We share warnings before we share food. That order matters.',
    signature: 'Comms, trade, fiber-optic relays, no raids. Trade + Diplomacy.',
  },
  forgotten: {
    id: 'forgotten',
    name: 'The Forgotten',
    shortName: 'Forgotten',
    territoryId: 'drowned_quarter',
    enemies:  ['tech_scavengers', 'network'],
    workable: ['keepers', 'hollow_lords'],
    color: '#5a7028',
    creed: 'We were left to drown. We learned to breathe the silt.',
    signature: 'Poisons, ambushes, tidal raids. Blades + Toxicology.',
  },
};

export const FACTION_IDS: FactionId[] = [
  'keepers', 'tech_scavengers', 'hollow_lords', 'network', 'forgotten',
];

// ── Reputation ladder ──────────────────────────────────────────────────────

export type RepTier =
  | 'hated' | 'hostile' | 'unfriendly' | 'neutral'
  | 'friendly' | 'honored' | 'allied' | 'hero';

export interface RepTierDef {
  id: RepTier;
  label: string;
  /** Inclusive min; the next tier's min is this tier's exclusive max. */
  min: number;
  max: number;
  /** Short behavior summary from info.html. */
  description: string;
}

export const REP_TIERS: RepTierDef[] = [
  { id: 'hated',      label: 'Hated',      min: -100, max:  -76, description: 'Attack on sight anywhere. Bounty posted. Named hunter dispatched.' },
  { id: 'hostile',    label: 'Hostile',    min:  -75, max:  -26, description: 'Attack on sight in territory. No dialog/trade/quests.' },
  { id: 'unfriendly', label: 'Unfriendly', min:  -25, max:   -1, description: 'Will not attack first but refuses trade.' },
  { id: 'neutral',    label: 'Neutral',    min:    0, max:   24, description: 'Coexistence. Base prices. Default starting state.' },
  { id: 'friendly',   label: 'Friendly',   min:   25, max:   49, description: '-10% trade. Standard contracts. Guards warn off hostiles nearby.' },
  { id: 'honored',    label: 'Honored',    min:   50, max:   74, description: '-20% trade. Guards intervene. Signature recipes unlock.' },
  { id: 'allied',     label: 'Allied',     min:   75, max:   99, description: 'Patrols defend your camps. -30% trade. Caravans every 3-5 days.' },
  { id: 'hero',       label: 'Hero',       min:  100, max:  100, description: 'Faction reinforces you in raids. Champion NPC joins. Max one Hero at a time.' },
];

export function getRepTier(value: number): RepTierDef {
  for (const t of REP_TIERS) {
    if (value >= t.min && value <= t.max) return t;
  }
  return value < -100 ? REP_TIERS[0] : REP_TIERS[REP_TIERS.length - 1];
}

/** Five-element vector — the rep a player/NPC carries toward every faction. */
export type ReputationVector = Record<FactionId, number>;

export function newReputationVector(initial = 0): ReputationVector {
  return {
    keepers: initial, tech_scavengers: initial, hollow_lords: initial,
    network: initial, forgotten: initial,
  };
}
