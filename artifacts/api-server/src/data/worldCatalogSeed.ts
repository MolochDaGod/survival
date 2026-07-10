/**
 * Canonical seed for D1 gn_sectors / gn_islands / asset furnishing.
 * SSOT aligned with arpg-game worldGridSectors + sectors + sectorCanon.
 */

const CDN = 'https://assets.grudge-studio.com';
const NEXUS = `${CDN}/grudge-nexus`;

export interface SeedVfx {
  telegraph: number;
  meleeSlash: number;
  rangedTrail: number;
  magicCore: number;
  impact: number;
  arcScale: number;
}

export interface SeedSector {
  id: string;
  territoryId: string | null;
  name: string;
  gridCol: number;
  gridRow: number;
  centerX: number;
  centerZ: number;
  factionId: string | null;
  isSafeZone: boolean;
  terrainPalette: string;
  biomeBias: string;
  glbMap: string;
  description: string;
  lore: string;
  flow: { title: string; subtitle: string; objective: string };
  vfx: SeedVfx;
  hostiles: string[];
  harvestWeights: Record<string, number>;
  campBodies: string[];
  fauna: string[];
  resources: string[];
}

export interface SeedIsland {
  id: string;
  sectorId: string;
  slug: string;
  name: string;
  kind: 'capital' | 'camp' | 'dungeon' | 'boss' | 'harvest' | 'gate' | 'safe' | 'wild';
  centerX: number;
  centerZ: number;
  radiusM: number;
  sceneGlb: string;
  platformGlb: string;
  textureSet: string;
  biomeTag: string;
}

const DEFAULT_VFX: SeedVfx = {
  telegraph: 0xff8844,
  meleeSlash: 0xffcc66,
  rangedTrail: 0xaaddff,
  magicCore: 0xcc66ff,
  impact: 0xffeedd,
  arcScale: 1,
};

const GRID_SPAN = 20000 / 3;
const gridCenter = (col: number, row: number) => ({
  centerX: -10000 + GRID_SPAN * 0.5 + col * GRID_SPAN,
  centerZ: -10000 + GRID_SPAN * 0.5 + row * GRID_SPAN,
});

function mapUrl(filename: string): string {
  return `${CDN}/${filename}`;
}

function islandPlatform(): string {
  return `${CDN}/models/island/platform.glb`;
}

function islandDockUrl(): string {
  return `${NEXUS}/models/prefabs/viking_shipyard.glb`;
}

function islandTexture(biome: string): string {
  const map: Record<string, string> = {
    tundra: `${CDN}/models/island/Textures/colormap.png`,
    highland: `${CDN}/models/island/Textures/colormap.png`,
    desert: `${CDN}/models/island/patch-sand.glb`,
    swamp: `${CDN}/models/island/patch-grass-foliage.glb`,
    default: `${CDN}/models/island/grass-patch.glb`,
    coast: `${CDN}/models/island/patch-sand-foliage.glb`,
    wreckage: `${CDN}/models/island/rocks-b.glb`,
    pit: `${CDN}/models/island/rocks-a.glb`,
    town: `${CDN}/models/island/platform-planks.glb`,
  };
  return map[biome] ?? map.default;
}

