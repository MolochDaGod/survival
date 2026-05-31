/**
 * Crafting recipes for the survival pivot.
 *
 * A recipe converts N input stacks into 1+ output items. Recipes are
 * grouped by `station` so the UI can hide unbuildable recipes when the
 * player isn't near the right workstation. Costs reference IDs from
 * SurvivalItems.ts — never raw strings.
 *
 * Add a new recipe by appending to RECIPES; the crafting panel reads
 * the array directly so no other code changes are required.
 */

export type CraftingStation = 'none' | 'campfire' | 'cooking_rack' | 'workbench' | 'drying_rack';

export interface RecipeInput {
  itemId: string;
  qty: number;
}

export interface RecipeOutput {
  itemId: string;
  qty: number;
}

export interface Recipe {
  id: string;
  name: string;
  /** Item id used as the icon in the recipe row. */
  iconItemId: string;
  station: CraftingStation;
  /** Seconds it takes to craft once inputs are confirmed. */
  craftTime: number;
  inputs: RecipeInput[];
  outputs: RecipeOutput[];
  /** Short flavor / explanation shown beneath the recipe row. */
  description: string;
}

export const RECIPES: Recipe[] = [
  // ===== TIER 1 — pure handcraft, no station =====
  {
    id: 'craft_torch',
    name: 'Torch',
    iconItemId: 'torch',
    station: 'none',
    craftTime: 4,
    inputs: [{ itemId: 'branch_b', qty: 1 }, { itemId: 'duct_tape', qty: 1 }],
    outputs: [{ itemId: 'torch', qty: 1 }],
    description: 'A long branch wrapped in cloth — light + warmth.',
  },
  {
    id: 'craft_bandage',
    name: 'Bandage',
    iconItemId: 'bandage',
    station: 'none',
    craftTime: 3,
    inputs: [{ itemId: 'duct_tape', qty: 1 }],
    outputs: [{ itemId: 'bandage', qty: 2 }],
    description: 'Tear cloth into bandages.',
  },
  {
    id: 'craft_arrow',
    name: 'Arrows',
    iconItemId: 'arrow',
    station: 'none',
    craftTime: 5,
    inputs: [{ itemId: 'branch_a', qty: 2 }, { itemId: 'rock_5', qty: 1 }],
    outputs: [{ itemId: 'arrow', qty: 5 }],
    description: 'Branch shafts with knapped flint heads.',
  },
  {
    id: 'craft_bow',
    name: 'Recurve Bow',
    iconItemId: 'bow',
    station: 'none',
    craftTime: 20,
    inputs: [{ itemId: 'branch_b', qty: 3 }, { itemId: 'duct_tape', qty: 2 }],
    outputs: [{ itemId: 'bow', qty: 1 }],
    description: 'Tension-strung longbow.',
  },
  {
    id: 'craft_knife',
    name: 'Hunting Knife',
    iconItemId: 'knife',
    station: 'none',
    craftTime: 10,
    inputs: [{ itemId: 'rock_5', qty: 2 }, { itemId: 'branch_a', qty: 1 }],
    outputs: [{ itemId: 'knife', qty: 1 }],
    description: 'Flint blade lashed to a wooden grip.',
  },

  // ===== STRUCTURES — buildable items go to your inventory then placed =====
  {
    id: 'build_campfire',
    name: 'Campfire',
    iconItemId: 'campfire',
    station: 'none',
    craftTime: 8,
    inputs: [{ itemId: 'wood_chopped', qty: 5 }, { itemId: 'rock_2', qty: 3 }],
    outputs: [{ itemId: 'campfire', qty: 1 }],
    description: 'Stack stones around split wood — light and warmth.',
  },
  {
    id: 'build_shelter',
    name: 'Shelter',
    iconItemId: 'shelter',
    station: 'none',
    craftTime: 30,
    inputs: [{ itemId: 'wood_chopped', qty: 12 }, { itemId: 'branch_b', qty: 6 }],
    outputs: [{ itemId: 'shelter', qty: 1 }],
    description: 'Lean-to that blocks rain and a bit of wind.',
  },
  {
    id: 'build_bed',
    name: 'Makeshift Bed',
    iconItemId: 'bed',
    station: 'workbench',
    craftTime: 25,
    inputs: [{ itemId: 'wood_chopped', qty: 6 }, { itemId: 'duct_tape', qty: 2 }],
    outputs: [{ itemId: 'bed', qty: 1 }],
    description: 'Sleep spot to set your respawn.',
  },
  {
    id: 'build_drying_rack',
    name: 'Drying Rack',
    iconItemId: 'drying_rack',
    station: 'workbench',
    craftTime: 18,
    inputs: [{ itemId: 'branch_b', qty: 6 }, { itemId: 'duct_tape', qty: 1 }],
    outputs: [{ itemId: 'drying_rack', qty: 1 }],
    description: 'Cure meat and fish into long-life rations.',
  },
  {
    id: 'build_cooking_rack',
    name: 'Cooking Rack',
    iconItemId: 'cooking_rack',
    station: 'none',
    craftTime: 15,
    inputs: [{ itemId: 'branch_b', qty: 4 }, { itemId: 'rock_2', qty: 2 }],
    outputs: [{ itemId: 'cooking_rack', qty: 1 }],
    description: 'Cook meat over an open campfire.',
  },
  {
    id: 'build_fence_a',
    name: 'Wood Fence',
    iconItemId: 'fence_a',
    station: 'none',
    craftTime: 8,
    inputs: [{ itemId: 'wood_chopped', qty: 4 }],
    outputs: [{ itemId: 'fence_a', qty: 2 }],
    description: 'Slow zombies, mark territory.',
  },

  // ===== ORC PROPS — craftable camp/settlement decorations =====
  {
    id: 'build_barrel',
    name: 'Storage Barrel',
    iconItemId: 'orc_barrel_1',
    station: 'workbench',
    craftTime: 12,
    inputs: [{ itemId: 'wood_chopped', qty: 6 }],
    outputs: [{ itemId: 'orc_barrel_1', qty: 1 }],
    description: 'Wooden barrel for camp storage.',
  },
  {
    id: 'build_flag',
    name: 'Faction Banner',
    iconItemId: 'orc_flag',
    station: 'none',
    craftTime: 10,
    inputs: [{ itemId: 'branch_b', qty: 3 }, { itemId: 'duct_tape', qty: 2 }],
    outputs: [{ itemId: 'orc_flag', qty: 1 }],
    description: 'Stake your faction\'s claim.',
  },
  {
    id: 'build_signpost',
    name: 'Signpost',
    iconItemId: 'orc_pointer',
    station: 'none',
    craftTime: 8,
    inputs: [{ itemId: 'wood_chopped', qty: 3 }, { itemId: 'branch_a', qty: 2 }],
    outputs: [{ itemId: 'orc_pointer', qty: 1 }],
    description: 'Mark directions for travelers.',
  },
  {
    id: 'build_standing_torch',
    name: 'Standing Torch',
    iconItemId: 'orc_torch_1',
    station: 'none',
    craftTime: 6,
    inputs: [{ itemId: 'branch_b', qty: 2 }, { itemId: 'duct_tape', qty: 1 }],
    outputs: [{ itemId: 'orc_torch_1', qty: 1 }],
    description: 'Tall camp torch — lights a wide area.',
  },
  {
    id: 'build_cauldron',
    name: 'Cauldron',
    iconItemId: 'orc_pot_1',
    station: 'workbench',
    craftTime: 20,
    inputs: [{ itemId: 'rock_7', qty: 4 }, { itemId: 'branch_b', qty: 3 }],
    outputs: [{ itemId: 'orc_pot_1', qty: 1 }],
    description: 'Large cooking pot on tripod — advanced cooking.',
  },
  {
    id: 'build_war_drum',
    name: 'War Drum',
    iconItemId: 'orc_drum_1',
    station: 'workbench',
    craftTime: 18,
    inputs: [{ itemId: 'wood_chopped', qty: 8 }, { itemId: 'duct_tape', qty: 3 }],
    outputs: [{ itemId: 'orc_drum_1', qty: 1 }],
    description: 'Beat to rally allies — morale buff zone.',
  },

  // ===== COOKING — needs campfire + cooking rack =====
  {
    id: 'cook_meat',
    name: 'Cooked Meat',
    iconItemId: 'plate_full',
    station: 'cooking_rack',
    craftTime: 12,
    inputs: [{ itemId: 'meat_raw', qty: 1 }],
    outputs: [{ itemId: 'plate_full', qty: 1 }],
    description: 'Sears off bacteria, kills infection risk.',
  },
  {
    id: 'cook_fish',
    name: 'Cooked Fish',
    iconItemId: 'fish_cooked',
    station: 'cooking_rack',
    craftTime: 10,
    inputs: [{ itemId: 'fish_filet', qty: 1 }],
    outputs: [{ itemId: 'fish_cooked', qty: 1 }],
    description: 'Hot, safe, restores warmth.',
  },
  {
    id: 'fillet_fish',
    name: 'Fillet Fish',
    iconItemId: 'fish_filet',
    station: 'none',
    craftTime: 4,
    inputs: [{ itemId: 'fish_raw', qty: 1 }, { itemId: 'knife', qty: 0 }],
    outputs: [{ itemId: 'fish_filet', qty: 1 }],
    description: 'Knife required (no consumption).',
  },
  {
    id: 'open_can',
    name: 'Open Can',
    iconItemId: 'food_can_open',
    station: 'none',
    craftTime: 2,
    inputs: [{ itemId: 'food_can', qty: 1 }, { itemId: 'knife', qty: 0 }],
    outputs: [{ itemId: 'food_can_open', qty: 1 }],
    description: 'Pry open with any blade.',
  },
  {
    id: 'boil_water',
    name: 'Boiled Water',
    iconItemId: 'bottle_full',
    station: 'campfire',
    craftTime: 8,
    inputs: [{ itemId: 'bottle_empty', qty: 1 }],
    outputs: [{ itemId: 'bottle_full', qty: 1 }],
    description: 'Sterilize collected water in a cup or bottle.',
  },
];

/** Cheap helper so the UI can group by station without re-traversing. */
export function recipesByStation(station: CraftingStation): Recipe[] {
  return RECIPES.filter((r) => r.station === station);
}
