/**
 * Survival item catalog.
 *
 * Distinct from the existing equipment-oriented `Items.ts` (helms, chests,
 * etc.) — this database covers the survival pack: stackable consumables,
 * raw materials, tools, weapons, and placeable structures backed by the
 * 100+ FBX models the user shipped in `Just_Survive` and the two weapon
 * packs.
 *
 * Every entry references a model under `/assets/survival/...` so the
 * AssetManager can lazy-load on demand.  UI lookups go through
 * `SURVIVAL_ITEMS[id]` — never hand-roll IDs at the call site.
 */

export type SurvivalCategory =
  | 'food'
  | 'water'
  | 'medical'
  | 'tool'
  | 'weapon_melee'
  | 'weapon_pistol'
  | 'weapon_rifle'
  | 'weapon_shotgun'
  | 'weapon_smg'
  | 'weapon_special'
  | 'weapon_explosive'
  | 'weapon_attachment'
  | 'ammo'
  | 'material'
  | 'clothing'
  | 'structure'
  | 'plant'
  | 'misc';

/** Effects applied when the item is consumed (eaten / drunk / used). */
export interface ConsumeEffect {
  hunger?: number;       // + restores, - costs
  thirst?: number;
  health?: number;
  stamina?: number;
  temperature?: number;  // warmth bonus (campfire near, hot food)
  bleed?: -1 | 0 | 1;    // -1 stops bleed, +1 causes
  infection?: -1 | 0 | 1;
}

export interface SurvivalItemDef {
  id: string;
  name: string;
  category: SurvivalCategory;
  /** Single-glyph emoji used in the inventory grid when no icon image is set. */
  icon: string;
  /** kg per unit; used for backpack weight limit. */
  weight: number;
  /** Max stack size in a single inventory slot. */
  stack: number;
  /** Path under `public/`. Lazy-loaded by AssetManager when first referenced. */
  modelPath: string;
  description: string;

  // -------- Optional category-specific fields --------
  /** Filled for food/water/medical. */
  consume?: ConsumeEffect;
  /** Damage per swing/shot for weapons. */
  damage?: number;
  /** Effective range in meters. */
  range?: number;
  /** Rounds per minute (gun) or swings per second (melee). */
  rateOfFire?: number;
  /** Compatible ammo item id (gun → ammo). */
  ammoId?: string;
  /** Magazine capacity in rounds. */
  magazine?: number;
  /** Durability points; -1 = indestructible. */
  durability?: number;
  /** Whether the item can be placed in the world (build mode). */
  placeable?: boolean;
}

// ---------------------------------------------------------------------------
// Helper builders — keep entries terse.
// ---------------------------------------------------------------------------
const M_ITEM = '/assets/survival/items';
const M_PIST = '/assets/survival/weapons/pistols';
const M_RIFL = '/assets/survival/weapons/rifles';
const M_SHOT = '/assets/survival/weapons/shotguns';
const M_SMG = '/assets/survival/weapons/smg';
const M_MEL = '/assets/survival/weapons/melee';
const M_EXP = '/assets/survival/weapons/explosives';
const M_SPC = '/assets/survival/weapons/specials';
const M_SCP = '/assets/survival/weapons/scopes';

