/**
 * EncampmentIntro — opening quest + named hub NPCs for Convergence Nexus.
 *
 * Canonical game flow (survival.grudge-studio.com / info.html):
 *   1. Arrive at the encampment (middle sector / world origin)
 *   2. Meet the hub crew (toon operators from the Survival lore roster)
 *   3. Plant your Claim Flag on the middle-sector camp pad (80 m authority)
 *   4. Visit vendor / vault / battle trial
 *   5. Unlock five faction roads (sector quests)
 *
 * NPC positions are offsets from the encampment centre (player spawn).
 * bodyId maps to CharacterConfig / ToonSurvivalRoster CDN meshes.
 */

import * as THREE from 'three';
import type { QuestDef } from './QuestSystem';
import type { EnemyManager } from '../EnemyManager';
import type { ToonCallsignId } from '../toon/ToonSurvivalRoster';
import { MIDDLE_CAMP_PAD_OFFSET } from '../world/MiddleCampBootstrap';

// ── Named NPC definitions ───────────────────────────────────────────────────

export interface EncampmentNpcDef {
  id: string;
  label: string;
  role: 'vendor' | 'faction' | 'bank' | 'battlemaster' | 'camp_steward';
  talkLine: string;
  /** Offset from encampment centre (metres). */
  offset: { x: number; z: number };
  /** Toon body id for mesh spawn (CDN toon-soldiers). */
  bodyId: ToonCallsignId;
  /** Faction id for dialog colouring / codex. */
  faction: 'keepers' | 'tech_scavengers' | 'hollow_lords' | 'network' | 'forgotten';
}

/**
 * Hub cast — five operators who hold the Nexus while the player stakes a camp.
 * Callsigns match docs/TOON-SURVIVAL-LORE-ROSTER.md.
 */
export const ENCAMPMENT_NPCS: readonly EncampmentNpcDef[] = [
  {
    id: 'npc_faction',
    label: 'Quin Ledger',
    role: 'faction',
    talkLine:
      '"You made it. The Nexus is the only ground no warband can claim without every faction answering. Listen close."',
    offset: { x: 5, z: -15 },
    bodyId: 'toon-ledger',
    faction: 'network',
  },
  {
    id: 'npc_vendor',
    label: 'Kael “Rivet” Dorn',
    role: 'vendor',
    talkLine:
      '"Need supplies? I rebuild what The Way left rusting. First kit is on the house — after that, scrap talks."',
    offset: { x: -12, z: -5 },
    bodyId: 'toon-rivet',
    faction: 'tech_scavengers',
  },
  {
    id: 'npc_bank',
    label: 'Sera Ashcoil',
    role: 'bank',
    talkLine:
      '"Your stash is tagged and lawful. Nobody breaches this vault without a Network ledger entry."',
    offset: { x: -15, z: 5 },
    bodyId: 'toon-ashcoil',
    faction: 'network',
  },
  {
    id: 'npc_battlemaster',
    label: 'Torren Bastion',
    role: 'battlemaster',
    talkLine:
      '"Shelter walls need teeth. Prove you can hold a doorway before you raise a banner."',
    offset: { x: 8, z: 12 },
    bodyId: 'toon-bastion',
    faction: 'hollow_lords',
  },
  {
    id: 'npc_camp_steward',
    label: 'Juno “Brick” Hale',
    role: 'camp_steward',
    talkLine:
      '"Middle pad is yours if you plant the flag. Campfire, crate, tent — then we talk hires."',
    offset: { x: 2, z: 8 },
    bodyId: 'toon-brick',
    faction: 'hollow_lords',
  },
] as const;

/** Battle Master spawns enemies south-east of camp (outside safe pad). */
const BATTLE_ARENA_OFFSET = { x: 22, z: 20 };

// ── Intro quest ─────────────────────────────────────────────────────────────

/**
 * Create the opening quest. When `campPad` is provided, the claim step
 * targets that world position; otherwise it uses MIDDLE_CAMP_PAD_OFFSET
 * from `encampmentCentre`.
 */
