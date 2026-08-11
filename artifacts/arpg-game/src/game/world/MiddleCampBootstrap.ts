/**
 * MiddleCampBootstrap — SURVIVAL / GRUDGES era only.
 *
 * Plants the starter player camp pad in the middle sector (Convergence Nexus /
 * world origin) so the first session has a clear "build here" site:
 *   • Claim flag position (80 m radius camp authority)
 *   • Campfire + storage + workbench registrations (profession benches)
 *   • Optional tent / foundation structure mass for harvest + AI buffs
 *
 * Does not touch Warlords island / home-block systems.
 *
 * Host: survival.grudge-studio.com · grudges.grudge-studio.com
 */

import * as THREE from 'three';
import type { CampClaimSystem } from '../survival/camp/CampClaimSystem';
import type { PrefabSystem } from './PrefabSystem';
import { groundY } from '../GroundSampler';

/** Offset from encampment / spawn centre — open pad south of hub NPCs. */
export const MIDDLE_CAMP_PAD_OFFSET = { x: 0, z: 10 };

export interface MiddleCampBootstrapOpts {
  /** World centre of the encampment (usually starter spawn). */
  centre: THREE.Vector3;
  campClaim: CampClaimSystem;
  /** When true, plant claim + guardian immediately (fresh start only). */
  autoClaim?: boolean;
  prefabs?: PrefabSystem | null;
  /** Skip if a save already restored a claim. */
  alreadyClaimed?: boolean;
}

export interface MiddleCampBootstrapResult {
  padCenter: THREE.Vector3;
  claimed: boolean;
  structuresRegistered: number;
  prefabsPlaced: number;
}

/**
 * Bootstrap the middle-sector starter camp pad.
 * Safe to call once after CampClaimSystem is constructed.
 */
export async function bootstrapMiddleStarterCamp(
  opts: MiddleCampBootstrapOpts,
): Promise<MiddleCampBootstrapResult> {
  const {
    centre,
    campClaim,
    autoClaim = true,
    prefabs = null,
    alreadyClaimed = false,
  } = opts;

  const padX = centre.x + MIDDLE_CAMP_PAD_OFFSET.x;
  const padZ = centre.z + MIDDLE_CAMP_PAD_OFFSET.z;
  const padY = groundY(padX, padZ);
  const padCenter = new THREE.Vector3(padX, padY, padZ);

  let structuresRegistered = 0;
  let prefabsPlaced = 0;
  let claimed = false;

  // Visual / interactable starter kit (best-effort — missing prefabs are OK)
  if (prefabs) {
    const kit: Array<{ id: string; dx: number; dz: number; ry?: number }> = [
      { id: 'enemy_camp', dx: 0, dz: 0 }, // stylized camp silhouette if available
    ];
    // Prefer small prop prefabs if catalog has them; enemy_camp is fallback scenery.
    for (const piece of kit) {
      try {
        const inst = await prefabs.place(
          piece.id,
          padX + piece.dx,
          padZ + piece.dz,
          { ry: piece.ry ?? 0, scale: 0.55, yOffset: 0 },
        );
        if (inst) prefabsPlaced++;
      } catch {
        /* optional scenery */
      }
    }
  }

  // Register functional camp pieces even without GLBs so buffs/AI work
  const structureSeeds: Array<{ itemId: string; dx: number; dz: number }> = [
    { itemId: 'claim_flag', dx: 0, dz: 0 },
    { itemId: 'campfire', dx: -3.5, dz: 2 },
    { itemId: 'workbench', dx: 3.5, dz: 1.5 },
    { itemId: 'orc_barrel_1', dx: 2.5, dz: -2.5 },
    { itemId: 'build_tent_personal', dx: -4, dz: -2 },
    { itemId: 'mb_foundation', dx: 0, dz: -4 },
  ];

  if (!alreadyClaimed && autoClaim) {
    await campClaim.claimAt(padCenter);
    claimed = true;
    structuresRegistered++;

    for (const seed of structureSeeds) {
      if (seed.itemId === 'claim_flag') continue;
      const p = new THREE.Vector3(padX + seed.dx, padY, padZ + seed.dz);
      campClaim.onStructurePlaced(seed.itemId, p);
      structuresRegistered++;
    }
  } else if (alreadyClaimed) {
    claimed = campClaim.isClaimed();
  } else {
    // Soft register only — player still plants flag via quest / build mode
    for (const seed of structureSeeds) {
      if (seed.itemId === 'claim_flag') continue;
      const p = new THREE.Vector3(padX + seed.dx, padY, padZ + seed.dz);
      campClaim.onStructurePlaced(seed.itemId, p);
      structuresRegistered++;
    }
  }

  console.info(
    `[MiddleCamp] Starter pad @ (${padX.toFixed(1)}, ${padZ.toFixed(1)}) ` +
      `claimed=${claimed} structures=${structuresRegistered} prefabs=${prefabsPlaced}`,
  );

  return { padCenter, claimed, structuresRegistered, prefabsPlaced };
}

/** World position of the recommended claim site (for quests / UI markers). */
export function middleCampPadWorld(centre: THREE.Vector3): THREE.Vector3 {
  const x = centre.x + MIDDLE_CAMP_PAD_OFFSET.x;
  const z = centre.z + MIDDLE_CAMP_PAD_OFFSET.z;
  return new THREE.Vector3(x, groundY(x, z), z);
}
