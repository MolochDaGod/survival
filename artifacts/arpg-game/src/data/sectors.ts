/**
 * sectors — the five territories of the 20 km × 20 km surface map.
 *
 * Each sector is 4 km × 4 km (2 000 m radius). The player's encampment
 * is the neutral safe start zone at the world origin. Sectors radiate
 * outward with contested wildlands between them.
 *
 * Each sector references a chicken-gun GLB map as its anchor scene.
 * Procedural terrain, waterline, roads, biome colour, resource nodes,
 * and chunk streaming blend around those anchors.
 */

import type { FactionId } from './factions';

export type SectorBiomeBias =
  | 'highland' | 'forest' | 'grassland' | 'pit'
  | 'coast' | 'wreckage' | 'farmland' | 'town';

export interface SectorPOI {
  name: string;
  type: 'vendor' | 'dungeon' | 'boss' | 'harvest' | 'camp' | 'landmark' | 'gate';
  /** Offset from sector centre in metres. */
  offset: { x: number; z: number };
  description: string;
}

export interface TravelRoute {
  from: string;
  to: string;
  name: string;
  waypoints: Array<{ x: number; z: number }>;
}

export interface SectorDef {
  id: string;
  name: string;
  owner: FactionId;
  center: { x: number; z: number };
  radius: number;
  biomeBias: SectorBiomeBias;
  description: string;
  /** Extended lore for codex/loading screens and AI dialogue. */
  lore: string;
  /** Chicken gun GLB scene blended into this sector's terrain. */
  glbMap: string;
  pois: SectorPOI[];
  /** Enemy types that spawn in this sector. */
  hostileTypes: string[];
  /** Ambient wildlife tags. */
  fauna: string[];
  /** Harvestable resource node tags weighted for this sector. */
  resources: string[];
}

export const SECTOR_RADIUS_M = 2000;
/** Safe-zone radius around Convergence Nexus (no hostile camps). */
export const ARENA_SAFE_RADIUS = 800;

