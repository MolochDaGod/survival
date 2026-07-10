/**
 * prefabs — repeatable GLB prefab catalog.
 *
 * Each entry is a self-describing record consumed by PrefabSystem to load,
 * clone, place, and (optionally) collide a GLB asset anywhere in the world.
 *
 * Extending: drop a GLB into `public/models/prefabs/` and add a PrefabDef
 * row here. No other file needs to change to make a new prefab placeable.
 *
 * Sourcing: prefabs are expected at `/models/prefabs/<file>` (resolved
 * through `assetUrl()` for the R2 CDN override). PrefabSystem logs a
 * single warning per missing file and skips it — the game keeps running.
 */
export type PrefabKind =
  | 'building'        // Inhabitable structure (smithy, bakery, house, etc.)
  | 'city'            // Large multi-block settlement asset (NPC-populated)
  | 'crafting'        // Standalone crafting station (smeltery, weaponsmith)
  | 'resource_node'   // Harvestable world node (ore, hemp, scrap, log)
  | 'vegetation'      // Decorative scatterable (trees, pines)
  | 'prop'            // Decoration (campfire, stove, shovel, plinth)
  | 'vehicle'         // Drivable / boardable (raft, galleon)
  | 'enemy'           // Hostile creature spawn (spider)
  | 'target'          // Combat training target dummy
  | 'biome_pack'      // Collection-style biome dressing (pirate island)
  | 'terrain_patch'   // GLB terrain chunk blended into procedural heightfield
  | 'material'        // PBR material/shader-pack reference (not placed directly)
  | 'fx'              // VFX prop (explosion, fire, ring effect)
  | 'interactable';   // Single-purpose interaction (caravan = market)

export interface PrefabDef {
  /** Stable id used by code references and the prefab manifest. */
  id: string;
  /** Filename under `public/models/prefabs/` (no leading slash). */
  file: string;
  /** Optional override — full root-relative asset path when not under prefabs/. */
  assetPath?: string;
  /** Gameplay category (see PrefabKind). */
  kind: PrefabKind;
  /** Human-readable label for tooltips and debug overlays. */
  label: string;
  /** Uniform scale applied to the loaded scene. */
  scale: number;
  /** Vertical offset applied AFTER terrain snap (negative sinks into ground). */
  yOffset?: number;
  /** Cuboid collider half-extents in metres `[hw, hh, hd]`, applied at scale=1
   *  then multiplied by `scale`. Omit for walkable / pass-through props. */
  collider?: [number, number, number];
  /** Approximate footprint radius (metres) — used by placement spacing rules. */
  footprint?: number;
  /** Interaction hook id resolved by GameEngine (e.g. 'market', 'craft:smeltery'). */
  interaction?: string;
  /** Free-form tags consumed by selection helpers (`pickPrefab`). */
  tags?: string[];
  /** terrain_patch only — radius (m) of the inner core where the GLB fully
   *  overrides the procedural heightfield. Defaults to `footprint`. */
  patchRadius?: number;
  /** terrain_patch only — width (m) of the outer ring where procedural
   *  heightfield is smoothstepped into the patch's perimeter edge profile.
   *  Defaults to `patchRadius * 0.5`. */
  blendRing?: number;
}

/**
 * Canonical prefab table. Order matters for `pickPrefab` defaults — the
 * first matching tag wins on ties.
 *
 * Scales are conservative starting values calibrated for a player capsule
 * height ~1.8 m. The asset-studio Canvas tab is the recommended workflow
 * for fine-tuning per-asset scale before shipping.
 */
