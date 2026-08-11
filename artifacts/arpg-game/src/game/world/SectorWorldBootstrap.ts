import { SECTORS } from '../../data/sectors';
import type { TerrainPatchSystem } from './TerrainPatchSystem';

/**
 * Maps sector anchor GLB filenames → terrain_patch prefab ids.
 * Canonical chicken-gun + city maps used for 9-sector hybrid world.
 */
const SECTOR_GLB_TO_PREFAB: Record<string, string> = {
  'chicken_gun_western_reupload.glb': 'terrain_cg_western',
  'chicken_gun_town2f_reupload.glb': 'terrain_cg_town2f',
  'chicken_gun_bigfarm_full_map.glb': 'terrain_cg_bigfarm',
  'chicken_gun_mistytown.glb': 'terrain_cg_misty',
  'chicken_gun_fruzer_-_encampment.glb': 'terrain_cg_encamp',
  /** City-scale map (player-authored starting zone city kit). */
  'town3f2_chicken_gun_map_reupload.glb': 'terrain_cg_town3f',
  'town3f2.glb': 'terrain_cg_town3f',
};

export interface SectorBootstrapOpts {
  /**
   * When true (starter encampment GLB loaded at origin), skip planting a
   * chicken-gun sector patch inside the origin safe radius so the city
   * map colliders are not double-stacked with a second GLB.
   */
  skipOrigin?: boolean;
  /** Metres from (0,0) treated as starter footprint. Default 250. */
  originSkipRadius?: number;
}

export interface SectorBootstrapResult {
  placed: number;
  failed: string[];
  skipped: string[];
}

/**
 * Plant all nine grid-sector anchor maps at their world centres. Each GLB blends
 * into the procedural heightfield via TerrainPatchSystem.
 */
export async function bootstrapSectorMaps(
  patches: TerrainPatchSystem,
  opts: SectorBootstrapOpts = {},
): Promise<SectorBootstrapResult> {
  const failed: string[] = [];
  const skipped: string[] = [];
  let placed = 0;
  const originR = opts.originSkipRadius ?? 250;
  const originR2 = originR * originR;

  const jobs = SECTORS.map(async (sector) => {
    if (opts.skipOrigin) {
      const d2 = sector.center.x * sector.center.x + sector.center.z * sector.center.z;
      if (d2 < originR2) {
        skipped.push(`${sector.id}: origin covered by starter encampment GLB`);
        return;
      }
    }

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
  console.info(
    `[SectorWorld] ${placed} placed, ${skipped.length} skipped origin, ` +
      `${failed.length} failed (of ${SECTORS.length} sectors)`,
  );
  return { placed, failed, skipped };
}
