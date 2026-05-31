/**
 * Canonical creature registry for Grudge Nexus.
 *
 * Single source of truth for every spawnable mob in the game. Sourced
 * from `docs/inventory/creatures.csv` (the human-edited design table)
 * and read at runtime by:
 *
 *   • `AssetManager.ENEMY_DEFS`   — filtered to hostile-* roles for the
 *     wave spawner / loader.
 *   • `BiomeSpawnTable`           — derives biome → eligible keys.
 *   • `bestiary.ts`               — auto-synthesizes stub entries when
 *     no curated lore exists for a key.
 *   • `CreatureSpawner` (Phase 2) — picks creatures based on the
 *     player's current biome + active world events.
 *
 * Keys are STABLE — never rename one without updating bestiary.ts +
 * any save data that may reference it. Adding a creature is safe;
 * removing one will leave dead references in old save files.
 *
 * Schema decisions:
 *   • `role` partitions creatures into classes the spawner respects:
 *     - hostile-*    aggro on sight, count toward wave kill quotas.
 *     - huntable-*   passive / flee, drop on death, ambient population.
 *   • `ai` picks the brain archetype. PASSIVE_FLEE / AQUATIC_*  /
 *     HOVER_RANGED / HEAVY_MELEE archetypes are scheduled for Phase 4.
 *   • `biomes` is the canonical 5-biome set ('permafrost',
 *     'glasslands', 'derelict-sprawl', 'anomaly-field', 'cinder-wastes')
 *     plus the special tag 'water' (any water body, biome-agnostic) and
 *     'settlement' (inside an outpost, friendly NPCs only).
 *   • `drops` references canonical item ids; entries marked with `~`
 *     prefix are placeholders awaiting recipes.csv reconciliation.
 *   • `scale` / `yOffset` defaults are conservative — verify visually
 *     per docs/ENEMIES.md §I.1 when first dropped into the test arena.
 */

export type CreatureRole =
  | 'hostile-easy'
  | 'hostile-scifi'
  | 'hostile-mech'
  | 'hostile-other'
  | 'huntable-farm'
  | 'huntable-fish';

export type AIArchetype =
  | 'melee'                 // pursue + close-range strike (existing)
  | 'ranged'                // strafe at engagement range (existing)
  | 'passive_flee'          // wander, flee on damage (Phase 4)
  | 'aquatic_passive'       // wander in water, flee on damage (Phase 4)
  | 'aquatic_predator'      // pursue in water (Phase 4)
  | 'hover_ranged'          // hover + ranged strike, no ground constraint (Phase 4)
  | 'heavy_melee'           // slow tank with knockback (Phase 4)
  | 'ambush_swarm'          // crouch-leap + group attack (Phase 4)
  | 'sentinel_static';      // stationary watcher (scarecrow) (Phase 4)

export type Biome =
  | 'permafrost'
  | 'glasslands'
  | 'derelict-sprawl'
  | 'anomaly-field'
  | 'cinder-wastes'
  | 'water'
  | 'settlement';

export interface CreatureDef {
  /** Stable identifier — referenced by bestiary, save files, spawn tables. */
  key: string;
  /** Human-readable name used in HUD damage popups + bestiary fallback. */
  displayName: string;
  /** Hostility / hunt class. */
  role: CreatureRole;
  /** Path under /public, served by Vite. */
  fbxPath: string;
  /** Optional explicit texture path; many rigs auto-resolve from FBX embed. */
  texturePath?: string;
  /** Uniform scale applied at load time. Verify visually per ENEMIES.md §I.1. */
  scale: number;
  /** Manual Y offset (m). Leave 0 unless the auto footOffsetY mishandles. */
  yOffset: number;
  /** RGB tint for HUD blip + portrait monogram fallback. */
  tintColor: number;
  /** 1 (trivial) → 5 (boss). Drives waves and bestiary "danger" header. */
  threatLevel: 1 | 2 | 3 | 4 | 5;
  /** Brain archetype — Phase 4 introduces the new ones. */
  ai: AIArchetype;
  /** Biomes this creature spawns in. Empty = quest-only / non-spawning. */
  biomes: Biome[];
  /** Drop table item IDs. `~` prefix flags placeholders awaiting recipes.csv. */
  drops: string[];
  /** Free-form notes; mirrors the CSV "Notes" column. */
  notes: string;
}