export const SECTORS: SectorDef[] = [
  {
    id: 'cathedral_highlands',
    name: 'Cathedral Highlands',
    owner: 'keepers',
    center: { x: 0, z: -6000 },
    radius: SECTOR_RADIUS_M,
    biomeBias: 'highland',
    glbMap: 'chicken_gun_western_reupload.glb',
    description: 'Mountain shrines, ritual circles, hallowed stone. The Keepers hold the high ground.',
    lore: 'Before The Way sealed the elevators, the Cathedral Highlands were the last unstripped ridgeline. The Keepers claimed it within a decade, planting prayer stones along every trail and declaring the peaks sacred ground. They believe The Way wounded the living land and that careful harvest and hallowed defense are the only path back from collapse.',
    pois: [
      { name: 'Old Cathedral', type: 'landmark', offset: { x: 0, z: 0 }, description: 'Keeper capital — chapel-fortress, healer hall, relic archive.' },
      { name: 'Shrine Camp Vesper', type: 'camp', offset: { x: -620, z: 420 }, description: 'Pilgrim rest with herbalists and ritual harvest trainers.' },
      { name: 'Watch Post Kestrel', type: 'gate', offset: { x: 1180, z: -760 }, description: 'Southern border watch checking faction standing.' },
      { name: 'Stone Throat Cave', type: 'dungeon', offset: { x: -520, z: -920 }, description: 'Deep cave — iron, crystal, bats, spiders, cave brute.' },
      { name: 'Bone Altar', type: 'boss', offset: { x: 760, z: 260 }, description: 'Dusk ritual arena where a broken Keeper construct wakes.' },
      { name: 'Highland Mines', type: 'harvest', offset: { x: -900, z: -360 }, description: 'Iron, copper, crystal, stone, mountain herb nodes.' },
      { name: 'Herbalist Terrace', type: 'vendor', offset: { x: 360, z: 640 }, description: 'Potions, seeds, toxin resist kits, herb contracts.' },
    ],
    hostileTypes: ['skeleton_axe', 'skeleton_swordman', 'cave_troll', 'highland_wolf'],
    fauna: ['mountain_goat', 'hawk', 'cave_bat', 'black_bear'],
    resources: ['iron_ore', 'copper_deposit', 'wild_herbs', 'timber_log', 'crystal_node', 'stone_outcrop'],
  },
  {
    id: 'junkyards',
    name: 'The Junkyards',
    owner: 'tech_scavengers',
    center: { x: 6000, z: 0 },
    radius: SECTOR_RADIUS_M,
    biomeBias: 'wreckage',
    glbMap: 'chicken_gun_town2f_reupload.glb',
    description: 'Salvage fields and workshop sheds. Every wreck is a parts shop.',
    lore: 'When The Way abandoned the surface it left rail yards, smelters, cable runs, and mountains of sorted scrap. The Tech-Scavengers were the mechanics who kept the machines alive for wages. Now they keep them alive for themselves. Their territory is corrugated steel, jury-rigged generators, gunfire, grinding wheels, and scavenger law.',
    pois: [
      { name: 'The Workshops', type: 'landmark', offset: { x: 0, z: 0 }, description: 'Scavenger capital — forge, gunsmith, drone bench, repair bay.' },
      { name: 'Survivor Camp Alpha', type: 'camp', offset: { x: 680, z: -520 }, description: 'Forward camp with ammo vendor and scrap jobs.' },
      { name: 'Scout Point Raven', type: 'gate', offset: { x: -1360, z: 620 }, description: 'Sniper tower and early-warning siren on the western perimeter.' },
      { name: 'Dark Maw Cave', type: 'dungeon', offset: { x: 440, z: 920 }, description: 'Collapsed mine — scrap golems, electric traps, salvage crates.' },
      { name: 'The Crusher', type: 'boss', offset: { x: -640, z: -340 }, description: 'Scrap arena with a rogue chief in a patched mech suit.' },
      { name: 'Rust Pits', type: 'harvest', offset: { x: 920, z: 440 }, description: 'Scrap piles, wire spools, oil drums, copper, flint.' },
      { name: 'Tinker Market', type: 'vendor', offset: { x: -240, z: -720 }, description: 'Gun mods, drone kits, explosives, batteries, blueprints.' },
    ],
    hostileTypes: ['miner', 'masked', 'scrap_golem', 'rogue_drone'],
    fauna: ['rat_swarm', 'crow_flock', 'junkyard_dog'],
    resources: ['scrap_pile', 'copper_deposit', 'oil_drum', 'wire_spool', 'flint_outcrop'],
  },
  {
    id: 'the_pit',
    name: 'The Pit',
    owner: 'hollow_lords',
    center: { x: 0, z: 6000 },
    radius: SECTOR_RADIUS_M,
    biomeBias: 'pit',
    glbMap: 'chicken_gun_bigfarm_full_map.glb',
    description: 'Sunken shaft-mouths and warband barracks. Iron law rules The Pit.',
    lore: 'The Pit was the deepest extraction zone The Way ever sank. When the elevators sealed, the miners trapped below became warbands. Their law is iron law: rank through strength, oaths in blood, resources claimed by those who bled for them. Farms feed the warbands; the shaft mouths still breathe warm mineral air.',
    pois: [
      { name: 'Iron Pit', type: 'landmark', offset: { x: 0, z: 0 }, description: 'Hollow Lord capital — great shaft, warband hall, challenge arena.' },
      { name: 'Warband Camp Iron', type: 'camp', offset: { x: -800, z: 520 }, description: 'Raiding camp with blacksmith, war drums, prisoner cages.' },
      { name: 'Lookout Hawk', type: 'gate', offset: { x: 1100, z: -900 }, description: 'Northern watchtower with paired raider patrols.' },
      { name: 'Howling Pit', type: 'dungeon', offset: { x: 520, z: 760 }, description: 'Deep cave — lava vents, ore veins, magma beasts, pit worms.' },
      { name: 'The Crucible', type: 'boss', offset: { x: -460, z: -620 }, description: 'Gladiator arena where the Warmaster accepts challenges.' },
      { name: 'Deep Forge', type: 'harvest', offset: { x: 720, z: -240 }, description: 'Iron, coal, sulfur, obsidian, rare earth deposits.' },
      { name: 'War Quartermaster', type: 'vendor', offset: { x: -320, z: 220 }, description: 'Heavy armor, siege tools, war rations, melee weapon parts.' },
    ],
    hostileTypes: ['scarecrow', 'lizard_mule', 'lava_monster', 'hollow_raider', 'pit_worm'],
    fauna: ['cave_spider', 'blind_newt', 'magma_crab', 'black_bear'],
    resources: ['iron_ore', 'coal_seam', 'obsidian_node', 'sulfur_vent', 'stone_outcrop'],
  },
  {
    id: 'switchyard',
    name: 'The Switchyard',
    owner: 'network',
    center: { x: -6000, z: 0 },
    radius: SECTOR_RADIUS_M,
    biomeBias: 'grassland',
    glbMap: 'chicken_gun_mistytown.glb',
    description: 'Rail relays and signal towers. The Network sells locations and runs caravans.',
    lore: 'The Switchyard was the surface terminus of The Way\'s rail network. When the lifts sealed, rail workers became couriers, then traders, then intelligence brokers. The Network learned that information is the only resource that does not deplete. They keep rail lines passable, signal towers blinking, caravans moving, and grudges recorded.',
    pois: [
      { name: 'The Exchange', type: 'landmark', offset: { x: 0, z: 0 }, description: 'Network capital — trade hall, signal hub, caravan depot.' },
      { name: 'Relay Camp Signal', type: 'camp', offset: { x: 640, z: -720 }, description: 'Radio outpost, bounty board, scouting contracts.' },
      { name: 'Perch Falcon', type: 'gate', offset: { x: -1320, z: 520 }, description: 'Eastern checkpoint, toll booth, scout binocular nest.' },
      { name: 'Shadow Den', type: 'dungeon', offset: { x: -540, z: -840 }, description: 'Underground data vault with automated turrets and rogue AI.' },
      { name: 'The Broker', type: 'boss', offset: { x: 420, z: 320 }, description: 'Rogue trader with private militia and rare blueprint drops.' },
      { name: 'Switchyard Farm', type: 'harvest', offset: { x: -820, z: 420 }, description: 'Wheat, hemp, berry bushes, timber, clay, beehives.' },
      { name: 'Caravan Provisioner', type: 'vendor', offset: { x: 240, z: -440 }, description: 'Food, maps, compass, binoculars, trade contracts.' },
    ],
    hostileTypes: ['bandit_scout', 'rogue_trader', 'signal_drone', 'wild_dog_pack'],
    fauna: ['deer', 'rabbit', 'pheasant', 'wild_horse'],
    resources: ['timber_log', 'wild_herbs', 'flint_outcrop', 'clay_deposit', 'wheat_field'],
  },
  {
    id: 'frostbite_fringe',
    name: 'Frostbite Fringe',
    owner: 'keepers',
    center: { x: -6667, z: -6667 },
    radius: SECTOR_RADIUS_M * 0.85,
    biomeBias: 'highland',
    glbMap: 'chicken_gun_western_reupload.glb',
    description: 'NW wildlands — permafrost ridges bleeding off the Cathedral Highlands.',
    lore: 'The fringe was never fully hallowed. Keeper patrols mark prayer stones here, but the ice remembers older winters. Scavengers who wander too far north return frostbitten or not at all.',
    pois: [
      { name: 'Frostbite Hollow', type: 'camp', offset: { x: 420, z: -280 }, description: 'Keeper outpost camp — herbalists and ice harvest.' },
      { name: 'Glacier Scar', type: 'harvest', offset: { x: -640, z: 520 }, description: 'Permafrost veins and frozen ponds.' },
      { name: 'Wolf Den', type: 'dungeon', offset: { x: 280, z: 740 }, description: 'Ice cave — wolves, bats, cave troll.' },
    ],
    hostileTypes: ['highland_wolf', 'skeleton_swordman', 'cave_troll'],
    fauna: ['mountain_goat', 'cave_bat', 'black_bear'],
    resources: ['permafrost_ore', 'iron_ore', 'crystal_node', 'frozen_pond', 'wild_herbs'],
  },
  {
    id: 'stormbreak_scrub',
    name: 'Stormbreak Scrub',
    owner: 'tech_scavengers',
    center: { x: 6667, z: -6667 },
    radius: SECTOR_RADIUS_M * 0.85,
    biomeBias: 'wreckage',
    glbMap: 'chicken_gun_town2f_reupload.glb',
    description: 'NE scrubland — salvage windrows between junkyard proper and the coast.',
    lore: 'When the coastal storms break, wreckage washes into these scrub fields. Scavenger forward camps strip anything that still sparks. The law here is jury-rigged and loud.',
    pois: [
      { name: 'Stormbreak Relay', type: 'camp', offset: { x: -380, z: 420 }, description: 'Forward salvage camp with ammo bench.' },
      { name: 'Wire Fields', type: 'harvest', offset: { x: 620, z: -240 }, description: 'Scrap piles, wire spools, copper.' },
      { name: 'Drone Nest', type: 'dungeon', offset: { x: -520, z: -680 }, description: 'Rogue drone hive in a collapsed shed.' },
    ],
    hostileTypes: ['rogue_drone', 'miner', 'masked', 'scrap_golem'],
    fauna: ['rat_swarm', 'crow_flock', 'junkyard_dog'],
    resources: ['scrap_pile', 'wire_spool', 'copper_deposit', 'oil_drum', 'flint_outcrop'],
  },
  {
    id: 'silt_marshes',
    name: 'Silt Marshes',
    owner: 'forgotten',
    center: { x: -6667, z: 6667 },
    radius: SECTOR_RADIUS_M * 0.85,
    biomeBias: 'coast',
    glbMap: 'chicken_gun_fruzer_-_encampment.glb',
    description: 'SW tidal flats — Forgotten reed camps between Switchyard and Drowned Quarter.',
    lore: 'The marshes swallow roads. Forgotten fishers move on stilts, coating blades in tide toxins. Every footstep sinks — every grudge lingers.',
    pois: [
      { name: 'Reed Stilt Camp', type: 'camp', offset: { x: 340, z: -520 }, description: 'Tide fishing camp with toxicologist.' },
      { name: 'Salt Pan', type: 'harvest', offset: { x: -720, z: 180 }, description: 'Salt, kelp, driftwood nodes.' },
      { name: 'Silt Maw', type: 'dungeon', offset: { x: 480, z: 640 }, description: 'Flooded tunnel — lurkers and poison frogs.' },
    ],
    hostileTypes: ['marsh_lurker', 'poison_frog', 'drowned_dead', 'tide_caller'],
    fauna: ['crab', 'eel', 'saltwater_croc'],
    resources: ['driftwood', 'salt_deposit', 'kelp_bed', 'wild_herbs', 'coral_node'],
  },
  {
    id: 'convergence_nexus',
    name: 'Convergence Nexus',
    owner: 'network',
    center: { x: 0, z: 0 },
    radius: ARENA_SAFE_RADIUS,
    biomeBias: 'town',
    glbMap: 'chicken_gun_mistytown.glb',
    description: 'Neutral encampment — five faction roads converge at the world origin.',
    lore: 'Before the factions carved the map into territories, traders met here. The Nexus remains the only ground where no warband may claim blood-debt without every faction answering.',
    pois: [
      { name: 'Encampment', type: 'landmark', offset: { x: 0, z: 0 }, description: 'Player safe start — vendors, quest board, deploy gate.' },
      { name: 'Deploy Gate', type: 'gate', offset: { x: 0, z: 42 }, description: 'Sail or march to any of the nine sectors.' },
      { name: 'Quartermaster', type: 'vendor', offset: { x: -24, z: 18 }, description: 'Starter kits, maps, rations.' },
    ],
    hostileTypes: [],
    fauna: ['rabbit', 'deer', 'pheasant'],
    resources: ['wild_herbs', 'timber_log'],
  },
  {
    id: 'drowned_quarter',
    name: 'The Drowned Quarter',
    owner: 'forgotten',
    center: { x: 4800, z: 4800 },
    radius: SECTOR_RADIUS_M,
    biomeBias: 'coast',
    glbMap: 'chicken_gun_fruzer_-_encampment.glb',
    description: 'Sunken streets and tidal flats. The Forgotten move with the water.',
    lore: 'The Drowned Quarter was a coastal port before The Way over-extracted the aquifers and the sea rushed into old streets. Dockworkers, fishers, and salt-pan labourers learned to live in the silt. They coat blades in tide toxins, move quietly through flooded alleys, and remember every name The Way left behind.',
    pois: [
      { name: 'Tidewatch', type: 'landmark', offset: { x: 0, z: 0 }, description: 'Forgotten capital — half-submerged lighthouse, docks, poison lab.' },
      { name: 'Tide Camp Reed', type: 'camp', offset: { x: -520, z: 620 }, description: 'Stilt fishing camp with toxicologist, bait vendor, reed beds.' },
      { name: 'Drowned Watch', type: 'gate', offset: { x: 920, z: -740 }, description: 'Northern marsh gate with tripwires and camouflaged sentries.' },
      { name: 'Sunken Vault', type: 'dungeon', offset: { x: -740, z: -420 }, description: 'Flooded pre-Way ruin with underwater tunnels and drowned dead.' },
      { name: 'The Tide Mother', type: 'boss', offset: { x: 620, z: 420 }, description: 'Storm-spawned crustacean boss in the tidal flats.' },
      { name: 'Salt Flats', type: 'harvest', offset: { x: -340, z: 820 }, description: 'Salt, seaweed, coral, driftwood, shellfish, toxin herbs.' },
      { name: 'Dockside Apothecary', type: 'vendor', offset: { x: 420, z: -240 }, description: 'Poisons, antidotes, fishing gear, waterproof packs.' },
    ],
    hostileTypes: ['tide_caller', 'seaexplorer', 'drowned_dead', 'marsh_lurker', 'poison_frog'],
    fauna: ['crab', 'eel', 'pelican', 'saltwater_croc'],
    resources: ['driftwood', 'salt_deposit', 'coral_node', 'kelp_bed', 'wild_herbs'],
  },
];

