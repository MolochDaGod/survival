import * as THREE from 'three';
import { getAllPOIs } from '../../data/sectors';
import type { PrefabSystem } from './PrefabSystem';
import { ISLAND_DOCK_PREFAB } from './IslandDockBootstrap';

/** Convergence Nexus deploy gate — sail / march to any of the nine sectors. */
export const DEPLOY_GATE_PREFAB = ISLAND_DOCK_PREFAB;

export interface DeployGateBootstrapResult {
  placed: boolean;
  center: { x: number; z: number };
  boatSpawn: THREE.Vector3;
}

function resolveDeployGateCenter(): { x: number; z: number } {
  const poi = getAllPOIs().find(p => p.name === 'Deploy Gate');
  if (poi) return { x: poi.worldX, z: poi.worldZ };
  return { x: 0, z: 42 };
}

/**
 * Plant the Viking shipyard dock at the Convergence Deploy Gate POI.
 * The GLB includes hull + water meshes — this is the canonical boarding pier.
 */
export async function bootstrapDeployGate(
  prefabs: PrefabSystem,
): Promise<DeployGateBootstrapResult> {
  const center = resolveDeployGateCenter();
  const inst = await prefabs.place(DEPLOY_GATE_PREFAB, center.x, center.z, {
    ry: 0,
    scale: 6,
    collide: false,
  });

  // Boarding point sits in the shipyard water channel, slightly south of the pier root.
  const boatSpawn = new THREE.Vector3(center.x, 0, center.z + 8);

  if (inst) {
    console.info(
      `[DeployGate] Viking shipyard @ (${center.x}, ${center.z}) ← ${DEPLOY_GATE_PREFAB}`,
    );
  } else {
    console.warn(`[DeployGate] Failed to place ${DEPLOY_GATE_PREFAB} at deploy gate`);
  }

  return { placed: !!inst, center, boatSpawn };
}