export function createIntroQuest(
  encampmentCentre: THREE.Vector3,
  enemyManager: EnemyManager,
  campPad?: THREE.Vector3 | null,
): QuestDef {
  const cx = encampmentCentre.x;
  const cz = encampmentCentre.z;
  const padX = campPad?.x ?? cx + MIDDLE_CAMP_PAD_OFFSET.x;
  const padZ = campPad?.z ?? cz + MIDDLE_CAMP_PAD_OFFSET.z;

  return {
    id: 'encampment_intro',
    title: 'Stake Your Camp',
    description:
      'Meet the Nexus crew, plant your Claim Flag on the middle-sector pad, gear up, and prove you can hold ground.',
    reward: {
      professionXp: { combat: 50, survival: 40, township: 40 },
      weaponXp: 60,
      items: [
        { itemId: 'claim_flag', count: 1 },
        { itemId: 'workbench', count: 1 },
      ],
    },
    steps: [
      {
        type: 'talk',
        npcId: 'npc_faction',
        objective: 'Talk to Quin Ledger (Network)',
        dialog:
          'Welcome, survivor. This camp is the last holdout against The Way\'s abandonment. Five factions carved the surface. Before you pick a road — plant a Claim Flag on the middle pad. No flag, no hires, no raid radius, no camp. Brick will show you the plot. Then see Rivet for scrap, Ashcoil for the vault, and Bastion when you\'re ready to fight.',
      },
      {
        type: 'talk',
        npcId: 'npc_camp_steward',
        objective: 'Talk to Brick about the camp pad',
        dialog:
          'Middle of the Nexus — that open pad south of the hub. Raise your flag there and the camp is yours: 80 metres of authority, unarmed guardian in your race colours, benches and walls count toward harvest and hire AI. If the pad is already flagged from a fresh start, walk the circle and confirm it\'s yours. Then we build.',
      },
      {
        type: 'claim',
        objective: 'Claim the middle-sector camp (plant / confirm flag)',
        targetPos: { x: padX, z: padZ },
        radius: 25,
        dialog:
          'Camp authority set. Unarmed guardian on watch. Workbenches in radius grant profession craft tiers; walls and storage buff harvest and hire AI.',
      },
      {
        type: 'talk',
        npcId: 'npc_vendor',
        objective: 'Visit Rivet the Quartermaster',
        dialog:
          'Here\'s the deal — I sell what I salvage from the ruins The Way left. Browse freely. First purchase is on the house. Scrap Highway runs east when you\'re ready for the Junkyards.',
      },
      {
        type: 'talk',
        npcId: 'npc_bank',
        objective: 'Secure supplies with Ashcoil',
        dialog:
          'Store anything you can\'t afford to lose. The Hollow Lords raid every season. The vault holds through raids. Network tags every crate — lawful salvage only.',
      },
      {
        type: 'talk',
        npcId: 'npc_battlemaster',
        objective: 'Report to Bastion',
        dialog:
          'So Ledger sent you. Good. The surface is unforgiving — The Way stripped everything and left us to rot. I\'ll send a few hostiles. Survive, and you\'ve earned your place at this fire.',
        onComplete: () => {
          // Spawn challengers away from the claim pad (arena offset)
          for (let i = 0; i < 3; i++) {
            setTimeout(() => {
              enemyManager.spawnEnemy();
            }, i * 800);
          }
          void BATTLE_ARENA_OFFSET; // reserved for future fixed arena spawn
        },
      },
      {
        type: 'kill',
        killCount: 3,
        objective: 'Defeat the challengers',
      },
      {
        type: 'return',
        npcId: 'npc_battlemaster',
        objective: 'Return to Bastion',
        dialog:
          'Not bad. You\'ve earned a place in this camp. The real fight is out there — five factions, five territories. Talk to Ledger about which road to take. Pilgrim Road north to the Keepers, Scrap Highway east to the Scavengers, Descent Road south to The Pit, Rail Line west to the Network, Tidal Path southeast to the Forgotten.',
      },
    ],
  };
}

// ── Sector exploration quests ───────────────────────────────────────────────
// Unlock after encampment_intro completes. Each sends the player to a
// faction capital to meet their territory and start earning reputation.

/**
 * After intro: optional pledge quests — one per banner (info.html).
 * Completing goto + talk with Ledger unlocks ReputationService.pledge.
 */