export const TRAVEL_ROUTES: TravelRoute[] = [
  { from: 'encampment', to: 'cathedral_highlands', name: 'Pilgrim Road',
    waypoints: [{ x: 0, z: 0 }, { x: 0, z: -2200 }, { x: 0, z: -4200 }, { x: 0, z: -6000 }] },
  { from: 'encampment', to: 'junkyards', name: 'Scrap Highway',
    waypoints: [{ x: 0, z: 0 }, { x: 2200, z: 0 }, { x: 4200, z: 0 }, { x: 6000, z: 0 }] },
  { from: 'encampment', to: 'the_pit', name: 'Descent Road',
    waypoints: [{ x: 0, z: 0 }, { x: 0, z: 2200 }, { x: 0, z: 4200 }, { x: 0, z: 6000 }] },
  { from: 'encampment', to: 'switchyard', name: 'Rail Line West',
    waypoints: [{ x: 0, z: 0 }, { x: -2200, z: 0 }, { x: -4200, z: 0 }, { x: -6000, z: 0 }] },
  { from: 'encampment', to: 'drowned_quarter', name: 'Tidal Path',
    waypoints: [{ x: 0, z: 0 }, { x: 1600, z: 1600 }, { x: 3200, z: 3200 }, { x: 4800, z: 4800 }] },
  { from: 'cathedral_highlands', to: 'switchyard', name: 'Mountain Pass',
    waypoints: [{ x: 0, z: -6000 }, { x: -2000, z: -4200 }, { x: -4200, z: -2000 }, { x: -6000, z: 0 }] },
  { from: 'junkyards', to: 'drowned_quarter', name: 'Coastal Salvage Trail',
    waypoints: [{ x: 6000, z: 0 }, { x: 6000, z: 2200 }, { x: 5400, z: 3600 }, { x: 4800, z: 4800 }] },
  { from: 'the_pit', to: 'drowned_quarter', name: 'Marsh Crawl',
    waypoints: [{ x: 0, z: 6000 }, { x: 1600, z: 6000 }, { x: 3200, z: 5600 }, { x: 4800, z: 4800 }] },
];