export const SURVIVAL_ITEMS: Record<string, SurvivalItemDef> = {
  // ===== FOOD =====
  apple:      { id: 'apple',      name: 'Apple',         category: 'food',    icon: '🍎', weight: 0.2, stack: 10, modelPath: `${M_ITEM}/Apple.fbx`,         description: 'Crisp fruit. Restores a little of everything.', consume: { hunger: 18, thirst: 6, health: 2 } },
  apple_green:{ id: 'apple_green',name: 'Green Apple',   category: 'food',    icon: '🍏', weight: 0.2, stack: 10, modelPath: `${M_ITEM}/AppleGreen.fbx`,    description: 'Tart and unripe.', consume: { hunger: 14, thirst: 5 } },
  meat_raw:   { id: 'meat_raw',   name: 'Raw Meat',      category: 'food',    icon: '🥩', weight: 0.5, stack: 10, modelPath: `${M_ITEM}/Meat.fbx`,          description: 'Cook before eating — risk of infection raw.', consume: { hunger: 22, infection: 1 } },
  fish_raw:   { id: 'fish_raw',   name: 'Fresh Fish',    category: 'food',    icon: '🐟', weight: 0.7, stack: 5,  modelPath: `${M_ITEM}/Fish.fbx`,          description: 'Slippery catch. Fillet it first.', consume: { hunger: 12, infection: 1 } },
  fish_filet: { id: 'fish_filet', name: 'Fish Filet',    category: 'food',    icon: '🍣', weight: 0.3, stack: 10, modelPath: `${M_ITEM}/FishFile.fbx`,      description: 'Cleaned filet, ready to cook.', consume: { hunger: 18 } },
  fish_cooked:{ id: 'fish_cooked',name: 'Cooked Filet',  category: 'food',    icon: '🍤', weight: 0.3, stack: 10, modelPath: `${M_ITEM}/FishFileCoocked.fbx`,description: 'Hot, safe, satisfying.', consume: { hunger: 38, health: 4, temperature: 3 } },
  // No `consume` field — must be opened with a knife (open_can recipe) first.
  food_can:   { id: 'food_can',   name: 'Canned Food',   category: 'food',    icon: '🥫', weight: 0.4, stack: 10, modelPath: `${M_ITEM}/Foodcan.fbx`,       description: 'Sealed — needs to be opened.' },
  food_can_open:{id:'food_can_open',name:'Open Can',     category: 'food',    icon: '🥫', weight: 0.4, stack: 10, modelPath: `${M_ITEM}/FoodcanOpen.fbx`,   description: 'Eat soon before it spoils.', consume: { hunger: 32, thirst: 4 } },
  mushroom_a: { id: 'mushroom_a', name: 'Brown Mushroom',category: 'food',    icon: '🍄', weight: 0.1, stack: 20, modelPath: `${M_ITEM}/Mushroom001.fbx`,   description: 'Edible, but bland.', consume: { hunger: 8 } },
  mushroom_b: { id: 'mushroom_b', name: 'Cap Mushroom',  category: 'food',    icon: '🍄', weight: 0.1, stack: 20, modelPath: `${M_ITEM}/Mushroom002.fbx`,   description: 'Common forest mushroom.', consume: { hunger: 10 } },
  mushroom_c: { id: 'mushroom_c', name: 'Toadstool',     category: 'food',    icon: '🍄', weight: 0.1, stack: 20, modelPath: `${M_ITEM}/Mushroom003.fbx`,   description: 'Identify before eating.', consume: { hunger: 6, health: -10 } },

  // ===== WATER =====
  bottle_full:  { id: 'bottle_full',  name: 'Water Bottle',     category: 'water', icon: '🍶', weight: 0.6, stack: 5, modelPath: `${M_ITEM}/Bottle.fbx`,        description: 'Clean drinking water.', consume: { thirst: 40 } },
  bottle_empty: { id: 'bottle_empty', name: 'Empty Bottle',     category: 'water', icon: '🫙', weight: 0.2, stack: 5, modelPath: `${M_ITEM}/PlasticBottle.fbx`, description: 'Refill at a water source.' },
  canteen:      { id: 'canteen',      name: 'Canteen',          category: 'water', icon: '🧴', weight: 0.5, stack: 1, modelPath: `${M_ITEM}/Canteen.fbx`,       description: 'Holds 3 portions of water.', consume: { thirst: 30 }, durability: 3 },
  cup:          { id: 'cup',          name: 'Tin Cup',          category: 'water', icon: '🥛', weight: 0.1, stack: 4, modelPath: `${M_ITEM}/Cup.fbx`,           description: 'Boil snowmelt or river water.' },
  jerrycan:     { id: 'jerrycan',     name: 'Jerrycan',         category: 'water', icon: '⛽', weight: 8.0, stack: 1, modelPath: `${M_ITEM}/Jerrycan.fbx`,      description: 'Bulk water (or fuel) container.' },

  // ===== MEDICAL =====
  bandage:    { id: 'bandage',    name: 'Bandage',       category: 'medical', icon: '🩹', weight: 0.05, stack: 10, modelPath: `${M_ITEM}/Bandage.fbx`,       description: 'Stops bleeding, heals a little.', consume: { health: 15, bleed: -1 } },
  first_aid:  { id: 'first_aid',  name: 'First Aid Kit', category: 'medical', icon: '⛑️', weight: 0.8,  stack: 3,  modelPath: `${M_ITEM}/FirstAid.fbx`,      description: 'Full triage. Cures bleeding and infection.', consume: { health: 60, bleed: -1, infection: -1 } },
  duct_tape:  { id: 'duct_tape',  name: 'Duct Tape',     category: 'material',icon: '🧻', weight: 0.3,  stack: 5,  modelPath: `${M_ITEM}/DuckTape.fbx`,      description: 'Crafting binding material.' },

  // ===== TOOLS =====
  axe_fire:   { id: 'axe_fire',   name: 'Fire Axe',     category: 'tool',     icon: '🪓', weight: 2.6, stack: 1, modelPath: `${M_ITEM}/FireAxe.fbx`,       description: 'Heavy chopping axe — great vs wood.', damage: 32, range: 1.6, durability: 200 },
  hatchet:    { id: 'hatchet',    name: 'Hatchet',      category: 'tool',     icon: '🪓', weight: 1.2, stack: 1, modelPath: `${M_ITEM}/Hatchet.fbx`,       description: 'One-handed chopper.', damage: 22, range: 1.4, durability: 150 },
  pickaxe:    { id: 'pickaxe',    name: 'Pickaxe',      category: 'tool',     icon: '⛏️', weight: 2.4, stack: 1, modelPath: `${M_ITEM}/Pickaxe.fbx`,       description: 'Mines stone and ore.', damage: 18, range: 1.4, durability: 180 },
  climbing_pick:{id:'climbing_pick',name:'Climbing Pick',category:'tool',     icon: '⛏️', weight: 0.9, stack: 1, modelPath: `${M_ITEM}/ClimbingPick.fbx`,  description: 'Climb cliffs, light melee.', damage: 14, range: 1.1, durability: 100 },
  shovel:     { id: 'shovel',     name: 'Shovel',       category: 'tool',     icon: '🪏', weight: 1.8, stack: 1, modelPath: `${M_ITEM}/Shovle.fbx`,        description: 'Dig for buried loot.', damage: 12, range: 1.6, durability: 120 },
  saw:        { id: 'saw',        name: 'Hand Saw',     category: 'tool',     icon: '🪚', weight: 0.7, stack: 1, modelPath: `${M_ITEM}/Saw.fbx`,           description: 'Cuts planks from logs.', damage: 8,  range: 1.0, durability: 80 },
  hammer:     { id: 'hammer',     name: 'Hammer',       category: 'tool',     icon: '🔨', weight: 1.0, stack: 1, modelPath: `${M_ITEM}/Hammer.fbx`,        description: 'Required for building.', damage: 14, range: 1.2, durability: 100 },
  crowbar:    { id: 'crowbar',    name: 'Crowbar',      category: 'tool',     icon: '🪛', weight: 1.6, stack: 1, modelPath: `${M_ITEM}/Crowbar.fbx`,       description: 'Pries open locked containers.', damage: 18, range: 1.3, durability: 150 },
  flashlight: { id: 'flashlight', name: 'Flashlight',   category: 'tool',     icon: '🔦', weight: 0.4, stack: 1, modelPath: `${M_ITEM}/Flashlight.fbx`,    description: 'Hand torch. Eats batteries.', durability: 100 },
  lighter:    { id: 'lighter',    name: 'Lighter',      category: 'tool',     icon: '🔥', weight: 0.05,stack: 1, modelPath: `${M_ITEM}/Lighter.fbx`,       description: 'Starts campfires instantly.', durability: 50 },
  glow_stick: { id: 'glow_stick', name: 'Glow Stick',   category: 'tool',     icon: '💡', weight: 0.05,stack: 10,modelPath: `${M_ITEM}/GlowStick.fbx`,     description: 'Single-use ambient light.' },
  compass:    { id: 'compass',    name: 'Compass',      category: 'tool',     icon: '🧭', weight: 0.1, stack: 1, modelPath: `${M_ITEM}/Compass.fbx`,       description: 'Always points north.' },
  radio:      { id: 'radio',      name: 'Radio',        category: 'tool',     icon: '📻', weight: 1.0, stack: 1, modelPath: `${M_ITEM}/Radio.fbx`,         description: 'Picks up faint broadcasts.' },
  fishing_rod:{ id: 'fishing_rod',name: 'Fishing Rod',  category: 'tool',     icon: '🎣', weight: 1.0, stack: 1, modelPath: `${M_ITEM}/FishingRod.fbx`,    description: 'Catch fish at any river.', durability: 80 },
  pan:        { id: 'pan',        name: 'Frying Pan',   category: 'tool',     icon: '🍳', weight: 0.8, stack: 1, modelPath: `${M_ITEM}/Pan.fbx`,           description: 'For cooking on a campfire.' },
  pot_small:  { id: 'pot_small',  name: 'Small Pot',    category: 'tool',     icon: '🍲', weight: 1.2, stack: 1, modelPath: `${M_ITEM}/PotSmall.fbx`,      description: 'Boils water, cooks stew.' },
  pot_large:  { id: 'pot_large',  name: 'Large Pot',    category: 'tool',     icon: '🍲', weight: 2.0, stack: 1, modelPath: `${M_ITEM}/PotLarge.fbx`,      description: 'Bigger meals, more thirst.' },
  plate_empty:{ id: 'plate_empty',name: 'Empty Plate',  category: 'tool',     icon: '🍽️', weight: 0.2, stack: 4, modelPath: `${M_ITEM}/PlateEmpty.fbx`,    description: 'Serve cooked food.' },
  plate_full: { id: 'plate_full', name: 'Full Plate',   category: 'food',     icon: '🍱', weight: 0.6, stack: 4, modelPath: `${M_ITEM}/PlateFull.fbx`,     description: 'A proper meal.', consume: { hunger: 50, thirst: 8, health: 4 } },
  karabiner_a:{ id: 'karabiner_a',name: 'Carabiner',    category: 'tool',     icon: '🔗', weight: 0.1, stack: 8, modelPath: `${M_ITEM}/Karabiner001.fbx`,  description: 'Climbing gear and crafting.' },
  karabiner_b:{ id: 'karabiner_b',name: 'Steel Carabiner',category:'tool',    icon: '🔗', weight: 0.1, stack: 8, modelPath: `${M_ITEM}/Karabiner002.fbx`,  description: 'Stronger variant.' },

  // ===== MELEE WEAPONS =====
  baseball_bat:      { id: 'baseball_bat',      name: 'Baseball Bat',      category: 'weapon_melee', icon: '🏏', weight: 1.0, stack: 1, modelPath: `${M_ITEM}/BaseballBat.fbx`,       description: 'Solid blunt weapon.', damage: 24, range: 1.7, durability: 120 },
  baseball_bat_nails:{ id: 'baseball_bat_nails',name: 'Bat with Nails',    category: 'weapon_melee', icon: '🏏', weight: 1.2, stack: 1, modelPath: `${M_ITEM}/BaseballBat_Nails.fbx`, description: 'Crude but brutal.', damage: 32, range: 1.7, durability: 90 },
  knife:    { id: 'knife',    name: 'Hunting Knife', category: 'weapon_melee', icon: '🔪', weight: 0.4, stack: 1, modelPath: `${M_ITEM}/Knife.fbx`,    description: 'Skin animals, fight close.', damage: 18, range: 0.8, durability: 100 },
  cleaver:  { id: 'cleaver',  name: 'Cleaver',       category: 'weapon_melee', icon: '🔪', weight: 1.2, stack: 1, modelPath: `${M_ITEM}/Cleaver.fbx`,  description: 'Heavy butcher\'s blade.', damage: 26, range: 1.0, durability: 110 },
  machete:  { id: 'machete',  name: 'Machete',       category: 'weapon_melee', icon: '🗡️', weight: 1.0, stack: 1, modelPath: `${M_ITEM}/Machete.fbx`,  description: 'Clears brush, cleaves enemies.', damage: 28, range: 1.4, durability: 130 },
  torch:    { id: 'torch',    name: 'Lit Torch',     category: 'weapon_melee', icon: '🔥', weight: 0.5, stack: 1, modelPath: `${M_ITEM}/Torch.fbx`,    description: 'Light + warmth + weapon.', damage: 8,  range: 1.2, durability: 200 },
  arrow:    { id: 'arrow',    name: 'Arrow',         category: 'ammo',         icon: '🏹', weight: 0.05,stack:30, modelPath: `${M_ITEM}/Arrow.fbx`,    description: 'For recurve bows.' },
  bow:      { id: 'bow',      name: 'Recurve Bow',   category: 'weapon_special',icon: '🏹', weight: 1.0, stack: 1, modelPath: `${M_ITEM}/RecurveBow.fbx`,description: 'Silent ranged weapon.', damage: 35, range: 35, ammoId: 'arrow', durability: 150 },
  quiver:   { id: 'quiver',   name: 'Quiver',        category: 'tool',          icon: '🏹', weight: 0.3, stack: 1, modelPath: `${M_ITEM}/Quiver.fbx`,   description: 'Holds 30 arrows on your back.' },
  rifle_old:{ id: 'rifle_old',name: 'Hunting Rifle', category: 'weapon_rifle',  icon: '🔫', weight: 3.5, stack: 1, modelPath: `${M_ITEM}/HuntingRifle.fbx`,description: 'Old wooden bolt-action.', damage: 65, range: 80, ammoId: 'ammo_308', magazine: 5, rateOfFire: 30 },
  clock_9mm:{ id: 'clock_9mm',name: 'Glock 9mm',     category: 'weapon_pistol', icon: '🔫', weight: 0.9, stack: 1, modelPath: `${M_ITEM}/Clock9mm.fbx`, description: 'Reliable sidearm.', damage: 24, range: 30, ammoId: 'ammo_9mm', magazine: 17, rateOfFire: 360 },
  ammo_308: { id: 'ammo_308', name: '.308 Rounds',   category: 'ammo',          icon: '🟫', weight: 0.02,stack:60, modelPath: `${M_ITEM}/Ammo.308.fbx`, description: 'Hunting rifle ammunition.' },
  ammo_9mm: { id: 'ammo_9mm', name: '9mm Rounds',    category: 'ammo',          icon: '🟡', weight: 0.01,stack:90, modelPath: `${M_ITEM}/Ammo9mm.fbx`,  description: 'Standard pistol ammunition.' },
  ammo_556: { id: 'ammo_556', name: '5.56 NATO', category: 'ammo', icon: '🟢', weight: 0.012, stack: 90, modelPath: `${M_ITEM}/Ammo.308.fbx`, description: 'Intermediate rifle ammunition (M27, modern carbines).' },
  ammo_12ga: { id: 'ammo_12ga', name: '12 Gauge Shell', category: 'ammo', icon: '🔴', weight: 0.05, stack: 30, modelPath: `${M_ITEM}/Ammo.308.fbx`, description: 'Shotgun shell. Also fits the Executioner revolver.' },

  // ===== MODERN WEAPONS (player-uploaded GLBs) =====
  // Riot/assault shield: bash weapon now; block stamina hooks pending in
  // combat layer — treated as durable melee with low DPS, high HP.
  assault_shield: { id: 'assault_shield', name: 'Assault Shield', category: 'weapon_melee', icon: '🛡️', weight: 8.0, stack: 1, modelPath: 'models/weapons/modern/assault_shield.glb', description: 'Ballistic riot shield. Bash with primary; intended off-hand defender.', damage: 14, range: 1.2, durability: 300 },
  bo2_executioner: { id: 'bo2_executioner', name: 'Executioner', category: 'weapon_pistol', icon: '🔫', weight: 1.4, stack: 1, modelPath: 'models/weapons/modern/black_ops_2_executioner.glb', description: 'Five-shot revolver chambered for 12 ga shells. Devastating close-range.', damage: 55, range: 12, ammoId: 'ammo_12ga', magazine: 5, rateOfFire: 90, durability: 220 },
  bo2_m27: { id: 'bo2_m27', name: 'M27 IAR', category: 'weapon_rifle', icon: '🔫', weight: 4.2, stack: 1, modelPath: 'models/weapons/modern/black_ops_2_m27.glb', description: 'Infantry automatic rifle. 30-round mag, sustained fire.', damage: 28, range: 60, ammoId: 'ammo_556', magazine: 30, rateOfFire: 750, durability: 260 },

  // ===== MATERIALS / RESOURCES =====
  wood_chopped:{ id: 'wood_chopped', name: 'Chopped Wood', category: 'material', icon: '🪵', weight: 1.5, stack: 30, modelPath: `${M_ITEM}/ChopedWood.fbx`, description: 'Burns in campfires; planks for crafting.' },
  branch_a:    { id: 'branch_a',     name: 'Branch',       category: 'material', icon: '🌿', weight: 0.5, stack: 20, modelPath: `${M_ITEM}/Branch001.fbx`,  description: 'Kindling, arrow shafts.' },
  branch_b:    { id: 'branch_b',     name: 'Long Branch',  category: 'material', icon: '🌿', weight: 0.7, stack: 15, modelPath: `${M_ITEM}/Branch002.fbx`,  description: 'Crafts spears and bows.' },
  rock_1:      { id: 'rock_1',       name: 'Small Stone',  category: 'material', icon: '🪨', weight: 0.3, stack: 30, modelPath: `${M_ITEM}/Rock001.fbx`,    description: 'Tool tips, slings.' },
  rock_2:      { id: 'rock_2',       name: 'Stone',        category: 'material', icon: '🪨', weight: 0.6, stack: 20, modelPath: `${M_ITEM}/Rock002.fbx`,    description: 'Build foundations.' },
  rock_3:      { id: 'rock_3',       name: 'Heavy Stone',  category: 'material', icon: '🪨', weight: 1.2, stack: 15, modelPath: `${M_ITEM}/Rock003.fbx`,    description: 'Forge anvils.' },
  rock_4:      { id: 'rock_4',       name: 'Boulder',      category: 'material', icon: '🪨', weight: 2.5, stack: 10, modelPath: `${M_ITEM}/Rock004.fbx`,    description: 'Smelting weight.' },
  rock_5:      { id: 'rock_5',       name: 'Flint',        category: 'material', icon: '🪨', weight: 0.2, stack: 30, modelPath: `${M_ITEM}/Rock005.fbx`,    description: 'Sparks for fires, knife edges.' },
  rock_6:      { id: 'rock_6',       name: 'Coal',         category: 'material', icon: '⚫', weight: 0.4, stack: 20, modelPath: `${M_ITEM}/Rock006.fbx`,    description: 'Hot, slow-burning fuel.' },
  rock_7:      { id: 'rock_7',       name: 'Ore Chunk',    category: 'material', icon: '🪨', weight: 1.0, stack: 15, modelPath: `${M_ITEM}/Rock007.fbx`,    description: 'Smelt to ingots.' },

  // ===== CLOTHING =====
  backpack:     { id: 'backpack',     name: 'Backpack',      category: 'clothing', icon: '🎒', weight: 1.0, stack: 1, modelPath: `${M_ITEM}/Backpack.fbx`,     description: '+12 inventory slots.' },
  backpack_2:   { id: 'backpack_2',   name: 'Hiker Pack',    category: 'clothing', icon: '🎒', weight: 1.5, stack: 1, modelPath: `${M_ITEM}/Backpack2.fbx`,    description: '+20 inventory slots.' },
  food_backpack:{ id: 'food_backpack',name: 'Food Pack',     category: 'clothing', icon: '🎒', weight: 1.2, stack: 1, modelPath: `${M_ITEM}/FoodBackpack.fbx`, description: 'Insulated, slows food spoilage.' },
  boots:        { id: 'boots',        name: 'Hiking Boots',  category: 'clothing', icon: '🥾', weight: 1.4, stack: 1, modelPath: `${M_ITEM}/Boots.fbx`,        description: '+5% movement, +temperature.' },

  // ===== STRUCTURES (placeable in build mode) =====
  // ── Modular construction kit (kaykit_dungeon GLBs, 4 m grid) ─────────────
  // Stack sizes chosen so a 4×4 cell base + walls is achievable in a single
  // construction session without farming. Players can always craft more.
  mb_foundation:  { id: 'mb_foundation',  name: 'Foundation',     category: 'structure', icon: '🟫', weight: 8.0, stack: 20, modelPath: 'models/environment/kaykit_dungeon/floorDecoration_tilesLarge.gltf.glb', description: '4 m × 4 m base tile. Snaps to grid; everything else stacks on top.', placeable: true },
  mb_wall:        { id: 'mb_wall',        name: 'Wall',           category: 'structure', icon: '🧱', weight: 3.0, stack: 40, modelPath: 'models/environment/kaykit_dungeon/wall.gltf.glb',                       description: 'Solid wall segment. Press R while ghosted to rotate 90°.', placeable: true },
  mb_wall_door:   { id: 'mb_wall_door',   name: 'Door Frame',     category: 'structure', icon: '🚪', weight: 3.5, stack: 12, modelPath: 'models/environment/kaykit_dungeon/wall_door.gltf.glb',                  description: 'Wall with an opening. Pair with a Door piece.', placeable: true },
  mb_door:        { id: 'mb_door',        name: 'Door',           category: 'structure', icon: '🚪', weight: 1.5, stack: 12, modelPath: 'models/environment/kaykit_dungeon/door.gltf.glb',                       description: 'Hinged door. Slot inside a Door Frame.', placeable: true },
  mb_wall_window: { id: 'mb_wall_window', name: 'Window Wall',    category: 'structure', icon: '🪟', weight: 3.0, stack: 12, modelPath: 'models/environment/kaykit_dungeon/wall_window.gltf.glb',                description: 'Wall with a glassless window — line-of-sight, no entry.', placeable: true },
  mb_wall_corner: { id: 'mb_wall_corner', name: 'Corner Wall',    category: 'structure', icon: '⊿',  weight: 3.0, stack: 16, modelPath: 'models/environment/kaykit_dungeon/wallCorner.gltf.glb',                description: '90° corner. Use at the meeting of two wall runs.', placeable: true },
  mb_floor:       { id: 'mb_floor',       name: 'Floor',          category: 'structure', icon: '◼️', weight: 4.0, stack: 24, modelPath: 'models/environment/kaykit_dungeon/floorDecoration_wood.gltf.glb',       description: 'Walkable second-storey wooden floor.', placeable: true },
  mb_stairs:      { id: 'mb_stairs',      name: 'Stairs',         category: 'structure', icon: '🪜', weight: 5.0, stack: 8,  modelPath: 'models/environment/kaykit_dungeon/stairs.gltf.glb',                     description: 'Lets you reach a second storey.', placeable: true },
  mb_roof:        { id: 'mb_roof',        name: 'Roof',           category: 'structure', icon: '🏠', weight: 4.0, stack: 16, modelPath: 'models/environment/kaykit_dungeon/floorDecoration_tilesLarge.gltf.glb', description: 'Caps a wall ring at 3 m height.', placeable: true },

  // medieval_village palette — alternative wall/roof finishes for variety.
  mb_wall_plaster: { id: 'mb_wall_plaster', name: 'Plaster Wall', category: 'structure', icon: '🧱', weight: 3.0, stack: 40, modelPath: 'models/environment/medieval_village/glTF/Wall_Plaster_Straight.gltf', description: 'Whitewashed plaster wall segment.', placeable: true },
  mb_wall_brick: { id: 'mb_wall_brick', name: 'Brick Wall', category: 'structure', icon: '🧱', weight: 4.0, stack: 40, modelPath: 'models/environment/medieval_village/glTF/Wall_UnevenBrick_Straight.gltf', description: 'Heavier brick wall — better visual mass.', placeable: true },
  mb_roof_tile: { id: 'mb_roof_tile', name: 'Tiled Roof', category: 'structure', icon: '🏠', weight: 5.0, stack: 12, modelPath: 'models/environment/medieval_village/glTF/Roof_RoundTiles_4x4.gltf', description: '4×4 round-tile roof cap. Sits at 3 m above grid.', placeable: true },
  mb_stairs_solid: { id: 'mb_stairs_solid', name: 'Solid Stairs', category: 'structure', icon: '🪜', weight: 6.0, stack: 6, modelPath: 'models/environment/medieval_village/glTF/Stair_Interior_Solid.gltf', description: 'Solid interior staircase.', placeable: true },

  // fantasy_megakit furniture — interior decoration / crafting stations.
  mb_workbench: { id: 'mb_workbench', name: 'Workbench', category: 'structure', icon: '🛠️', weight: 12.0, stack: 1, modelPath: 'models/props/fantasy_megakit/Exports/glTF/Workbench.gltf', description: 'Crafting station for basic tools.', placeable: true },
  mb_anvil: { id: 'mb_anvil', name: 'Anvil', category: 'structure', icon: '⚒️', weight: 25.0, stack: 1, modelPath: 'models/props/fantasy_megakit/Exports/glTF/Anvil.gltf', description: 'Forge weapons and armour.', placeable: true },
  mb_table: { id: 'mb_table', name: 'Table', category: 'structure', icon: '🪑', weight: 8.0, stack: 2, modelPath: 'models/props/fantasy_megakit/Exports/glTF/Table_Large.gltf', description: 'Large interior table.', placeable: true },
  mb_bed: { id: 'mb_bed', name: 'Bed', category: 'structure', icon: '🛏️', weight: 10.0, stack: 1, modelPath: 'models/props/fantasy_megakit/Exports/glTF/Bed_Twin1.gltf', description: 'Sets respawn point. Faster fatigue recovery.', placeable: true },
  mb_chest: { id: 'mb_chest', name: 'Storage Chest', category: 'structure', icon: '🧰', weight: 6.0, stack: 4, modelPath: 'models/props/fantasy_megakit/Exports/glTF/Chest_Wood.gltf', description: 'Persistent shared storage container.', placeable: true },
  mb_bookcase: { id: 'mb_bookcase', name: 'Bookcase', category: 'structure', icon: '📚', weight: 8.0, stack: 2, modelPath: 'models/props/fantasy_megakit/Exports/glTF/Bookcase_2.gltf', description: 'Stores recipes and lore notes.', placeable: true },
  mb_bench: { id: 'mb_bench', name: 'Bench', category: 'structure', icon: '🪑', weight: 5.0, stack: 4, modelPath: 'models/props/fantasy_megakit/Exports/glTF/Bench.gltf', description: 'Seat. NPCs will use it when idle.', placeable: true },
  mb_lantern: { id: 'mb_lantern', name: 'Wall Lantern', category: 'structure', icon: '🏮', weight: 1.0, stack: 8, modelPath: 'models/props/fantasy_megakit/Exports/glTF/Lantern_Wall.gltf', description: 'Wall-mounted interior light.', placeable: true },

  campfire:    { id: 'campfire',    name: 'Campfire',    category: 'structure', icon: '🔥', weight: 5.0, stack: 1, modelPath: `${M_ITEM}/Campfire.fbx`,    description: 'Warmth, light, cooking.', placeable: true },
  shelter:     { id: 'shelter',     name: 'Shelter',     category: 'structure', icon: '🛖', weight: 8.0, stack: 1, modelPath: `${M_ITEM}/Shelter.fbx`,     description: 'Basic sleep spot.', placeable: true },
  tent_blue:   { id: 'tent_blue',   name: 'Blue Tent',   category: 'structure', icon: '⛺', weight: 6.0, stack: 1, modelPath: `${M_ITEM}/TentBlue.fbx`,    description: 'Sleep, save spawn point.', placeable: true },
  tent_green:  { id: 'tent_green',  name: 'Green Tent',  category: 'structure', icon: '⛺', weight: 6.0, stack: 1, modelPath: `${M_ITEM}/TentGreen.fbx`,   description: 'Camo variant.', placeable: true },
  bed:         { id: 'bed',         name: 'Makeshift Bed',category:'structure', icon: '🛏️', weight: 4.0, stack: 1, modelPath: `${M_ITEM}/MakeshiftBed.fbx`,description: 'Faster fatigue recovery.', placeable: true },
  drying_rack: { id: 'drying_rack', name: 'Drying Rack', category: 'structure', icon: '🪜', weight: 3.0, stack: 1, modelPath: `${M_ITEM}/DryingRack.fbx`,  description: 'Preserve meat and fish.', placeable: true },
  cooking_rack:{ id: 'cooking_rack',name: 'Cooking Rack',category: 'structure', icon: '🍢', weight: 3.5, stack: 1, modelPath: `${M_ITEM}/CoockingRack.fbx`,description: 'Cook meat over a campfire.', placeable: true },
  fence_a:     { id: 'fence_a',     name: 'Wood Fence',  category: 'structure', icon: '🚧', weight: 4.0, stack: 5, modelPath: `${M_ITEM}/Fence001.fbx`,    description: 'Slow enemies.', placeable: true },
  fence_b:     { id: 'fence_b',     name: 'Tall Fence',  category: 'structure', icon: '🚧', weight: 5.0, stack: 5, modelPath: `${M_ITEM}/Fence002.fbx`,    description: 'Heavier barricade.', placeable: true },
  candles:     { id: 'candles',     name: 'Candles',     category: 'structure', icon: '🕯️', weight: 0.4, stack: 6, modelPath: `${M_ITEM}/Candles.fbx`,     description: 'Cheap interior light.', placeable: true },
  bucket:      { id: 'bucket',      name: 'Bucket',      category: 'structure', icon: '🪣', weight: 1.0, stack: 1, modelPath: `${M_ITEM}/Bucket.fbx`,      description: 'Catch rainwater.', placeable: true },
  sleeping_bag:{ id: 'sleeping_bag',name: 'Sleeping Bag',category:'structure',  icon: '🛌', weight: 2.0, stack: 1, modelPath: `${M_ITEM}/SleepingBag.fbx`, description: 'Lightweight bedroll.', placeable: true },

  // ===== PLANTS (foragable, not directly inventory) =====
  bush_blueberry:{ id: 'bush_blueberry',name:'Blueberry Bush',category:'plant', icon:'🫐', weight:0, stack:1, modelPath:`${M_ITEM}/BlueberryBush.fbx`, description:'Forage berries.' },
};

