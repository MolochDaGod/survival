/**
 * SurvivalRemakeBootstrap — post-world remake orchestration for
 * https://grudges.grudge-studio.com/arpg-game/
 *
 * Runs once after SceneBuilder + player + camp systems are live:
 *   1. Force TPS camera defaults
 *   2. Apply TPS tuning constants
 *   3. Ensure hybrid world flags + middle camp
 *   4. Optional arrival cinema
 *   5. Log remake scale / systems status
 */

import * as THREE from 'three';
import type { PlayerController } from '../PlayerController';
import type { SceneBuilder } from '../SceneBuilder';
import type { CampClaimSystem } from '../survival/camp/CampClaimSystem';
import type { CinemaDirector } from '../cinema/CinemaDirector';
import type { GameModeController } from '../mode/GameModeController';
import { TUNING_THIRD_PERSON } from '../ThirdPersonCamera';
import {
  PLAYER_HEIGHT_M,
  REMAKE_DEFAULT_CAMERA,
  REMAKE_SPAWN_LORE,
  TUNING_TPS,
  WORLD_HALF_EXTENT_M,
} from './SurvivalRemakeConfig';
import { INTRO_TITLE_CARDS } from '../lore/LoreCodex';
import { engineAssets } from '../EngineAssets';

export interface RemakeBootstrapContext {
  player: PlayerController;
  sceneBuilder: SceneBuilder;
  campClaim?: CampClaimSystem | null;
  cinema?: CinemaDirector | null;
  gameMode?: GameModeController | null;
  /** Play arrival cinema once (fresh session). */
  playArrivalCinema?: boolean;
}

export interface RemakeBootstrapResult {
  camera: string;
  starterMap: boolean;
  campClaimed: boolean;
  worldHalfExtentM: number;
  playerHeightM: number;
  lore: typeof REMAKE_SPAWN_LORE;
}

/**
 * Apply remake defaults. Safe to call once after player construction.
 */
export function runSurvivalRemakeBootstrap(
  ctx: RemakeBootstrapContext,
): RemakeBootstrapResult {
  const { player, sceneBuilder, campClaim, cinema, gameMode } = ctx;

  // 1. TPS default — remake is a third-person shooter, not ARPG camera
  if (player.cameraMode !== REMAKE_DEFAULT_CAMERA) {
    player.setCameraMode(REMAKE_DEFAULT_CAMERA);
  }

  // 2. Apply TPS tuning (over-the-shoulder best practices).
  // Prefer remake constants; overlay EngineAssets camera profile when present
  // (server manifest can nudge shoulder / FOV without a client redeploy).
  const camProfile = engineAssets.getCameraForMode('third-person');
  const shoulder = camProfile?.shoulderOffset ?? TUNING_TPS.idealOffset.x;
  TUNING_THIRD_PERSON.idealOffset.set(
    shoulder,
    TUNING_TPS.idealOffset.y,
    TUNING_TPS.idealOffset.z,
  );
  TUNING_THIRD_PERSON.idealLookat.set(
    TUNING_TPS.idealLookat.x,
    TUNING_TPS.idealLookat.y,
    TUNING_TPS.idealLookat.z,
  );
  TUNING_THIRD_PERSON.follow = TUNING_TPS.follow;
  TUNING_THIRD_PERSON.look = TUNING_TPS.look;

  // Seed hip FOV from manifest if provided
  if (camProfile?.fov && player.camera) {
    player.camera.fov = camProfile.fov;
    player.camera.updateProjectionMatrix();
  }

  // 3. Free play mode (combat + harvest hybrid)
  gameMode?.set('free');

  // 4. Optional arrival cinema with compendium title cards (video intro beats)
  if (ctx.playArrivalCinema && cinema) {
    gameMode?.set('cinema');
    cinema.playArrival(player.position.clone(), 5.2, INTRO_TITLE_CARDS);
  }

  const starterMap = sceneBuilder.isStarterMapMode?.() ?? false;
  const campClaimed = campClaim?.isClaimed() ?? false;

  const result: RemakeBootstrapResult = {
    camera: REMAKE_DEFAULT_CAMERA,
    starterMap,
    campClaimed,
    worldHalfExtentM: WORLD_HALF_EXTENT_M,
    playerHeightM: PLAYER_HEIGHT_M,
    lore: REMAKE_SPAWN_LORE,
  };

  console.info(
    `[SurvivalRemake] Boot · TPS=${result.camera} · starterMap=${starterMap} · ` +
      `camp=${campClaimed} · world±${WORLD_HALF_EXTENT_M}m · height=${PLAYER_HEIGHT_M}m`,
  );
  console.info(`[SurvivalRemake] ${REMAKE_SPAWN_LORE.title}: ${REMAKE_SPAWN_LORE.line}`);

  return result;
}

/** Utility: ground a world position for deploy / camp markers. */
export function remakeGroundAt(
  x: number,
  z: number,
  sample: (x: number, z: number) => number,
): THREE.Vector3 {
  return new THREE.Vector3(x, sample(x, z), z);
}