/* ─────────────────────────────────────────────────────────────────────────
 * Default scale conventions
 *  - The hand-crafted humanoid pack (clown/doctor/etc.)  → 0.014  (Mixamo)
 *  - The "easy_animated" creature pack (frog/rat/etc.)   → 0.012  (Quaternius)
 *  - Quaternius scifi essentials (drones / quadshell)    → 0.010
 *  - Quaternius mech pack (Stan/Mike/Leela/George)       → 0.018  (large)
 *  - Animal/farm pack                                    → 0.012
 *  - Animal/fish pack                                    → 0.012
 * Override per-entry only if the auto-pivot is wrong. -------------------- */

export const CREATURES: CreatureDef[] = [
  // ── hostile-other (existing 6 — DO NOT change keys; bestiary.ts depends) ──
  { key: 'clown',       displayName: 'Hollow Jester',  role: 'hostile-other',
    fbxPath: '/models/enemies/clown/clown.fbx',         texturePath: '/models/enemies/clown/texture.png',
    scale: 0.014, yOffset: 0, tintColor: 0xe84060, threatLevel: 3, ai: 'melee',
    biomes: ['derelict-sprawl', 'settlement'], drops: ['bell_shard', 'cloth_tattered', 'brass_coin', 'carnival_token'],
    notes: 'Standalone single-file enemy.' },
  { key: 'doctor',      displayName: 'Frost Surgeon',  role: 'hostile-other',
    fbxPath: '/models/enemies/doctor/doctor.fbx',       texturePath: '/models/enemies/doctor/texture.png',
    scale: 0.014, yOffset: 0, tintColor: 0x80c0ff, threatLevel: 4, ai: 'ranged',
    biomes: ['permafrost', 'derelict-sprawl'], drops: ['surgical_scalpel', 'antiseptic', 'frozen_vial', 'cryo_coil'],
    notes: 'Standalone single-file enemy.' },
  { key: 'masked',      displayName: 'Veil Stalker',   role: 'hostile-other',
    fbxPath: '/models/enemies/masked/masked.fbx',       texturePath: '/models/enemies/masked/texture.png',
    scale: 0.014, yOffset: 0, tintColor: 0x222222, threatLevel: 4, ai: 'ambush_swarm',
    biomes: ['derelict-sprawl', 'anomaly-field'], drops: ['black_mask', 'garrote_wire', 'silenced_round', 'veil_fragment'],
    notes: 'Quest-specific.' },
  { key: 'miner',       displayName: 'Tunnel Wretch',  role: 'hostile-other',
    fbxPath: '/models/enemies/miner/miner.fbx',         texturePath: '/models/enemies/miner/texture.png',
    scale: 0.014, yOffset: 0, tintColor: 0xaa8855, threatLevel: 2, ai: 'heavy_melee',
    biomes: ['derelict-sprawl', 'permafrost'], drops: ['pickaxe_head', 'iron_ore', 'glow_crystal', 'lantern_dust'],
    notes: 'Quest-specific.' },
  { key: 'scarecrow',   displayName: 'Husk Watcher',   role: 'hostile-other',
    fbxPath: '/models/enemies/scarecrow/scarecrow.fbx', texturePath: '/models/enemies/scarecrow/texture.png',
    scale: 0.014, yOffset: 0, tintColor: 0xccaa44, threatLevel: 3, ai: 'sentinel_static',
    biomes: ['glasslands', 'cinder-wastes'], drops: ['straw_bundle', 'crow_feather', 'burlap_sack', 'twine_charm'],
    notes: 'Quest-specific.' },
  { key: 'seaexplorer', displayName: 'Drowned Diver',  role: 'hostile-other',
    fbxPath: '/models/enemies/seaexplorer/seaexplorer.fbx', texturePath: '/models/enemies/seaexplorer/texture.png',
    scale: 0.014, yOffset: 0, tintColor: 0x3377cc, threatLevel: 3, ai: 'ranged',
    biomes: ['water', 'derelict-sprawl'], drops: ['brass_helmet', 'air_hose', 'pearl_shard', 'pressurized_brine'],
    notes: 'Quest-specific.' },
  // Lizard mule — fully-animated dual-role GLB (7 clips: idle, walk, run,
  // death, hit, attack_1, attack_2). Ships in the anomaly-field as a tanky
  // pack-beast; designers may also flag as a player mount later (out of
  // scope here).
  {
    key: 'lizard_mule', displayName: 'Lizard Mule', role: 'hostile-other',
    fbxPath: '/models/enemies/lizard_mule/lizard_mule.glb',
    scale: 0.014, yOffset: 0, tintColor: 0x6a8a4a, threatLevel: 3, ai: 'heavy_melee',
    biomes: ['anomaly-field', 'cinder-wastes', 'glasslands'],
    drops: ['~bio', 'leather', 'bone', 'pack_strap'],
    notes: 'GLB w/ 7 clips — idle/walk/run/hit/death + 2 attacks.'
  },
  // Skeletons — single-clip CINEMA_4D rigs. Treated as static-ish hazards
  // until rigs are split into idle/attack/die. Used in graveyards and the
  // ruined cathedral set-piece.
  {
    key: 'skeleton_swordman', displayName: 'Skeleton Swordsman', role: 'hostile-other',
    fbxPath: '/models/enemies/skeleton_swordman/skeleton_swordman.glb',
    scale: 0.014, yOffset: 0, tintColor: 0xb8b0a0, threatLevel: 2, ai: 'melee',
    biomes: ['derelict-sprawl', 'anomaly-field'],
    drops: ['~bio', 'bone', 'rusted_blade'],
    notes: 'GLB — single CINEMA_4D clip; awaiting split into idle/attack/die.'
  },
  {
    key: 'skeleton_axe', displayName: 'Skeleton Axe-Bearer', role: 'hostile-other',
    fbxPath: '/models/enemies/skeleton_axe/skeleton_axe.glb',
    scale: 0.014, yOffset: 0, tintColor: 0xa89888, threatLevel: 2, ai: 'heavy_melee',
    biomes: ['derelict-sprawl', 'anomaly-field'],
    drops: ['~bio', 'bone', 'rusted_axe'],
    notes: 'GLB — single CINEMA_4D clip; awaiting split into idle/attack/die.'
  },
  // Tide Caller — static unrigged GLB used as a shrine boss. AI archetype
  // sentinel_static plus a procedural float bob handled by the renderer.
  {
    key: 'tide_caller', displayName: 'Tide Caller', role: 'hostile-other',
    fbxPath: '/models/enemies/tide_caller/tide_caller.glb',
    scale: 0.018, yOffset: 0.5, tintColor: 0x3a7080, threatLevel: 4, ai: 'sentinel_static',
    biomes: ['water', 'derelict-sprawl'],
    drops: ['pearl_shard', 'pressurized_brine', 'tide_sigil', 'coral_charm'],
    notes: 'Static rig. Procedural float + tidal-pulse AoE at intervals.'
  },

  // ── hostile-easy (animated creature pack) ────────────────────────────────
  { key: 'frog',         displayName: 'Bog Frog',        role: 'hostile-easy',
    fbxPath: '/models/enemies/easy_animated/FBX/Frog.fbx',
    scale: 0.012, yOffset: 0, tintColor: 0x4d8a3a, threatLevel: 1, ai: 'melee',
    biomes: ['anomaly-field', 'water'], drops: ['~bio_small', '~hide_small'],
    notes: 'Pre-rigged + animated. Calm; aggro only at close range.' },
  { key: 'rat',          displayName: 'Sprawl Rat',      role: 'hostile-easy',
    fbxPath: '/models/enemies/easy_animated/FBX/Rat.fbx',
    scale: 0.012, yOffset: 0, tintColor: 0x5a4030, threatLevel: 1, ai: 'ambush_swarm',
    biomes: ['derelict-sprawl', 'settlement'], drops: ['~bio_small', '~hide_small', 'rat_tail'],
    notes: 'Vermin tier — spawns in groups via rat-plague event.' },
  { key: 'snake',        displayName: 'Glass Adder',     role: 'hostile-easy',
    fbxPath: '/models/enemies/easy_animated/FBX/Snake.fbx',
    scale: 0.012, yOffset: 0, tintColor: 0x7a8a4a, threatLevel: 1, ai: 'melee',
    biomes: ['glasslands', 'cinder-wastes', 'derelict-sprawl'], drops: ['~bio', 'snake_skin', 'venom_drop'],
    notes: 'Calm version. Venom is a rare drop.' },
  // CSV says "Snake_Angry.fbx" but the file on disk is "Snake_angry.fbx"
  // (lowercase a). Use the real filename here — renaming the asset would
  // break any external manifests / asset CDNs that already cached it.
  { key: 'snake_angry',  displayName: 'Vexed Adder',     role: 'hostile-easy',
    fbxPath: '/models/enemies/easy_animated/FBX/Snake_angry.fbx',
    scale: 0.012, yOffset: 0, tintColor: 0xa04040, threatLevel: 2, ai: 'melee',
    biomes: ['glasslands', 'cinder-wastes', 'derelict-sprawl'], drops: ['~bio', 'snake_skin', 'venom_drop'],
    notes: 'Aggro variant — combat AI.' },
  { key: 'spider',       displayName: 'Cave Stalker',    role: 'hostile-easy',
    fbxPath: '/models/enemies/easy_animated/FBX/Spider.fbx',
    scale: 0.012, yOffset: 0, tintColor: 0x303030, threatLevel: 2, ai: 'ambush_swarm',
    biomes: ['derelict-sprawl', 'permafrost'], drops: ['~bio', 'silk', 'fang'],
    notes: 'Wall-walk candidate; until then pathfinds normally.' },
  { key: 'wasp',         displayName: 'Hive Drone',      role: 'hostile-easy',
    fbxPath: '/models/enemies/easy_animated/FBX/Wasp.fbx',
    scale: 0.012, yOffset: 0, tintColor: 0xd0a020, threatLevel: 2, ai: 'hover_ranged',
    biomes: ['glasslands', 'anomaly-field'], drops: ['~bio', 'stinger', 'wax'],
    notes: 'Flying — uses hover_ranged archetype (Phase 4).' },

  // ── hostile-scifi (essentials kit) ───────────────────────────────────────
  { key: 'enemy_eyedrone',   displayName: 'Optic Sentinel', role: 'hostile-scifi',
    fbxPath: '/models/scifi/essentials_kit/FBX/Enemy_EyeDrone.fbx',
    scale: 0.010, yOffset: 0, tintColor: 0xff5555, threatLevel: 3, ai: 'hover_ranged',
    biomes: ['derelict-sprawl', 'anomaly-field'], drops: ['scrap_electronic', 'optic_core', 'energy_cell'],
    notes: 'Pre-rigged. Patrols sci-fi facilities + Stratocolonies.' },
  { key: 'enemy_quadshell',  displayName: 'QuadShell Mauler', role: 'hostile-scifi',
    fbxPath: '/models/scifi/essentials_kit/FBX/Enemy_QuadShell.fbx',
    scale: 0.010, yOffset: 0, tintColor: 0xc06030, threatLevel: 4, ai: 'heavy_melee',
    biomes: ['derelict-sprawl'], drops: ['scrap_electronic', 'armour_plate', 'energy_cell'],
    notes: 'Heavier ground unit.' },
  { key: 'enemy_trilobite',  displayName: 'Lab Trilobite', role: 'hostile-scifi',
    fbxPath: '/models/scifi/essentials_kit/FBX/Enemy_Trilobite.fbx',
    scale: 0.010, yOffset: 0, tintColor: 0x40a0a0, threatLevel: 2, ai: 'ambush_swarm',
    biomes: ['anomaly-field'], drops: ['~bio_alien', 'chitin', 'energy_cell'],
    notes: 'Low-slung swarm unit; spawns in radiation zones.' },

  // ── hostile-mech (Quaternius mech pack — endgame) ────────────────────────
  { key: 'mech_stan',    displayName: 'STAN Walker',  role: 'hostile-mech',
    fbxPath: '/models/enemies/mechs/Textured/FBX/Stan.fbx',
    scale: 0.018, yOffset: 0, tintColor: 0x8090a0, threatLevel: 5, ai: 'heavy_melee',
    biomes: ['cinder-wastes', 'anomaly-field'], drops: ['scrap_heavy', 'armour_plate', 'energy_cell', 'rare_alloy'],
    notes: 'Quaternius Mech.' },
  { key: 'mech_mike',    displayName: 'MIKE Walker',  role: 'hostile-mech',
    fbxPath: '/models/enemies/mechs/Textured/FBX/Mike.fbx',
    scale: 0.018, yOffset: 0, tintColor: 0x607080, threatLevel: 5, ai: 'heavy_melee',
    biomes: ['cinder-wastes', 'anomaly-field'], drops: ['scrap_heavy', 'armour_plate', 'energy_cell', 'rare_alloy'],
    notes: 'Quaternius Mech.' },
  { key: 'mech_leela',   displayName: 'LEELA Walker', role: 'hostile-mech',
    fbxPath: '/models/enemies/mechs/Textured/FBX/Leela.fbx',
    scale: 0.018, yOffset: 0, tintColor: 0x40606a, threatLevel: 5, ai: 'ranged',
    biomes: ['cinder-wastes', 'anomaly-field'], drops: ['scrap_heavy', 'armour_plate', 'energy_cell', 'rare_alloy'],
    notes: 'Quaternius Mech — ranged variant.' },
  { key: 'mech_george',  displayName: 'GEORGE Walker', role: 'hostile-mech',
    fbxPath: '/models/enemies/mechs/Textured/FBX/George.fbx',
    scale: 0.018, yOffset: 0, tintColor: 0x707870, threatLevel: 5, ai: 'heavy_melee',
    biomes: ['cinder-wastes', 'anomaly-field'], drops: ['scrap_heavy', 'armour_plate', 'energy_cell', 'rare_alloy'],
    notes: 'Quaternius Mech.' },

  // ── huntable-farm (passive; flee on hit) ─────────────────────────────────
  { key: 'cow',    displayName: 'Cow',    role: 'huntable-farm',
    fbxPath: '/models/animals/farm/glb/Cow.glb',
    scale: 0.012, yOffset: 0, tintColor: 0xb0a090, threatLevel: 1, ai: 'passive_flee',
    biomes: ['glasslands', 'settlement'], drops: ['meat_beef', 'bio', 'leather', 'bone'],
    notes: 'Heaviest drops; slow.' },
  { key: 'horse',  displayName: 'Horse',  role: 'huntable-farm',
    fbxPath: '/models/animals/farm/glb/Horse.glb',
    scale: 0.012, yOffset: 0, tintColor: 0x8a6040, threatLevel: 1, ai: 'passive_flee',
    biomes: ['glasslands'], drops: ['meat_horse', 'bio', 'leather', 'bone'],
    notes: 'Fast — uses passive_flee at high speed.' },
  { key: 'llama',  displayName: 'Llama',  role: 'huntable-farm',
    fbxPath: '/models/animals/farm/glb/Llama.glb',
    scale: 0.012, yOffset: 0, tintColor: 0xc0a070, threatLevel: 1, ai: 'passive_flee',
    biomes: ['cinder-wastes'], drops: ['meat_llama', 'bio', 'leather', 'bone'],
    notes: 'Mid drops.' },
  { key: 'pig',    displayName: 'Pig',    role: 'huntable-farm',
    fbxPath: '/models/animals/farm/glb/Pig.glb',
    scale: 0.012, yOffset: 0, tintColor: 0xd09080, threatLevel: 1, ai: 'passive_flee',
    biomes: ['glasslands', 'settlement'], drops: ['meat_pork', 'bio', 'leather', 'bone'],
    notes: 'Common low-tier hunt.' },
  { key: 'pug',    displayName: 'Pug',    role: 'huntable-farm',
    fbxPath: '/models/animals/farm/glb/Pug.glb',
    scale: 0.012, yOffset: 0, tintColor: 0xc09060, threatLevel: 1, ai: 'passive_flee',
    biomes: ['settlement'], drops: ['bio', 'leather', 'bone'],
    notes: 'Settlement pet by default — only drops if killed (no meat).' },
  { key: 'sheep',  displayName: 'Sheep',  role: 'huntable-farm',
    fbxPath: '/models/animals/farm/glb/Sheep.glb',
    scale: 0.012, yOffset: 0, tintColor: 0xe0e0d0, threatLevel: 1, ai: 'passive_flee',
    biomes: ['glasslands'], drops: ['meat_mutton', 'bio', 'leather', 'bone', 'wool'],
    notes: 'Adds wool drop.' },
  { key: 'zebra',  displayName: 'Zebra',  role: 'huntable-farm',
    fbxPath: '/models/animals/farm/glb/Zebra.glb',
    scale: 0.012, yOffset: 0, tintColor: 0xf0f0f0, threatLevel: 1, ai: 'passive_flee',
    biomes: ['cinder-wastes'], drops: ['meat_zebra', 'bio', 'leather', 'bone'],
    notes: 'Same skeleton as Horse; different palette.' },

  // ── huntable-fish (water biome) — depends on Phase 4 aquatic AI ──────────
  { key: 'dolphin',   displayName: 'Dolphin',   role: 'huntable-fish',
    fbxPath: '/models/animals/fish/glb/Dolphin.glb',
    scale: 0.012, yOffset: 0, tintColor: 0x6090b0, threatLevel: 2, ai: 'aquatic_passive',
    biomes: ['water'], drops: ['meat_fish', 'bio', 'fat'],
    notes: 'Harpoon-tier; deferred until fishing pass.' },
  { key: 'fish1',     displayName: 'River Fish', role: 'huntable-fish',
    fbxPath: '/models/animals/fish/glb/Fish1.glb',
    scale: 0.012, yOffset: 0, tintColor: 0x80a0c0, threatLevel: 1, ai: 'aquatic_passive',
    biomes: ['water'], drops: ['meat_fish', 'bio'],
    notes: 'Small generic fish.' },
  { key: 'fish2',     displayName: 'Reef Fish',  role: 'huntable-fish',
    fbxPath: '/models/animals/fish/glb/Fish2.glb',
    scale: 0.012, yOffset: 0, tintColor: 0xc09060, threatLevel: 1, ai: 'aquatic_passive',
    biomes: ['water'], drops: ['meat_fish', 'bio'],
    notes: 'Small generic fish.' },
  { key: 'fish3',     displayName: 'Deep Fish',  role: 'huntable-fish',
    fbxPath: '/models/animals/fish/glb/Fish3.glb',
    scale: 0.012, yOffset: 0, tintColor: 0x506070, threatLevel: 1, ai: 'aquatic_passive',
    biomes: ['water'], drops: ['meat_fish', 'bio'],
    notes: 'Small generic fish.' },
  // Source asset is "Manta ray.fbx" (with space). Converted to MantaRay.glb
  // so the URL has no whitespace to escape.
  { key: 'manta_ray', displayName: 'Manta Ray',  role: 'huntable-fish',
    fbxPath: '/models/animals/fish/glb/MantaRay.glb',
    scale: 0.012, yOffset: 0, tintColor: 0x303040, threatLevel: 2, ai: 'aquatic_passive',
    biomes: ['water'], drops: ['meat_fish', 'bio', 'leather'],
    notes: 'Large flat — leather candidate.' },
  { key: 'shark',     displayName: 'Shark',      role: 'huntable-fish',
    fbxPath: '/models/animals/fish/glb/Shark.glb',
    scale: 0.012, yOffset: 0, tintColor: 0x405060, threatLevel: 4, ai: 'aquatic_predator',
    biomes: ['water'], drops: ['meat_fish', 'bio', 'leather', 'bone'],
    notes: 'Predator AI — pursues swimmers (Phase 4).' },
  { key: 'whale',     displayName: 'Whale',      role: 'huntable-fish',
    fbxPath: '/models/animals/fish/glb/Whale.glb',
    scale: 0.012, yOffset: 0, tintColor: 0x405060, threatLevel: 3, ai: 'aquatic_passive',
    biomes: ['water'], drops: ['meat_fish', 'bio', 'fat', 'bone'],
    notes: 'Largest; deep-water spawn.' },
];

/**
 * O(1) lookup map keyed by stable creature key. Built once at module load.
 */
export const CREATURE_BY_KEY: Map<string, CreatureDef> =
  new Map(CREATURES.map((c) => [c.key, c]));

/** Filter helper — used by AssetManager and the wave spawner. */
export function getHostileCreatures(): CreatureDef[] {
  return CREATURES.filter((c) => c.role.startsWith('hostile-'));
}

/** Filter helper — used by the ambient huntable spawner (Phase 2). */
export function getHuntableCreatures(): CreatureDef[] {
  return CREATURES.filter((c) => c.role.startsWith('huntable-'));
}

/** All creatures whose `biomes` list includes the given biome tag. */
export function getCreaturesForBiome(biome: Biome): CreatureDef[] {
  return CREATURES.filter((c) => c.biomes.includes(biome));
}
