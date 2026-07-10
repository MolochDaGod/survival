/**
 * Curated Poly Haven assets (CC0) — direct CDN URLs, no API key.
 * https://polyhaven.com
 */

export const POLYHAVEN_CDN = 'https://dl.polyhaven.org/file/ph-assets';

/** Outdoor sky HDR for IBL + background (4k — fast load, full dynamic range). */
export const POLYHAVEN_SKY_HDR = `${POLYHAVEN_CDN}/HDRIs/hdr/kloppenheim_06_puresky_4k.hdr`;

/** Ground PBR sets for arena + lowland terrain tinting. */
export const POLYHAVEN_TERRAIN = {
  grassRock: {
    diff: `${POLYHAVEN_CDN}/textures/jpg/aerial_grass_rock/aerial_grass_rock_diff_2k.jpg`,
    nor: `${POLYHAVEN_CDN}/textures/jpg/aerial_grass_rock/aerial_grass_rock_nor_gl_2k.jpg`,
    rough: `${POLYHAVEN_CDN}/textures/jpg/aerial_grass_rock/aerial_grass_rock_rough_2k.jpg`,
  },
  forestFloor: {
    diff: `${POLYHAVEN_CDN}/textures/jpg/forest_floor/forest_floor_diff_2k.jpg`,
    nor: `${POLYHAVEN_CDN}/textures/jpg/forest_floor/forest_floor_nor_gl_2k.jpg`,
    rough: `${POLYHAVEN_CDN}/textures/jpg/forest_floor/forest_floor_rough_2k.jpg`,
  },
} as const;

/** Nature GLTF models scattered in open-world biomes (Poly Haven CC0, 2k PBR). */
export const POLYHAVEN_NATURE_MODELS = [
  { id: 'pine_tree_01', url: `${POLYHAVEN_CDN}/models/gltf/pine_tree_01/pine_tree_01_2k.gltf`, scale: 2.2, biomes: ['forest', 'highland', 'grassland'] as const },
  { id: 'pine_tree_02', url: `${POLYHAVEN_CDN}/models/gltf/pine_tree_02/pine_tree_02_2k.gltf`, scale: 2.0, biomes: ['forest', 'highland', 'grassland'] as const },
  { id: 'tree_small_02', url: `${POLYHAVEN_CDN}/models/gltf/tree_small_02/tree_small_02_2k.gltf`, scale: 1.6, biomes: ['forest', 'grassland', 'coast'] as const },
  { id: 'tree_small_01', url: `${POLYHAVEN_CDN}/models/gltf/tree_small_01/tree_small_01_2k.gltf`, scale: 1.4, biomes: ['forest', 'grassland', 'farmland'] as const },
  { id: 'dead_tree_04', url: `${POLYHAVEN_CDN}/models/gltf/dead_tree_04/dead_tree_04_2k.gltf`, scale: 1.8, biomes: ['pit', 'wreckage', 'highland'] as const },
  { id: 'dead_tree_02', url: `${POLYHAVEN_CDN}/models/gltf/dead_tree_02/dead_tree_02_2k.gltf`, scale: 1.5, biomes: ['pit', 'wreckage', 'highland'] as const },
  { id: 'rock_07', url: `${POLYHAVEN_CDN}/models/gltf/rock_07/rock_07_2k.gltf`, scale: 1.4, biomes: ['highland', 'grassland', 'coast', 'pit'] as const },
  { id: 'rock_01', url: `${POLYHAVEN_CDN}/models/gltf/rock_01/rock_01_2k.gltf`, scale: 1.2, biomes: ['highland', 'grassland', 'coast'] as const },
  { id: 'boulder_01', url: `${POLYHAVEN_CDN}/models/gltf/boulder_01/boulder_01_2k.gltf`, scale: 2.0, biomes: ['highland', 'coast', 'wreckage'] as const },
  { id: 'boulder_02', url: `${POLYHAVEN_CDN}/models/gltf/boulder_02/boulder_02_2k.gltf`, scale: 1.8, biomes: ['highland', 'pit', 'wreckage'] as const },
  { id: 'fern_02', url: `${POLYHAVEN_CDN}/models/gltf/fern_02/fern_02_2k.gltf`, scale: 0.9, biomes: ['forest', 'coast', 'grassland'] as const },
  { id: 'bush_01', url: `${POLYHAVEN_CDN}/models/gltf/bush_01/bush_01_2k.gltf`, scale: 1.1, biomes: ['forest', 'grassland', 'coast', 'farmland'] as const },
  { id: 'shrub_01', url: `${POLYHAVEN_CDN}/models/gltf/shrub_01/shrub_01_2k.gltf`, scale: 0.8, biomes: ['grassland', 'coast', 'farmland'] as const },
] as const;