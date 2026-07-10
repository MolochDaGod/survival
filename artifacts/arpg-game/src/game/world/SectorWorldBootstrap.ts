import { SECTORS } from '../../data/sectors';
import type { TerrainPatchSystem } from './TerrainPatchSystem';

/** Maps sector anchor GLB filenames → terrain_patch prefab ids. */
const SECTOR_GLB_TO_PREFAB: Record<string, string> = {
  'chicken_gun_western_reupload.glb': 'terrain_cg_western',
  'chicken_gun_town2f_reupload.glb': 'terrain_cg_town2f',
  'chicken_gun_bigfarm_full_map.glb': 'terrain_cg_bigfarm',
  'chicken_gun_mistytown.glb': 'terrain_cg_misty',
  'chicken_gun_fruzer_-_encampment.glb': 'terrain_cg_encamp',
};

export interface SectorBootstrapResult {
  placed: number;
  failed: string[];
}

/**
 * Plant all nine grid-sector anchor maps at their world centres. Each GLB blends
 * into the procedural heightfield via TerrainPatchSystem.
 */
export async function bootstrapSectorMaps(
  patches: TerrainPatchSystem,
): Promise<SectorBootstrapResult> {
  const failed: string[] = [];
  let placed = 0;

  const jobs = SECTORS.map(async (sector) => {
    const prefabId = SECTOR_GLB_TO_PREFAB[sector.glbMap];
    if (!prefabId) {
      failed.push(`${sector.id}: no prefab for ${sector.glbMap}`);
      return;
    }
    const patch = await patches.place(prefabId, sector.center.x, sector.center.z);
    if (patch) {
      placed++;
      console.info(
        `[SectorWorld] ${sector.name} @ (${sector.center.x}, ${sector.center.z}) ← ${prefabId}`,
      );
    } else {
      failed.push(`${sector.id}: patch load failed (${prefabId})`);
    }
  });

  await Promise.all(jobs);
  console.info(`[SectorWorld] ${placed}/${SECTORS.length} sector anchors placed`);
  return { placed, failed };
}