export function createFactionPledgeQuests(): QuestDef[] {
  return [
    {
      id: 'pledge_keepers',
      title: 'Banner of the Keepers',
      description: 'Walk the Pilgrim Road and consider pledging to the Keepers of the Old Faith.',
      reward: { professionXp: { township: 30, survival: 20 }, weaponXp: 20 },
      steps: [
        {
          type: 'talk',
          npcId: 'npc_faction',
          objective: 'Ask Ledger about pledging to the Keepers',
          dialog:
            'The Keepers heal the land and hate the shafts. Pledge to them and the Scavengers and Hollow Lords turn Hostile. Think carefully — one banner, four grudges.',
        },
        { type: 'goto', objective: 'Stand on Pilgrim Road north', targetPos: { x: 0, z: -400 }, radius: 40 },
        {
          type: 'return',
          npcId: 'npc_faction',
          objective: 'Return to Ledger to swear the Keepers\' oath',
          dialog:
            'If you swear, plant their colour on your claim. The Network will still trade. The Scavengers will not. Speak the oath in the camp panel when ready — or walk away free.',
        },
      ],
    },
    {
      id: 'pledge_scavengers',
      title: 'Banner of the Scavengers',
      description: 'The ruins are a market — consider the Tech-Scavengers.',
      reward: { professionXp: { township: 30, crafting: 20 }, weaponXp: 20 },
      steps: [
        {
          type: 'talk',
          npcId: 'npc_faction',
          objective: 'Ask Ledger about the Scavengers',
          dialog:
            'Scavengers sell the corpse of Earth. Best guns, worst manners. Keepers and Forgotten become Hostile if you fly scrap colours.',
        },
        { type: 'goto', objective: 'Walk Scrap Highway east', targetPos: { x: 400, z: 0 }, radius: 40 },
        {
          type: 'return',
          npcId: 'npc_faction',
          objective: 'Return to Ledger about scavenger routes',
          dialog: 'Rivet will vouch if you bring scrap. Pledge from your camp when the road feels like home.',
        },
      ],
    },
    {
      id: 'pledge_hollow',
      title: 'Banner of the Hollow Lords',
      description: 'Shelter is the only currency — the Pit calls.',
      reward: { professionXp: { township: 30, combat: 30 }, weaponXp: 30 },
      steps: [
        {
          type: 'talk',
          npcId: 'npc_faction',
          objective: 'Ask Ledger about the Hollow Lords',
          dialog:
            'Iron law. Shafts for rent. Bastion and Brick know that door. Keepers and Network go Hostile on pledge.',
        },
        { type: 'goto', objective: 'Walk Descent Road south', targetPos: { x: 0, z: 400 }, radius: 40 },
        {
          type: 'return',
          npcId: 'npc_battlemaster',
          objective: 'Speak with Bastion about iron law',
          dialog: 'If you fly Hollow colours, you raid for tribute. Walls first. Always walls first.',
        },
      ],
    },
    {
      id: 'pledge_network',
      title: 'Banner of the Network',
      description: 'Warnings before food — the closest thing to law.',
      reward: { professionXp: { township: 40, survival: 15 }, weaponXp: 15 },
      steps: [
        {
          type: 'talk',
          npcId: 'npc_faction',
          objective: 'Ask Ledger about the Network',
          dialog:
            'We share warnings before we share food. Hollow Lords and Forgotten go Hostile. No raids — only relays and reputations.',
        },
        { type: 'goto', objective: 'Walk Rail Line west', targetPos: { x: -400, z: 0 }, radius: 40 },
        {
          type: 'return',
          npcId: 'npc_bank',
          objective: 'Confirm with Ashcoil',
          dialog: 'Lawful salvage. Tagged crates. Pledge when you want every Network camp to know your banner.',
        },
      ],
    },
    {
      id: 'pledge_forgotten',
      title: 'Banner of the Forgotten',
      description: 'Arrive without colours — or become one of them.',
      reward: { professionXp: { township: 30, chemistry: 25 }, weaponXp: 20 },
      steps: [
        {
          type: 'talk',
          npcId: 'npc_faction',
          objective: 'Ask Ledger about the Forgotten',
          dialog:
            'They want you unaligned before they talk. Scavengers and Network become Hostile if you take their border gods. Tidal Path southeast.',
        },
        { type: 'goto', objective: 'Walk Tidal Path southeast', targetPos: { x: 280, z: 280 }, radius: 50 },
        {
          type: 'return',
          npcId: 'npc_faction',
          objective: 'Return before pledging Forgotten',
          dialog: 'Leave coin at home. Trade in goods. Pledge only if you will unbind from other banners first.',
        },
      ],
    },
  ];
}

