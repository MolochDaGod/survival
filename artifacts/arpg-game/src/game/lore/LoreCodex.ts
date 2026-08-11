/**
 * LoreCodex — in-game codex entries distilled from
 * public/lore/grudges-compendium.md + lore.html + info.html.
 *
 * Unlocks as the player hits Survivor Loop stages / quests.
 */

import type { SurvivorStage } from './LoreGameLoop';

export interface CodexEntry {
  id: string;
  title: string;
  category: 'history' | 'faction' | 'surface' | 'loop';
  body: string;
  /** Stage required to unlock (or null = always). */
  unlockAt: SurvivorStage | null;
}

export const CODEX_ENTRIES: CodexEntry[] = [
  {
    id: 'the_way',
    title: 'The Way',
    category: 'history',
    unlockAt: null,
    body:
      'They arrived in 2055 from a warp tear above the Pacific. Same biology as us — a branch of humanity that never forgot Earth. They offered Ascension to the stars or Stewardship of the mines. The surface became a quarry. When the lifts no longer paid, they sealed the elevators. The colonies still float. They do not answer.',
  },
  {
    id: 'the_denied',
    title: 'The Denied / Grudges',
    category: 'history',
    unlockAt: null,
    body:
      'Twenty percent of humanity refused both paths. They stayed. Station-dwellers call them Grudges — a name worn with pride. Year 2398 OEY (343 PC). The wells run yellow. The seasons came back wrong. We stayed.',
  },
  {
    id: 'stratocolonies',
    title: 'The Stratocolonies',
    category: 'history',
    unlockAt: 'claimed',
    body:
      'Seventeen sky-cities under the Charter of Stewardship — quotas, tech licenses, generational debt. Exile to Earth is a death sentence. Elysium rules. El Dorado refines. Asgard polices. You are not of them.',
  },
  {
    id: 'keepers',
    title: 'Keepers of the Old Faith',
    category: 'faction',
    unlockAt: 'claimed',
    body:
      'Heal the land. Earth is alive; The Way was a parasite. They quarantine pre-contact tech, plant moonleaf, seal shafts. Enemies: Scavengers, Hollow Lords.',
  },
  {
    id: 'scavengers',
    title: 'Tech-Scavengers',
    category: 'faction',
    unlockAt: 'claimed',
    body:
      'The ruins are a market. Routes over territory. Black-market drop sites to the colonies. Best guns and attachments. Enemies: Keepers, Forgotten.',
  },
  {
    id: 'hollow',
    title: 'Hollow Lords',
    category: 'faction',
    unlockAt: 'claimed',
    body:
      'Shelter is the only currency. They hold the deep shafts The Way left. Iron law, raids, tolls. Enemies: Keepers, Network — and each other.',
  },
  {
    id: 'network',
    title: 'The Network',
    category: 'faction',
    unlockAt: 'claimed',
    body:
      'Warnings before food. Fiber-optic law, reputation public, no raids. They sell locations. Enemies: Hollow Lords, Forgotten.',
  },
  {
    id: 'forgotten',
    title: 'The Forgotten',
    category: 'faction',
    unlockAt: 'claimed',
    body:
      'Their gods do not answer to ours. Pre-industrial borders, barter not coin, unaligned preferred. Hollow Lords raid them most often.',
  },
  {
    id: 'survivor_loop',
    title: 'The Survivor\'s Loop',
    category: 'loop',
    unlockAt: null,
    body:
      'Survive alone. Claim a flag (80 m). Fire, crate, tent. Recruit. Grow Camp → Tribe (5) → Village (10) → Town (20). Defend raids. Pledge one banner — four turn on you.',
  },
  {
    id: 'living_npcs',
    title: 'Living NPCs',
    category: 'surface',
    unlockAt: 'recruited',
    body:
      'Every NPC runs the same systems you do — stats, professions, XP, perks, craft, death. There are no elite stat buckets. Only people who had more time to practice.',
  },
  {
    id: 'claim_flag',
    title: 'The Claim Flag',
    category: 'loop',
    unlockAt: 'claimed',
    body:
      'Painting your flag is the moment you stop being a wanderer. 80 m authority. Enables hires. Invites raids. Becomes guild logo. Move the flag, move the camp.',
  },
];

export function getUnlockedCodex(stage: SurvivorStage): CodexEntry[] {
  const order: SurvivorStage[] = [
    'alone', 'claimed', 'recruited', 'tribe', 'village', 'town', 'pledged',
  ];
  const idx = order.indexOf(stage);
  return CODEX_ENTRIES.filter((e) => {
    if (!e.unlockAt) return true;
    return order.indexOf(e.unlockAt) <= idx;
  });
}

/** Title cards for arrival cinema / remake intro (compendium voice). */
export const INTRO_TITLE_CARDS: Array<{ t: number; title: string; subtitle: string }> = [
  { t: 0.0, title: 'They sealed the elevators.', subtitle: 'The Way still watches.' },
  { t: 1.4, title: 'We stayed.', subtitle: 'The Denied. The Grudges.' },
  { t: 2.8, title: 'Five banners. One surface.', subtitle: 'Bind a grudge. Bear it forward.' },
  { t: 4.0, title: 'Convergence Nexus', subtitle: 'Stake a claim. Recruit. Survive.' },
];