export const PREFABS: PrefabDef[] = [
  // ── Crafting stations ─────────────────────────────────────────────────────
  { id: 'workbench',    file: 'Workbench.gltf',                                           kind: 'crafting',     label: 'Workbench',       scale: 1.0, collider: [0.8, 0.5, 0.5], footprint: 1.2, interaction: 'craft:workbench',  tags: ['craft', 'bench', 'workbench'], assetPath: '/models/props/fantasy_megakit/Exports/glTF/Workbench.gltf' },
  { id: 'smeltery',     file: 'stylized_smeltery_setup.glb',                              kind: 'crafting',     label: 'Smeltery',        scale: 1.6, collider: [2.4, 1.5, 2.4], footprint: 4, interaction: 'craft:smeltery',   tags: ['ore', 'smith', 'fire', 'furnace'], assetPath: '/models/props/fantasy_megakit/Exports/glTF/Anvil_Log.gltf' },
  { id: 'weaponsmith',  file: 'stylized_weaponsmith.glb',                                 kind: 'crafting',     label: 'Weaponsmith',     scale: 1.4, collider: [2.0, 1.4, 2.0], footprint: 4, interaction: 'craft:weaponsmith', tags: ['weapon', 'smith'], assetPath: '/models/props/fantasy_megakit/Exports/glTF/Anvil.gltf' },
  { id: 'bakery',       file: 'stylized_bakery.glb',                                      kind: 'building',     label: 'Bakery',          scale: 1.4, collider: [3.0, 2.0, 3.0], footprint: 5, interaction: 'craft:cooking',     tags: ['food', 'cook'], assetPath: '/models/props/fantasy_megakit/Exports/glTF/Stall_Empty.gltf' },
  { id: 'woodcutter',   file: 'stylised_medieval_buildings_-_woodcutter_hut.glb',         kind: 'building',     label: 'Woodcutter Hut',  scale: 1.4, collider: [2.6, 1.8, 2.6], footprint: 4, interaction: 'craft:woodcutter',  tags: ['wood', 'forest'] },

  // ── Houses / dwellings ────────────────────────────────────────────────────
  { id: 'house_human',  file: 'rts_human_house_lv2_-_proto_series.glb',                   kind: 'building',     label: 'Settler Home',    scale: 1.4, collider: [2.8, 1.8, 2.8], footprint: 5, tags: ['home', 'human'] },
  { id: 'house_orc',    file: 'rts_orc_house_lv2_-_proto_series.glb',                     kind: 'building',     label: 'Orc Dwelling',    scale: 1.4, collider: [2.8, 1.8, 2.8], footprint: 5, tags: ['home', 'orc', 'hollow_lords'] },

  // ── Settlements & big landmarks ───────────────────────────────────────────
  { id: 'medieval_city', file: 'medieval_modular_city_realistic_-_wip.glb',               kind: 'city',         label: 'Modular City',    scale: 1.0, footprint: 60, tags: ['city', 'capital', 'npc'] },
  { id: 'pirate_island', file: 'stylized_pirate_island_pack__low_poly_3d_assets.glb',     kind: 'biome_pack',   label: 'Pirate Island',   scale: 1.0, footprint: 40, tags: ['coast', 'pirate'] },

  // ── Vehicles / boats ──────────────────────────────────────────────────────
  { id: 'viking_shipyard', file: 'viking_shipyard.glb',                                   kind: 'building',     label: 'Viking Shipyard', scale: 6.0, footprint: 55, interaction: 'gate:deploy',     tags: ['boat', 'shipyard', 'deploy', 'dock', 'gate', 'viking'] },
  { id: 'galleon',      file: 'galleon.glb',                                              kind: 'vehicle',      label: 'Galleon',         scale: 1.2, collider: [5, 3, 12], footprint: 14, interaction: 'vehicle:galleon', tags: ['boat', 'ship', 'pirate'] },
  { id: 'raft',         file: 'the_raft.glb',                                             kind: 'vehicle',      label: 'Raft',            scale: 1.0, collider: [1.5, 0.4, 2.0], footprint: 3, interaction: 'vehicle:raft',    tags: ['boat', 'starter'] },

  // ── Caravan = mobile market / auction node ────────────────────────────────
  { id: 'caravan',      file: 'stylized_caravan.glb',                                     kind: 'interactable', label: 'Trade Caravan',   scale: 1.2, collider: [2.0, 1.6, 4.0], footprint: 5, interaction: 'market:auction',  tags: ['market', 'auction', 'vendor', 'travel'] },

  // ── Resource nodes ────────────────────────────────────────────────────────
  { id: 'ore_crystals', file: 'ore_and_crystals.glb',                                     kind: 'resource_node', label: 'Crystal Vein',   scale: 1.1, collider: [1.0, 0.8, 1.0], footprint: 1.5, tags: ['ore', 'crystal', 'mining'] },
  { id: 'tree_log',     file: 'low_poly_tree_log_and_stump.glb',                          kind: 'resource_node', label: 'Fallen Log',     scale: 1.0, collider: [0.8, 0.4, 1.8], footprint: 2,   tags: ['wood', 'log'] },
  { id: 'hemp',         file: 'hemp.glb',                                                 kind: 'resource_node', label: 'Hemp Plant',     scale: 1.0, footprint: 0.8, tags: ['fiber', 'plant', 'farm'] },
  { id: 'scrap_pile',   file: 'pile_of_scrap_metal_tools_rubbish_garbage.glb',            kind: 'resource_node', label: 'Scrap Pile',     scale: 1.0, collider: [1.2, 0.6, 1.2], footprint: 1.6, tags: ['scrap', 'metal', 'junkyards'] },

  // ── Vegetation packs ──────────────────────────────────────────────────────
  { id: 'pines_snowy',  file: 'snowy_pine_trees_pack__ps1_low_poly.glb',                  kind: 'vegetation',   label: 'Snowy Pines',     scale: 1.0, footprint: 1.2, tags: ['tree', 'snow', 'cold', 'snowpeak'] },
  { id: 'tree_stylized',file: 'stylize22d_tree.glb',                                      kind: 'vegetation',   label: 'Stylized Tree',   scale: 1.0, footprint: 1.0, tags: ['tree', 'forest'] },
  { id: 'plants_set',   file: 'plants_asset_set.glb',                                     kind: 'vegetation',   label: 'Plants Set',      scale: 1.0, footprint: 0.8, tags: ['plant', 'forest', 'grass', 'scatter'] },

  // ── Modular building kits ────────────────────────────────────────────────
  { id: 'brick_wall',   file: 'medieval_wall_of_bricks_assets.glb',                       kind: 'building',     label: 'Brick Wall Kit',  scale: 1.0, collider: [2.0, 1.5, 0.4], footprint: 2.5, tags: ['wall', 'brick', 'modular', 'fortification'], assetPath: '/models/props/fantasy_megakit/Exports/glTF/Barrel_Holder.gltf' },

  // ── Population / city dressing ──────────────────────────────────────────
  { id: 'populate',     file: 'populate_models.glb',                                      kind: 'biome_pack',   label: 'Population Set',  scale: 1.0, footprint: 8, tags: ['npc', 'city', 'crowd', 'dressing'] },

  // ── Decoration props ──────────────────────────────────────────────────────
  { id: 'campfire',     file: 'campfire_fbx.glb',                                         kind: 'prop',         label: 'Campfire',        scale: 1.0, footprint: 0.7, interaction: 'campfire',          tags: ['fire', 'camp'], assetPath: '/models/props/fantasy_megakit/Exports/glTF/Torch_Metal.gltf' },
  { id: 'camp_stove',   file: 'camping_stove.glb',                                        kind: 'prop',         label: 'Camp Stove',      scale: 1.0, footprint: 0.4, interaction: 'craft:cooking',     tags: ['cook', 'camp'], assetPath: '/models/props/fantasy_megakit/Exports/glTF/Cauldron.gltf' },
  { id: 'camp_shovel',  file: 'camping_shovel.glb',                                       kind: 'prop',         label: 'Shovel',          scale: 1.0, footprint: 0.3, tags: ['tool', 'camp'] },
  { id: 'plinth',       file: 'low_poly_hand_painted_dungeon_plinth.glb',                 kind: 'prop',         label: 'Stone Plinth',    scale: 1.0, collider: [0.5, 0.6, 0.5], footprint: 0.6, tags: ['dungeon', 'altar'], assetPath: '/models/props/fantasy_megakit/Exports/glTF/BookStand.gltf' },
  { id: 'fruits_veg',   file: 'lowpoly_fruits__vegetables.glb',                           kind: 'resource_node',label: 'Fruits & Veg',    scale: 1.0, footprint: 0.5, interaction: 'forage', tags: ['food', 'farm', 'forage', 'plant'] },

  // ── Combat / training ─────────────────────────────────────────────────────
  { id: 'rts_target',   file: 'rts_target.glb',                                           kind: 'target',       label: 'Training Dummy',  scale: 1.0, collider: [0.4, 1.0, 0.4], footprint: 0.6, interaction: 'training_dummy', tags: ['training', 'combat'], assetPath: '/models/props/fantasy_megakit/Exports/glTF/Dummy.gltf' },

  // ── Enemies ───────────────────────────────────────────────────────────────
  { id: 'spider',          file: 'spider._low_poly.glb',                                  kind: 'enemy',        label: 'Cave Spider',     scale: 1.0, collider: [0.6, 0.4, 0.6], footprint: 1.0, tags: ['spider', 'cave', 'pit', 'hostile'] },
  { id: 'stealth_wasp',    file: 'stealth_wasp_2.0.glb',                                  kind: 'enemy',        label: 'Stealth Wasp',    scale: 1.0, collider: [0.5, 0.4, 0.5], footprint: 0.8, tags: ['insect', 'flying', 'hostile'] },
  { id: 'skeleton',        file: 'skeleton.glb',                                          kind: 'enemy',        label: 'Skeleton',        scale: 1.0, collider: [0.45, 0.95, 0.45], footprint: 0.7, tags: ['undead', 'humanoid', 'hostile', 'crypt'] },
  { id: 'skeleton_axe',    file: 'free_skeleton_man_axe.glb',                             kind: 'enemy',        label: 'Skeleton Axeman',  scale: 1.0, collider: [0.45, 0.95, 0.45], footprint: 0.7, tags: ['undead', 'humanoid', 'hostile', 'axe'] },
  { id: 'skeleton_sword',  file: 'free_skeleton_swordman.glb',                            kind: 'enemy',        label: 'Skeleton Swordsman', scale: 1.0, collider: [0.45, 0.95, 0.45], footprint: 0.7, tags: ['undead', 'humanoid', 'hostile', 'sword'] },
  { id: 'ncr_ranger',      file: 'ncr_ranger-fallout.glb',                                kind: 'enemy',        label: 'NCR Ranger',       scale: 1.0, collider: [0.45, 0.95, 0.45], footprint: 0.7, tags: ['humanoid', 'hostile', 'ranger', 'wasteland'] },

  // ── Terrain patches (GLB tiles blended into procedural heightfield) ───────
  // Scale + patchRadius are tuned for the 20 km world. Each patch is loaded
  // by TerrainPatchSystem which samples its perimeter heights and blends
  // outward into the procedural worldHeight() via blendRing.
  { id: 'terrain_quick',     file: 'free_quick_terrain_test.glb',                         kind: 'terrain_patch', label: 'Quick Terrain Test',  scale: 1.0, patchRadius: 80,  blendRing: 40, footprint: 120, tags: ['terrain', 'test'] },
  { id: 'terrain_snow_mtn',  file: 'snowy_mountain_-_terrain.glb',                        kind: 'terrain_patch', label: 'Snowy Mountain',      scale: 1.0, patchRadius: 200, blendRing: 80, footprint: 280, tags: ['terrain', 'snow', 'mountain', 'cold'] },
  { id: 'terrain_cg_misty',  file: 'chicken_gun_mistytown.glb',                           kind: 'terrain_patch', label: 'Misty Town Map',      scale: 1.0, patchRadius: 110, blendRing: 50, footprint: 160, tags: ['terrain', 'town', 'misty', 'cg'] },
  { id: 'terrain_cg_western',file: 'chicken_gun_western_reupload.glb',                    kind: 'terrain_patch', label: 'Western Town Map',    scale: 1.0, patchRadius: 130, blendRing: 60, footprint: 190, tags: ['terrain', 'town', 'western', 'cg', 'desert'] },
  { id: 'terrain_cg_encamp', file: 'chicken_gun_fruzer_-_encampment.glb',                 kind: 'terrain_patch', label: 'Fruzer Encampment',   scale: 1.0, patchRadius: 110, blendRing: 50, footprint: 160, tags: ['terrain', 'camp', 'cg'] },
  { id: 'terrain_cg_bigfarm',file: 'chicken_gun_bigfarm_full_map.glb',                    kind: 'terrain_patch', label: 'Big Farm Map',        scale: 1.0, patchRadius: 160, blendRing: 70, footprint: 230, tags: ['terrain', 'farm', 'rural', 'cg'] },
  { id: 'terrain_cg_town2f', file: 'chicken_gun_town2f_reupload.glb',                     kind: 'terrain_patch', label: 'Town 2F Map',         scale: 1.0, patchRadius: 140, blendRing: 60, footprint: 200, tags: ['terrain', 'town', 'cg'] },
  { id: 'terrain_cg_town3f', file: 'town3f2_chicken_gun_map_reupload.glb',                kind: 'terrain_patch', label: 'Town 3F Map',         scale: 1.0, patchRadius: 160, blendRing: 70, footprint: 230, tags: ['terrain', 'town', 'cg'] },

  // ── Enemy camps (procedural mission nodes, 200–500 m from player) ────────
  { id: 'enemy_camp', file: 'stylized_enemy_camp_scene.glb',                         kind: 'building',     label: 'Enemy Camp',      scale: 1.0, collider: [9, 2.5, 9], footprint: 18, interaction: 'mission:enemy_camp', tags: ['camp', 'hostile', 'mission', 'event'] },

  // ── Big-landmark sceneries (placed like a city, not blended) ──────────────
  { id: 'post_apoc_city',  file: 'post-apocalyptic_city.glb',                             kind: 'city',         label: 'Post-Apoc City',  scale: 1.0, footprint: 80, tags: ['city', 'ruin', 'wasteland'] },
  { id: 'city_pack_free',  file: 'city_pack_free.glb',                                    kind: 'city',         label: 'City Pack',       scale: 1.0, footprint: 60, tags: ['city', 'npc', 'modular'] },
  { id: 'snowy_village',   file: 'snowy_village__ps1_environment.glb',                    kind: 'city',         label: 'Snowy Village',   scale: 1.0, footprint: 50, tags: ['village', 'snow', 'cold', 'ps1'] },
  { id: 'training_gym',    file: 'training_gym.glb',                                      kind: 'building',     label: 'Training Gym',    scale: 1.0, collider: [6, 2.5, 6], footprint: 8, interaction: 'training_gym', tags: ['training', 'combat', 'xp'] },
  { id: 'temple_ancient',  file: 'ancient_x_temple-i.glb',                                kind: 'building',     label: 'Ancient Temple',  scale: 1.0, collider: [8, 4, 8], footprint: 14, tags: ['temple', 'dungeon', 'lore'] },
  { id: 'anta_grande',     file: 'anta_grande_do_zambujeiro.glb',                         kind: 'building',     label: 'Anta Grande',     scale: 1.0, collider: [4, 3, 4], footprint: 8, tags: ['ruin', 'megalith', 'lore'] },

  // ── Industrial / urban kits ──────────────────────────────────────────────
  { id: 'psx_industrial',  file: 'psx_industrial_pack.glb',                               kind: 'biome_pack',   label: 'PSX Industrial',  scale: 1.0, footprint: 8, tags: ['industrial', 'urban', 'modular', 'ps1'] },

  // ── Resource nodes (additional crystal pack) ─────────────────────────────
  { id: 'crystal_gems',    file: 'stylized_crystal_gem_pack_-_handpainted.glb',           kind: 'resource_node',label: 'Crystal Gems',    scale: 1.0, collider: [0.8, 0.6, 0.8], footprint: 1.2, tags: ['crystal', 'gem', 'mining', 'hand_painted'] },

  // ── PBR / material references ────────────────────────────────────────────
  // Material packs aren't placed as world props — they're consumed by the
  // material system or the asset studio for shader extraction. Registering
  // them here lets us discover/preview them via the prefab manifest.
  { id: 'mat_medieval_pbr',  file: 'medieval_pbr_materials_by_jungle_jim.glb',            kind: 'material',     label: 'Medieval PBR Mats',   scale: 1.0, tags: ['pbr', 'medieval', 'material'] },
  { id: 'mat_jungle_pbr',    file: 'jungle_jims_pbr_surface_materials.glb',               kind: 'material',     label: 'Jungle PBR Surfaces', scale: 1.0, tags: ['pbr', 'jungle', 'material', 'surface'] },
  { id: 'mat_biomasse',      file: 'pbr_material_biomasse.glb',                           kind: 'material',     label: 'Biomass PBR',         scale: 1.0, tags: ['pbr', 'organic', 'biomass'] },
  { id: 'mat_sand_proc',     file: 'sand_04d_procedural_material.glb',                    kind: 'material',     label: 'Procedural Sand',     scale: 1.0, tags: ['pbr', 'desert', 'sand', 'procedural'] },
  { id: 'mat_lava_disp',     file: 'stylized_lava_with_displacement_nodevember_day_1.glb',kind: 'material',     label: 'Lava w/ Displacement',scale: 1.0, tags: ['lava', 'displacement', 'volcanic', 'stylized'] },
  { id: 'mat_pbr_ground',    file: 'pbr-ground_grass.glb',                                kind: 'material',     label: 'PBR Ground Grass',    scale: 1.0, tags: ['pbr', 'ground', 'grass', 'surface'] },

  // ── VFX (placed in world by AbilitySystem / DeathFX) ─────────────────────
  { id: 'fx_sphere_explosion', file: 'sphere_explosion.glb',                              kind: 'fx',           label: 'Sphere Explosion',    scale: 1.0, tags: ['vfx', 'explosion', 'aoe'] },
];

/** Lookup a prefab by id. Returns undefined for unknown ids. */
export function getPrefab(id: string): PrefabDef | undefined {
  return PREFABS.find(p => p.id === id);
}

/** All prefabs in a given gameplay category. */
export function prefabsOfKind(kind: PrefabKind): PrefabDef[] {
  return PREFABS.filter(p => p.kind === kind);
}

/**
 * Select prefabs by tag. Useful for biome-aware scatter and faction-themed
 * settlements (e.g. `pickPrefabs(['snow'])` → snowy pines only).
 */
export function pickPrefabs(tags: string[]): PrefabDef[] {
  if (tags.length === 0) return PREFABS;
  return PREFABS.filter(p => p.tags?.some(t => tags.includes(t)));
}

/** Canonical public path for a prefab asset (no `assetUrl()` applied). */
export function prefabPath(def: PrefabDef): string {
  return def.assetPath ?? `/models/prefabs/${def.file}`;
}