/** Lookup a sector by id. Returns undefined for the wildlands. */
export function getSector(id: string): SectorDef | undefined {
  return SECTORS.find(s => s.id === id);
}

/** Find the sector that owns (x,z), or null if it's in the wildlands. */
export function getSectorForPosition(x: number, z: number): SectorDef | null {
  let best: SectorDef | null = null;
  let bestRatio = 1.0;
  for (const s of SECTORS) {
    const dx = x - s.center.x;
    const dz = z - s.center.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const ratio = dist / s.radius;
    if (ratio < bestRatio) {
      bestRatio = ratio;
      best = s;
    }
  }
  return best;
}

/** All POIs across all sectors, resolved to world coordinates. */
export function getAllPOIs(): Array<SectorPOI & { worldX: number; worldZ: number; sectorId: string; factionId: FactionId }> {
  const result: Array<SectorPOI & { worldX: number; worldZ: number; sectorId: string; factionId: FactionId }> = [];
  for (const s of SECTORS) {
    for (const poi of s.pois) {
      result.push({ ...poi, worldX: s.center.x + poi.offset.x, worldZ: s.center.z + poi.offset.z, sectorId: s.id, factionId: s.owner });
    }
  }
  return result;
}

/** Owning faction for a coord, or null if wildlands (no faction claim). */
export function getOwnerFor(x: number, z: number): FactionId | null {
  return getSectorForPosition(x, z)?.owner ?? null;
}