export const SEED_SECTORS: SeedSector[] = [
  {
    id: 'grid_nw_wilds', territoryId: 'frostbite_fringe', name: 'Frostbite Fringe',
    gridCol: 0, gridRow: 0, ...gridCenter(0, 0), factionId: 'keepers', isSafeZone: false,
    terrainPalette: 'tundra', biomeBias: 'highland',
    glbMap: 'chicken_gun_western_reupload.glb',
    description: 'NW wildlands — permafrost ridges.',
    lore: 'Keeper patrols mark prayer stones on the ice fringe.',
    flow: { title: 'Frostbite Fringe', subtitle: 'Keeper wildlands', objective: 'Harvest permafrost shards and clear the shrine camp' },
    vfx: { ...DEFAULT_VFX, telegraph: 0x88ccff, meleeSlash: 0xccddff, magicCore: 0x66aaff, arcScale: 1.1 },
    hostiles: ['highland_wolf', 'skeleton_swordman', 'cave_troll'],
    harvestWeights: { iron_ore: 1.4, crystal_node: 1.2, permafrost_ore: 1.8, wild_herbs: 0.8, frozen_pond: 1.5 },
    campBodies: ['medieval', 'witch', 'soldier'], fauna: ['mountain_goat', 'cave_bat', 'black_bear'],
    resources: ['permafrost_ore', 'iron_ore', 'crystal_node', 'frozen_pond', 'wild_herbs'],
  },
  {
    id: 'grid_north_uplands', territoryId: 'cathedral_highlands', name: 'Cathedral Highlands',
    gridCol: 1, gridRow: 0, ...gridCenter(1, 0), factionId: 'keepers', isSafeZone: false,
    terrainPalette: 'highland', biomeBias: 'highland',
    glbMap: 'chicken_gun_western_reupload.glb',
    description: 'Mountain shrines and hallowed stone.',
    lore: 'The Keepers hold the high ground.',
    flow: { title: 'Cathedral Highlands', subtitle: 'Hallowed stone', objective: 'Reach Old Cathedral and claim the Bone Altar boss' },
    vfx: { ...DEFAULT_VFX, telegraph: 0xd4b870, meleeSlash: 0xffdd88, magicCore: 0xffaa44 },
    hostiles: ['skeleton_axe', 'skeleton_swordman', 'cave_troll', 'highland_wolf'],
    harvestWeights: { iron_ore: 1.6, copper_deposit: 1.2, wild_herbs: 1.3, crystal_node: 1.4, stone_outcrop: 1.1 },
    campBodies: ['medieval', 'king', 'farmer'], fauna: ['mountain_goat', 'hawk', 'cave_bat', 'black_bear'],
    resources: ['iron_ore', 'copper_deposit', 'wild_herbs', 'timber_log', 'crystal_node', 'stone_outcrop'],
  },
  {
    id: 'grid_ne_scrub', territoryId: 'stormbreak_scrub', name: 'Stormbreak Scrub',
    gridCol: 2, gridRow: 0, ...gridCenter(2, 0), factionId: 'tech_scavengers', isSafeZone: false,
    terrainPalette: 'desert', biomeBias: 'wreckage',
    glbMap: 'chicken_gun_town2f_reupload.glb',
    description: 'Scavenger frontier scrubland.',
    lore: 'Every wreck is a workshop.',
    flow: { title: 'Stormbreak Scrub', subtitle: 'Scavenger frontier', objective: 'Salvage rust pits and scout Scout Point Raven' },
    vfx: { ...DEFAULT_VFX, telegraph: 0xff6644, meleeSlash: 0xff8844, rangedTrail: 0xffaa00, arcScale: 0.9 },
    hostiles: ['rogue_drone', 'miner', 'masked', 'scrap_golem'],
    harvestWeights: { scrap_pile: 1.5, copper_deposit: 1.3, flint_outcrop: 1.1, oil_drum: 1.2, wire_spool: 1.4 },
    campBodies: ['punk', 'worker', 'scifi'], fauna: ['rat_swarm', 'crow_flock', 'junkyard_dog'],
    resources: ['scrap_pile', 'wire_spool', 'copper_deposit', 'oil_drum', 'flint_outcrop'],
  },
  {
    id: 'grid_west_rail', territoryId: 'switchyard', name: 'The Switchyard',
    gridCol: 0, gridRow: 1, ...gridCenter(0, 1), factionId: 'network', isSafeZone: false,
    terrainPalette: 'default', biomeBias: 'grassland',
    glbMap: 'chicken_gun_mistytown.glb',
    description: 'Rail relays and signal towers.',
    lore: 'The Network sells locations.',
    flow: { title: 'The Switchyard', subtitle: 'Rail relays', objective: 'Trade at The Exchange and run the Shadow Den dungeon' },
    vfx: { ...DEFAULT_VFX, telegraph: 0x66ccaa, meleeSlash: 0xaaffcc, rangedTrail: 0x88ffdd },
    hostiles: ['bandit_scout', 'rogue_trader', 'signal_drone', 'wild_dog_pack'],
    harvestWeights: { timber_log: 1.2, wild_herbs: 1.1, flint_outcrop: 1.0, wheat_field: 1.5, clay_deposit: 1.3 },
    campBodies: ['suit', 'casual', 'adventurer'], fauna: ['deer', 'rabbit', 'pheasant', 'wild_horse'],
    resources: ['timber_log', 'wild_herbs', 'flint_outcrop', 'clay_deposit', 'wheat_field'],
  },
  {
    id: 'grid_convergence', territoryId: 'convergence_nexus', name: 'Convergence Nexus',
    gridCol: 1, gridRow: 1, ...gridCenter(1, 1), factionId: null, isSafeZone: true,
    terrainPalette: 'default', biomeBias: 'town',
    glbMap: 'chicken_gun_mistytown.glb',
    description: 'Neutral encampment — five roads meet.',
    lore: 'Safe zone at the world origin.',
    flow: { title: 'Convergence Nexus', subtitle: 'Safe encampment', objective: 'Deploy to a faction sector or resume your last route' },
    vfx: { ...DEFAULT_VFX, telegraph: 0x88ffcc, meleeSlash: 0xffffff, magicCore: 0xccffee, arcScale: 0.8 },
    hostiles: [],
    harvestWeights: { wild_herbs: 0.6, timber_log: 0.5, flint_outcrop: 0.4 },
    campBodies: ['adventurer', 'casual', 'beach'], fauna: ['rabbit', 'deer', 'pheasant'],
    resources: ['wild_herbs', 'timber_log'],
  },
  {
    id: 'grid_east_junk', territoryId: 'junkyards', name: 'The Junkyards',
    gridCol: 2, gridRow: 1, ...gridCenter(2, 1), factionId: 'tech_scavengers', isSafeZone: false,
    terrainPalette: 'desert', biomeBias: 'wreckage',
    glbMap: 'chicken_gun_town2f_reupload.glb',
    description: 'Corrugated steel salvage fields.',
    lore: 'Salvage or be salvaged.',
    flow: { title: 'The Junkyards', subtitle: 'Corrugated steel law', objective: 'Forge at The Workshops and defeat The Crusher boss' },
    vfx: { ...DEFAULT_VFX, telegraph: 0xff4422, meleeSlash: 0xff6622, rangedTrail: 0xffcc00, arcScale: 0.85 },
    hostiles: ['miner', 'masked', 'scrap_golem', 'rogue_drone'],
    harvestWeights: { scrap_pile: 1.8, copper_deposit: 1.5, oil_drum: 1.4, wire_spool: 1.6, flint_outcrop: 1.0 },
    campBodies: ['punk', 'worker', 'scifi'], fauna: ['rat_swarm', 'crow_flock', 'junkyard_dog'],
    resources: ['scrap_pile', 'copper_deposit', 'oil_drum', 'wire_spool', 'flint_outcrop'],
  },
  {
    id: 'grid_sw_marsh', territoryId: 'silt_marshes', name: 'Silt Marshes',
    gridCol: 0, gridRow: 2, ...gridCenter(0, 2), factionId: 'forgotten', isSafeZone: false,
    terrainPalette: 'swamp', biomeBias: 'coast',
    glbMap: 'chicken_gun_fruzer_-_encampment.glb',
    description: 'Forgotten tidal flats.',
    lore: 'Blades coated in toxin.',
    flow: { title: 'Silt Marshes', subtitle: 'Forgotten tide-flats', objective: 'Harvest salt flats and reach Tide Camp Reed' },
    vfx: { ...DEFAULT_VFX, telegraph: 0x44aa66, meleeSlash: 0x66cc88, magicCore: 0x22ff88, arcScale: 1.15 },
    hostiles: ['marsh_lurker', 'poison_frog', 'drowned_dead', 'tide_caller'],
    harvestWeights: { driftwood: 1.3, salt_deposit: 1.2, kelp_bed: 1.5, wild_herbs: 1.4, coral_node: 1.1 },
    campBodies: ['witch', 'beach', 'casual-hoodie'], fauna: ['crab', 'eel', 'saltwater_croc'],
    resources: ['driftwood', 'salt_deposit', 'kelp_bed', 'wild_herbs', 'coral_node'],
  },
  {
    id: 'grid_south_pit', territoryId: 'the_pit', name: 'The Pit',
    gridCol: 1, gridRow: 2, ...gridCenter(1, 2), factionId: 'hollow_lords', isSafeZone: false,
    terrainPalette: 'highland', biomeBias: 'pit',
    glbMap: 'chicken_gun_bigfarm_full_map.glb',
    description: 'Sunken shaft-mouths and warband barracks.',
    lore: 'Iron law rules The Pit.',
    flow: { title: 'The Pit', subtitle: 'Iron law', objective: 'Descend Howling Pit and challenge The Crucible boss' },
    vfx: { ...DEFAULT_VFX, telegraph: 0xff2222, meleeSlash: 0xff4400, impact: 0xffaa44, arcScale: 1.2 },
    hostiles: ['hollow_raider', 'lava_monster', 'pit_worm', 'scarecrow', 'lizard_mule'],
    harvestWeights: { iron_ore: 1.7, coal_seam: 1.8, obsidian_node: 1.5, sulfur_vent: 1.4, stone_outcrop: 1.2 },
    campBodies: ['soldier', 'punk', 'medieval'], fauna: ['cave_spider', 'blind_newt', 'magma_crab', 'black_bear'],
    resources: ['iron_ore', 'coal_seam', 'obsidian_node', 'sulfur_vent', 'stone_outcrop'],
  },
  {
    id: 'grid_se_drowned', territoryId: 'drowned_quarter', name: 'Drowned Quarter',
    gridCol: 2, gridRow: 2, ...gridCenter(2, 2), factionId: 'forgotten', isSafeZone: false,
    terrainPalette: 'swamp', biomeBias: 'coast',
    glbMap: 'chicken_gun_fruzer_-_encampment.glb',
    description: 'Sunken streets and tidal flats.',
    lore: 'The Forgotten move with the water.',
    flow: { title: 'Drowned Quarter', subtitle: 'Sunken streets', objective: 'Clear Sunken Vault and face The Tide Mother' },
    vfx: { ...DEFAULT_VFX, telegraph: 0x2288aa, meleeSlash: 0x44aacc, magicCore: 0x00ccff, arcScale: 1.1 },
    hostiles: ['seaexplorer', 'drowned_dead', 'marsh_lurker', 'tide_caller', 'poison_frog'],
    harvestWeights: { driftwood: 1.6, salt_deposit: 1.5, coral_node: 1.4, kelp_bed: 1.3, wild_herbs: 1.1 },
    campBodies: ['beach', 'witch', 'casual'], fauna: ['crab', 'eel', 'pelican', 'saltwater_croc'],
    resources: ['driftwood', 'salt_deposit', 'coral_node', 'kelp_bed', 'wild_herbs'],
  },
];