export function createSectorQuests(): QuestDef[] {
  return [
    {
      id: 'quest_keepers',
      title: 'The Pilgrim Road',
      description: 'Travel north to the Cathedral Highlands and meet the Keepers of the Old Faith.',
      reward: { professionXp: { survival: 80, gathering: 40 }, weaponXp: 40 },
      steps: [
        {
          type: 'talk',
          npcId: 'npc_faction',
          objective: 'Ask Ledger about the Keepers',
          dialog:
            'The Keepers hold the highlands north of here. They believe The Way wounded the living land and only hallowed harvest can heal it. Follow the Pilgrim Road — they\'ll test your faith before your blade. Look for Nim and Suture if the scouts still walk the fringe.',
        },
        { type: 'goto', objective: 'Reach the Cathedral Highlands', targetPos: { x: 0, z: -6000 }, radius: 200 },
        { type: 'kill', killCount: 5, objective: 'Clear highland hostiles (0/5)' },
        { type: 'goto', objective: 'Find the Old Cathedral', targetPos: { x: 0, z: -6000 }, radius: 50 },
      ],
    },
    {
      id: 'quest_scavengers',
      title: 'The Scrap Highway',
      description: 'Travel east to The Junkyards and meet the Tech-Scavengers.',
      reward: { professionXp: { survival: 80, crafting: 50 }, weaponXp: 40 },
      steps: [
        {
          type: 'talk',
          npcId: 'npc_faction',
          objective: 'Ask Ledger about the Scavengers',
          dialog:
            'East along the Scrap Highway you\'ll find The Junkyards. The Tech-Scavengers were the mechanics who kept The Way\'s machines alive. Now they keep them alive for themselves. Bring scrap — they respect parts more than words. Rivet\'s kin run those yards.',
        },
        { type: 'goto', objective: 'Reach The Junkyards', targetPos: { x: 6000, z: 0 }, radius: 200 },
        { type: 'kill', killCount: 5, objective: 'Clear junkyard hostiles (0/5)' },
        { type: 'goto', objective: 'Find The Workshops', targetPos: { x: 6000, z: 0 }, radius: 50 },
      ],
    },
    {
      id: 'quest_hollow_lords',
      title: 'Descent Road',
      description: 'Travel south to The Pit and face the Hollow Lords.',
      reward: { professionXp: { combat: 100, hunting: 40 }, weaponXp: 60 },
      steps: [
        {
          type: 'talk',
          npcId: 'npc_faction',
          objective: 'Ask Ledger about the Hollow Lords',
          dialog:
            'South lies The Pit. The Hollow Lords were miners trapped when The Way sealed the elevators. Now they rule by iron law — rank through strength, oaths in blood. Bastion and Brick know that door better than most. Don\'t go unarmed.',
        },
        { type: 'goto', objective: 'Reach The Pit', targetPos: { x: 0, z: 6000 }, radius: 200 },
        { type: 'kill', killCount: 8, objective: 'Survive the warband patrols (0/8)' },
        { type: 'goto', objective: 'Find Iron Pit', targetPos: { x: 0, z: 6000 }, radius: 50 },
      ],
    },
    {
      id: 'quest_network',
      title: 'Rail Line West',
      description: 'Travel west to The Switchyard and meet The Network.',
      reward: {
        professionXp: { survival: 60, township: 60 },
        weaponXp: 30,
        items: [
          { itemId: 'compass', count: 1 },
          { itemId: 'radio', count: 1 },
        ],
      },
      steps: [
        {
          type: 'talk',
          npcId: 'npc_faction',
          objective: 'Ask Ledger about the Network',
          dialog:
            'West along the old rail line is The Switchyard. The Network were rail workers who became traders, then intelligence brokers. They never raid — they sell information. Ashcoil and Scope keep the ledgers. Bring something worth trading.',
        },
        { type: 'goto', objective: 'Reach The Switchyard', targetPos: { x: -6000, z: 0 }, radius: 200 },
        { type: 'kill', killCount: 3, objective: 'Clear bandit scouts on the rail line (0/3)' },
        { type: 'goto', objective: 'Find The Exchange', targetPos: { x: -6000, z: 0 }, radius: 50 },
      ],
    },
    {
      id: 'quest_forgotten',
      title: 'The Tidal Path',
      description: 'Travel southeast to The Drowned Quarter and find the Forgotten.',
      reward: { professionXp: { survival: 80, chemistry: 50 }, weaponXp: 40 },
      steps: [
        {
          type: 'talk',
          npcId: 'npc_faction',
          objective: 'Ask Ledger about the Forgotten',
          dialog:
            'Southeast, where the coast floods, you\'ll find The Drowned Quarter. The Forgotten were dockworkers and fishers left behind when The Way over-extracted the aquifers. They coat blades in tide toxins and remember every name The Way abandoned. Cinder, Greyvial, and Permafrost still walk those flats.',
        },
        { type: 'goto', objective: 'Reach The Drowned Quarter', targetPos: { x: 4800, z: 4800 }, radius: 200 },
        { type: 'kill', killCount: 5, objective: 'Clear marsh hostiles (0/5)' },
        { type: 'goto', objective: 'Find Tidewatch', targetPos: { x: 4800, z: 4800 }, radius: 50 },
      ],
    },
  ];
}
