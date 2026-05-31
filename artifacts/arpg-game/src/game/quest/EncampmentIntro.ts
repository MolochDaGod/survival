/**
 * EncampmentIntro — defines the opening quest sequence and spawns named NPCs
 * at fixed positions within the encampment map.
 *
 * NPC positions are offsets from the encampment centre (the player spawn),
 * based on the annotated map reference image:
 *   - ENTER (south)     — where the player spawns
 *   - Vendor (west)     — orange X on the map
 *   - Faction (north)   — purple X markers
 *   - Bank (west-south) — red X markers
 *   - Battle (south-east) — yellow X markers
 *
 * The intro quest flow:
 *   1. "Welcome to the Encampment" — auto-activates on game start
 *   2. Talk to the Faction Leader (purple) — learn about the world
 *   3. Visit the Vendor (orange) — browse starting gear
 *   4. Check the Bank (red) — secure your supplies
 *   5. Talk to the Battle Master (yellow) — he spawns 3 enemies
 *   6. Kill 3 enemies — the battle challenge
 *   7. Return to Battle Master — collect reward
 */

import * as THREE from 'three';
import type { QuestDef } from './QuestSystem';
import type { EnemyManager } from '../EnemyManager';

// ── Named NPC positions (offsets from encampment centre) ───────────────────
// Based on the annotated top-down map image. The encampment GLB's origin is
// at its centre; these offsets place NPCs at the marked X positions.

export const ENCAMPMENT_NPCS = [
  {
    id: 'npc_vendor',
    label: 'Quartermaster Kael',
    role: 'vendor' as const,
    talkLine: '"Need supplies? I\u2019ve got the best scrap this side of the collapse."',
    /** Offset from encampment centre (metres). West side of camp. */
    offset: { x: -12, z: -5 },
  },
  {
    id: 'npc_faction',
    label: 'Commander Voss',
    role: 'faction' as const,
    talkLine: '"You made it. The Nexus isn\u2019t kind to latecomers. Listen close."',
    offset: { x: 5, z: -15 },
  },
  {
    id: 'npc_bank',
    label: 'Vault Keeper Mira',
    role: 'bank' as const,
    talkLine: '"Your stash is safe with me. Nobody breaches this vault."',
    offset: { x: -15, z: 5 },
  },
  {
    id: 'npc_battlemaster',
    label: 'Battle Master Rokar',
    role: 'battlemaster' as const,
    talkLine: '"Think you\u2019re ready? Prove it. The arena doesn\u2019t forgive."',
    offset: { x: 8, z: 12 },
  },
] as const;

/** Position where the Battle Master spawns enemies (south-east of camp). */
const BATTLE_ARENA_OFFSET = { x: 18, z: 18 };

// ── Intro quest definition ─────────────────────────────────────────────────

