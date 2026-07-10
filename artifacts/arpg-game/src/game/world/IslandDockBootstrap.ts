import { WORLD_GRID_SECTORS, type WorldGridSector } from '../../data/worldGridSectors';
import type { PrefabSystem } from './PrefabSystem';

/** Canonical boat-dock GLB for home + sector town islands. */
export const ISLAND_DOCK_PREFAB = 'viking_shipyard';

export const ISLAND_DOCK_PATH = 'models/prefabs/viking_shipyard.glb';

/** South-edge offset from each grid sector center (m) — pier faces open water. */
export function dockOffsetSouth(grid: WorldGridSector): number {
  return grid.isSafeZone ? 280 : 200;
}

export function dockScaleForGrid(grid: WorldGridSector): number {
  return grid.isSafeZone ? 6 : 5;
}

export interface IslandDockPlacement {
  gridId: string;
  name: string;
  x: number;
  z: number;
  isHomeIsland: boolean;
}

export interface IslandDockBootstrapResult {
  placed: number;
  failed: string[];
  placements: IslandDockPlacement[];
}

/**
 * Plant viking_shipyard docks on all 9 sector town/home islands.
 * Home island = Convergence Nexus (safe zone); the other eight are faction capitals.
 */
export async function bootstrapIslandDocks(
  prefabs: PrefabSystem,
): Promise<IslandDockBootstrapResult> {
  const failed: string[] = [];
  const placements: IslandDockPlacement[] = [];
  let placed = 0;

  const jobs = WORLD_GRID_SECTORS.map(async (grid) => {
    const offset = dockOffsetSouth(grid);
    const x = grid.center.x;
    const z = grid.center.z + offset;
    const inst = await prefabs.place(ISLAND_DOCK_PREFAB, x, z, {
      ry: 0,
      scale: dockScaleForGrid(grid),
      collide: false,
    });

    const entry: IslandDockPlacement = {
      gridId: grid.id,
      name: grid.name,
      x,
      z,
      isHomeIsland: !!grid.isSafeZone,
    };
    placements.push(entry);

    if (inst) {
      placed++;
      console.info(
        `[IslandDock] ${grid.name} (${grid.isSafeZone ? 'home' : 'town'}) @ (${x}, ${z})`,
      );
    } else {
      failed.push(`${grid.id}: ${ISLAND_DOCK_PREFAB} load failed`);
    }
  });

  await Promise.all(jobs);
  console.info(`[IslandDock] ${placed}/${WORLD_GRID_SECTORS.length} sector town docks placed`);
  return { placed, failed, placements };
}