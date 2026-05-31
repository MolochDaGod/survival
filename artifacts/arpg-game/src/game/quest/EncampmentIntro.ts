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
        dialog: 'Welcome, survivor. This camp is the last holdout. Meet our Quartermaster for supplies, check the Vault for safekeeping, then see Battle Master Rokar when you\u2019re ready to fight.',
      },
      {
        type: 'talk',
        npcId: 'npc_vendor',
        objective: 'Visit the Quartermaster',
        dialog: 'Here\u2019s the deal \u2014 I sell what I salvage. Browse freely. First purchase is on the house.',
      },
      {
        type: 'talk',
        npcId: 'npc_bank',
        objective: 'Secure your supplies at the Vault',
        dialog: 'Store anything you can\u2019t afford to lose. The vault holds through raids.',
      },
      {
        type: 'talk',
        npcId: 'npc_battlemaster',
        objective: 'Report to Battle Master Rokar',
        dialog: 'So Voss sent you. Good. Let\u2019s see what you\u2019re made of. I\u2019ll send a few hostiles your way \u2014 survive, and you\u2019ve earned your place.',
        onComplete: () => {
          // Spawn 3 enemies at the battle arena position
          const arenaX = cx + BATTLE_ARENA_OFFSET.x;
          const arenaZ = cz + BATTLE_ARENA_OFFSET.z;
          for (let i = 0; i < 3; i++) {
            const angle = (i / 3) * Math.PI * 2;
            const spawnX = arenaX + Math.cos(angle) * 4;
            const spawnZ = arenaZ + Math.sin(angle) * 4;
            // Use a delayed spawn so enemies don't pop in on top of the NPC
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
        dialog: 'Not bad, survivor. You\u2019ve earned your place in this camp. The real fight starts outside those walls.',
      },
    ],
  };
}
