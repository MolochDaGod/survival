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

/**
 * Dusty Gulch (Wild West small town) — 4 vendors + 4 neutral guards.
 * Prefab: WildWestTownPrefab.ts · scene wild-west-town.glb
 */
export const ENCAMPMENT_NPCS = [
  {
    id: 'ww_vendor_general',
    label: 'General Store — Sal',
    role: 'vendor' as const,
    talkLine: '"Beans, bullets, and boardwalk gossip. What\'ll it be?"',
    offset: { x: -10, z: -6 },
  },
  {
    id: 'ww_vendor_gun',
    label: 'Gunsmith — Rex',
    role: 'vendor' as const,
    talkLine: '"Keep that iron clean, stranger. Dust don\'t shoot straight."',
    offset: { x: 10, z: -6 },
  },
  {
    id: 'ww_vendor_stable',
    label: 'Stable Hand — Mae',
    role: 'vendor' as const,
    talkLine: '"Horses rest. You rest. Town\'s safe inside the rails."',
    offset: { x: -10, z: 8 },
  },
  {
    id: 'ww_vendor_saloon',
    label: 'Saloonkeep — Dolly',
    role: 'vendor' as const,
    talkLine: '"First drink\'s water. Second\'s your business."',
    offset: { x: 10, z: 8 },
  },
  {
    id: 'ww_guard_n',
    label: 'Town Guard (North)',
    role: 'guard' as const,
    talkLine: '"North gate\'s clear. Stay friendly and we stay friendly."',
    offset: { x: 0, z: -16 },
  },
  {
    id: 'ww_guard_s',
    label: 'Town Guard (South)',
    role: 'guard' as const,
    talkLine: '"You\'re on claimed ground. No claim-jumping."',
    offset: { x: 0, z: 16 },
  },
  {
    id: 'ww_guard_e',
    label: 'Town Guard (East)',
    role: 'guard' as const,
    talkLine: '"Rails mark the friendly zone. Outside, watch your back."',
    offset: { x: 16, z: 0 },
  },
  {
    id: 'ww_guard_w',
    label: 'Town Guard (West)',
    role: 'guard' as const,
    talkLine: '"No building inside the town claim. Sheriff\'s orders."',
    offset: { x: -16, z: 0 },
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
    title: 'Welcome to Dusty Gulch',
    description:
      'Your claimed small town: 4 vendors, 4 neutral guards, friendly zone — no building inside the rails.',
    reward: {
      professionXp: { combat: 50, survival: 30, township: 20 },
      weaponXp: 60,
    },
    steps: [
      {
        type: 'talk',
        npcId: 'ww_vendor_general',
        objective: 'Talk to Sal at the General Store',
        dialog:
          'Welcome to Dusty Gulch. This square is your friendly hold — four shops, four guards on the rails. No building inside the claim. Outside the rails, the world is wild.',
      },
      {
        type: 'talk',
        npcId: 'ww_vendor_gun',
        objective: 'Visit Gunsmith Rex',
        dialog: 'Keep that iron clean. I stock what the town can spare. Friendly ground only — no blood on the boardwalk.',
      },
      {
        type: 'talk',
        npcId: 'ww_guard_n',
        objective: 'Check in with the North Guard',
        dialog: 'Rails mark the safe zone. Hostiles don\'t spawn inside. We\'re neutral until you draw first.',
      },
      {
        type: 'talk',
        npcId: 'ww_guard_s',
        objective: 'Check the South Guard',
        dialog: 'Beyond the claim you\'re on your own. Come back through the gate when you need a vendor.',
        onComplete: () => {
          // Challenge outside the friendly radius (south-east)
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
        objective: 'Clear hostiles outside the rails',
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