/** One capital island per sector at grid center; convergence also gets deploy gate island. */
export function buildSeedIslands(): SeedIsland[] {
  const out: SeedIsland[] = [];
  for (const s of SEED_SECTORS) {
    out.push({
      id: `isle_${s.id}_capital`,
      sectorId: s.id,
      slug: `${s.id}-capital`,
      name: `${s.name} · Capital`,
      kind: s.isSafeZone ? 'safe' : 'capital',
      centerX: s.centerX, centerZ: s.centerZ,
      radiusM: s.isSafeZone ? 800 : 420,
      sceneGlb: mapUrl(s.glbMap),
      platformGlb: islandPlatform(),
      textureSet: islandTexture(s.biomeBias),
      biomeTag: s.biomeBias,
    });
    if (s.id === 'grid_convergence') {
      out.push({
        id: 'isle_grid_convergence_deploy',
        sectorId: s.id,
        slug: 'convergence-deploy-gate',
        name: 'Deploy Gate',
        kind: 'gate',
        centerX: 0, centerZ: 42,
        radiusM: 60,
        sceneGlb: `${NEXUS}/models/prefabs/viking_shipyard.glb`,
        platformGlb: `${CDN}/models/island/platform-planks.glb`,
        textureSet: islandTexture('town'),
        biomeTag: 'town',
      });
    }
  }
  return out;
}