/** Reverse lookup: category → list of items in it. */
export function itemsByCategory(category: SurvivalCategory): SurvivalItemDef[] {
  return Object.values(SURVIVAL_ITEMS).filter((i) => i.category === category);
}

/** Add weapon-pack guns programmatically — they're variants of pistol/rifle/etc. */
const WP1_PISTOL_NAMES = ['MS-C96', 'Revolver-A', 'Rvolver-B'];
const WP1_RIFLE_NAMES = ['AHKN-LV', 'PTSK', 'TMS-1909'];
const WP1_SHOTGUN_NAMES = ['CSO', 'PMPSG', 'SASGfbx'];
const WP1_SMG_NAMES = ['LCHSTRGN', 'M3GG', 'R2014-2806'];
const WP1_SPECIAL_NAMES = ['Bazooka', 'CrossBow', 'Gahtling'];
const WP1_MELEE_NAMES = ['Axe', 'Bat', 'Crewdriver', 'Crowbar', 'Frying-pan', 'Knife-A', 'Knife-B', 'Pickaxe', 'Shovel'];
const WP1_EXPL_NAMES = ['Dynamite', 'Grenade-01', 'Grenade-02', 'Grenade-03', 'Grenade-04', 'Molotov'];

function addWeapon(
  id: string,
  name: string,
  category: SurvivalCategory,
  modelPath: string,
  damage: number,
  range: number,
  extras: Partial<SurvivalItemDef> = {},
) {
  SURVIVAL_ITEMS[id] = {
    id, name, category, icon: '🔫', weight: 1.0, stack: 1, modelPath,
    description: name,
    damage, range, durability: 200,
    ...extras,
  };
}