export function createIntroQuest(
  encampmentCentre: THREE.Vector3,
  enemyManager: EnemyManager,
): QuestDef {
  const cx = encampmentCentre.x;
  const cz = encampmentCentre.z;

  return {
    id: 'encampment_intro',
    title: 'Welcome to the Encampment',
    description: 'Meet the key people in camp, then prove yourself in the battle arena.',
    reward: {
      professionXp: { combat: 50, survival: 30, township: 20 },
      weaponXp: 60,
    },
    steps: [
      {
        type: 'talk',
        npcId: 'npc_faction',
        objective: 'Talk to Commander Voss',
        dialog: 'Welcome, survivor. This camp is the last holdout against The Way\'s abandonment. Five factions have carved the surface into territories. Meet our Quartermaster for supplies, check the Vault for safekeeping, then see Battle Master Rokar when you\'re ready to fight.',
      },
      {
        type: 'talk',
        npcId: 'npc_vendor',
        objective: 'Visit the Quartermaster',
        dialog: 'Here\'s the deal \u2014 I sell what I salvage from the ruins The Way left behind. Browse freely. First purchase is on the house.',
      },
      {
        type: 'talk',
        npcId: 'npc_bank',
        objective: 'Secure your supplies at the Vault',
        dialog: 'Store anything you can\'t afford to lose. The Hollow Lords raid every season. The vault holds through raids.',
      },
      {
        type: 'talk',
        npcId: 'npc_battlemaster',
        objective: 'Report to Battle Master Rokar',
        dialog: 'So Voss sent you. Good. The surface is unforgiving \u2014 The Way stripped everything and left us to rot. Let\'s see what you\'re made of. I\'ll send a few hostiles your way \u2014 survive, and you\'ve earned your place.',
        onComplete: () => {
          for (let i = 0; i < 3; i++) {
            setTimeout(() => {
              enemyManager.spawnEnemy();
            }, i * 800);
          }
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
        objective: 'Return to Battle Master Rokar',
        dialog: 'Not bad, survivor. You\'ve earned your place in this camp. The real fight is out there \u2014 five factions, five territories. Talk to Voss about which road to take. The Pilgrim Road leads north to the Keepers, the Scrap Highway east to the Scavengers, Descent Road south to The Pit, Rail Line west to the Network, and the Tidal Path southeast to the Forgotten.',
      },
    ],
  };
}

// \u2500\u2500 Sector exploration quests \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
// Unlock after encampment_intro completes. Each sends the player to a
// faction capital to meet their leader and start earning reputation.

export function createSectorQuests(): QuestDef[] {
  return [
    {
      id: 'quest_keepers',
      title: 'The Pilgrim Road',
      description: 'Travel north to the Cathedral Highlands and meet the Keepers of the Old Faith.',
      reward: { professionXp: { survival: 80, gathering: 40 }, weaponXp: 40 },
      steps: [
        { type: 'talk', npcId: 'npc_faction', objective: 'Ask Commander Voss about the Keepers',
          dialog: 'The Keepers hold the highlands north of here. They believe The Way wounded the living land and only hallowed harvest can heal it. Follow the Pilgrim Road \u2014 they\'ll test your faith before your blade.' },
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
        { type: 'talk', npcId: 'npc_faction', objective: 'Ask Commander Voss about the Scavengers',
          dialog: 'East along the Scrap Highway you\'ll find The Junkyards. The Tech-Scavengers were the mechanics who kept The Way\'s machines alive. Now they keep them alive for themselves. Bring scrap \u2014 they respect parts more than words.' },
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
        { type: 'talk', npcId: 'npc_faction', objective: 'Ask Commander Voss about the Hollow Lords',
          dialog: 'South lies The Pit. The Hollow Lords were miners trapped when The Way sealed the elevators. Now they rule by iron law \u2014 rank through strength, oaths in blood. Don\'t go unarmed.' },
        { type: 'goto', objective: 'Reach The Pit', targetPos: { x: 0, z: 6000 }, radius: 200 },
        { type: 'kill', killCount: 8, objective: 'Survive the warband patrols (0/8)' },
        { type: 'goto', objective: 'Find Iron Pit', targetPos: { x: 0, z: 6000 }, radius: 50 },
      ],
    },
    {
      id: 'quest_network',
      title: 'Rail Line West',
      description: 'Travel west to The Switchyard and meet The Network.',
      reward: { professionXp: { survival: 60, township: 60 }, weaponXp: 30,
        items: [{ itemId: 'compass', count: 1 }, { itemId: 'radio', count: 1 }] },
      steps: [
        { type: 'talk', npcId: 'npc_faction', objective: 'Ask Commander Voss about the Network',
          dialog: 'West along the old rail line is The Switchyard. The Network were rail workers who became traders, then intelligence brokers. They never raid \u2014 they sell information. Bring something worth trading.' },
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
        { type: 'talk', npcId: 'npc_faction', objective: 'Ask Commander Voss about the Forgotten',
          dialog: 'Southeast, where the coast floods, you\'ll find The Drowned Quarter. The Forgotten were dockworkers and fishers left behind when The Way over-extracted the aquifers. They coat blades in tide toxins and remember every name The Way abandoned. Tread carefully \u2014 they move with the water.' },
        { type: 'goto', objective: 'Reach The Drowned Quarter', targetPos: { x: 4800, z: 4800 }, radius: 200 },
        { type: 'kill', killCount: 5, objective: 'Clear marsh hostiles (0/5)' },
        { type: 'goto', objective: 'Find Tidewatch', targetPos: { x: 4800, z: 4800 }, radius: 50 },
      ],
    },
  ];
}