export interface SeedAssetRow {
  sectorId: string;
  assetRole: string;
  assetPath: string;
  publicUrl: string;
  weight: number;
  metadata?: Record<string, unknown>;
}

/** Furnish each sector with map GLB, platform, props, characters, harvestables. */
export function buildSectorAssets(): SeedAssetRow[] {
  const rows: SeedAssetRow[] = [];
  for (const s of SEED_SECTORS) {
    rows.push({
      sectorId: s.id,
      assetRole: 'map_glb',
      assetPath: s.glbMap,
      publicUrl: mapUrl(s.glbMap),
      weight: 1,
    });
    rows.push({
      sectorId: s.id,
      assetRole: 'island_platform',
      assetPath: 'models/island/platform.glb',
      publicUrl: islandPlatform(),
      weight: 1,
    });
    rows.push({
      sectorId: s.id,
      assetRole: 'terrain_texture',
      assetPath: `biome/${s.biomeBias}`,
      publicUrl: islandTexture(s.biomeBias),
      weight: 1,
    });
    for (const body of s.campBodies) {
      rows.push({
        sectorId: s.id,
        assetRole: 'character',
        assetPath: `models/characters/male/${body}.gltf`,
        publicUrl: `${NEXUS}/models/characters/male/${body}.gltf`,
        weight: 1,
        metadata: { bodyType: body },
      });
    }
    for (const [resId, wt] of Object.entries(s.harvestWeights)) {
      rows.push({
        sectorId: s.id,
        assetRole: 'harvestable',
        assetPath: `resource/${resId}`,
        publicUrl: `${NEXUS}/icons/resources/${resId}.png`,
        weight: wt,
        metadata: { resourceId: resId },
      });
    }
    for (const hostile of s.hostiles) {
      rows.push({
        sectorId: s.id,
        assetRole: 'enemy',
        assetPath: `enemy/${hostile}`,
        publicUrl: `${NEXUS}/models/enemies/${hostile}.glb`,
        weight: 1,
        metadata: { enemyType: hostile },
      });
    }
    rows.push({
      sectorId: s.id,
      assetRole: 'boat_dock',
      assetPath: 'models/prefabs/viking_shipyard.glb',
      publicUrl: islandDockUrl(),
      weight: 1,
      metadata: { prefabId: 'viking_shipyard', placement: 'south_edge' },
    });
  }
  return rows;
}