WP1_PISTOL_NAMES.forEach((n) => addWeapon(`pistol_${n.toLowerCase()}`, n, 'weapon_pistol', `${M_PIST}/${n}.fbx`, 28, 25, { ammoId: 'ammo_9mm', magazine: 7, rateOfFire: 240 }));
WP1_RIFLE_NAMES.forEach((n) => addWeapon(`rifle_${n.toLowerCase()}`, n, 'weapon_rifle', `${M_RIFL}/${n}.fbx`, 55, 70, { ammoId: 'ammo_308', magazine: 5, rateOfFire: 60 }));
WP1_SHOTGUN_NAMES.forEach((n) => addWeapon(`shotgun_${n.toLowerCase()}`, n, 'weapon_shotgun', `${M_SHOT}/${n}.fbx`, 80, 15, { magazine: 6, rateOfFire: 90 }));
WP1_SMG_NAMES.forEach((n) => addWeapon(`smg_${n.toLowerCase()}`, n, 'weapon_smg', `${M_SMG}/${n}.fbx`, 18, 25, { ammoId: 'ammo_9mm', magazine: 30, rateOfFire: 720 }));
WP1_SPECIAL_NAMES.forEach((n) => addWeapon(`special_${n.toLowerCase()}`, n, 'weapon_special', `${M_SPC}/${n}.fbx`, 120, 60, { magazine: 1, rateOfFire: 30 }));
WP1_MELEE_NAMES.forEach((n) => addWeapon(`melee_${n.toLowerCase()}`, n, 'weapon_melee', `${M_MEL}/${n}.fbx`, 22, 1.5));
WP1_EXPL_NAMES.forEach((n) => addWeapon(`expl_${n.toLowerCase()}`, n, 'weapon_explosive', `${M_EXP}/${n}.fbx`, 100, 8, { stack: 5 }));

['Scope1', 'Scope2', 'Scope3', 'Scope4'].forEach((n, i) => {
  SURVIVAL_ITEMS[`scope_${i + 1}`] = {
    id: `scope_${i + 1}`, name: n, category: 'weapon_attachment',
    icon: '🔍', weight: 0.3, stack: 1,
    modelPath: `${M_SCP}/${n}.fbx`,
    description: `${n} sight attachment.`,
  };
});