export function buildIslandAssets(islands: SeedIsland[]): Array<{
  islandId: string;
  assetRole: string;
  assetPath: string;
  publicUrl: string;
  scale: number;
}> {
  const rows: Array<{ islandId: string; assetRole: string; assetPath: string; publicUrl: string; scale: number }> = [];
  for (const isl of islands) {
    rows.push({ islandId: isl.id, assetRole: 'scene', assetPath: isl.sceneGlb, publicUrl: isl.sceneGlb, scale: 1 });
    rows.push({ islandId: isl.id, assetRole: 'platform', assetPath: isl.platformGlb, publicUrl: isl.platformGlb, scale: 1 });
    rows.push({ islandId: isl.id, assetRole: 'texture', assetPath: isl.textureSet, publicUrl: isl.textureSet, scale: 1 });
    if (isl.biomeTag === 'coast' || isl.biomeTag === 'town') {
      rows.push({ islandId: isl.id, assetRole: 'prop', assetPath: 'models/island/palm-straight.glb', publicUrl: `${CDN}/models/island/palm-straight.glb`, scale: 1.2 });
    } else if (isl.biomeTag === 'highland' || isl.biomeTag === 'pit') {
      rows.push({ islandId: isl.id, assetRole: 'prop', assetPath: 'models/island/rocks-c.glb', publicUrl: `${CDN}/models/island/rocks-c.glb`, scale: 1 });
    } else {
      rows.push({ islandId: isl.id, assetRole: 'prop', assetPath: 'models/island/grass-plant.glb', publicUrl: `${CDN}/models/island/grass-plant.glb`, scale: 1 });
    }
    if (isl.kind === 'capital' || isl.kind === 'safe' || isl.kind === 'gate') {
      rows.push({
        islandId: isl.id,
        assetRole: 'boat_dock',
        assetPath: 'models/prefabs/viking_shipyard.glb',
        publicUrl: islandDockUrl(),
        scale: isl.kind === 'safe' || isl.kind === 'gate' ? 6 : 5,
      });
    }
  }
  return rows;
}