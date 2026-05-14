export type EquipSlot =
  | 'mainhand'
  | 'offhand'
  | 'helm'
  | 'chest'
  | 'legs'
  | 'boots'
  | 'ring'
  | 'amulet';

export type ItemRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export interface ItemStats {
  damage?: number;
  armor?: number;
  health?: number;
  mana?: number;
  moveSpeed?: number;
  attackSpeed?: number;
  critChance?: number;
  strength?: number;
  agility?: number;
  intelligence?: number;
  endurance?: number;
}

export interface ItemDef {
  id: string;
  name: string;
  slot: EquipSlot;
  rarity: ItemRarity;
  icon: string;
  description: string;
  stats: ItemStats;
  levelReq?: number;
  weaponId?: string;
}

export interface InventoryItem {
  uid: string;
  defId: string;
}

export const RARITY_COLORS: Record<ItemRarity, number> = {
  common: 0xb0b0b0,
  uncommon: 0x4ade80,
  rare: 0x60a5fa,
  epic: 0xc084fc,
  legendary: 0xfbbf24,
};

export const RARITY_HEX: Record<ItemRarity, string> = {
  common: '#b0b0b0',
  uncommon: '#4ade80',
  rare: '#60a5fa',
  epic: '#c084fc',
  legendary: '#fbbf24',
};

export const RARITY_WEIGHT: Record<ItemRarity, number> = {
  common: 60,
  uncommon: 25,
  rare: 10,
  epic: 4,
  legendary: 1,
};

export const ITEM_DATABASE: Record<string, ItemDef> = {
  // ----- HELMS -----
  leather_cap: {
    id: 'leather_cap', name: 'Leather Cap', slot: 'helm', rarity: 'common',
    icon: '🪖', description: 'Basic head protection.',
    stats: { armor: 4, health: 8 },
  },
  iron_helm: {
    id: 'iron_helm', name: 'Iron Helm', slot: 'helm', rarity: 'uncommon',
    icon: '⛑️', description: 'Sturdy iron helmet.',
    stats: { armor: 10, health: 15, endurance: 1 },
  },
  shadow_hood: {
    id: 'shadow_hood', name: 'Shadow Hood', slot: 'helm', rarity: 'rare',
    icon: '👤', description: 'Hood of the dusk-walker.',
    stats: { armor: 8, agility: 3, critChance: 5 },
  },
  dragon_crown: {
    id: 'dragon_crown', name: 'Dragon Crown', slot: 'helm', rarity: 'legendary',
    icon: '👑', description: 'Forged from a dragon\'s skull.',
    stats: { armor: 25, strength: 5, intelligence: 5, health: 50 },
  },

  // ----- CHEST -----
  cloth_tunic: {
    id: 'cloth_tunic', name: 'Cloth Tunic', slot: 'chest', rarity: 'common',
    icon: '👕', description: 'Simple cloth shirt.',
    stats: { armor: 6, mana: 10 },
  },
  iron_breastplate: {
    id: 'iron_breastplate', name: 'Iron Breastplate', slot: 'chest', rarity: 'uncommon',
    icon: '🛡️', description: 'Heavy iron chest armor.',
    stats: { armor: 22, health: 30, endurance: 2 },
  },
  mage_robe: {
    id: 'mage_robe', name: 'Mage Robe', slot: 'chest', rarity: 'rare',
    icon: '🥋', description: 'Robes woven with arcane thread.',
    stats: { armor: 12, mana: 40, intelligence: 5 },
  },
  void_plate: {
    id: 'void_plate', name: 'Voidplate', slot: 'chest', rarity: 'epic',
    icon: '🦺', description: 'Plate forged in the void.',
    stats: { armor: 35, health: 60, strength: 4, endurance: 4 },
  },

  // ----- LEGS -----
  leather_pants: {
    id: 'leather_pants', name: 'Leather Pants', slot: 'legs', rarity: 'common',
    icon: '👖', description: 'Worn leather leggings.',
    stats: { armor: 5, moveSpeed: 2 },
  },
  iron_greaves: {
    id: 'iron_greaves', name: 'Iron Greaves', slot: 'legs', rarity: 'uncommon',
    icon: '🦵', description: 'Heavy leg plates.',
    stats: { armor: 14, health: 20 },
  },
  shadowsilk_pants: {
    id: 'shadowsilk_pants', name: 'Shadowsilk Pants', slot: 'legs', rarity: 'rare',
    icon: '🧦', description: 'Silken pants of the night.',
    stats: { armor: 10, moveSpeed: 8, agility: 4 },
  },

  // ----- BOOTS -----
  leather_boots: {
    id: 'leather_boots', name: 'Leather Boots', slot: 'boots', rarity: 'common',
    icon: '👞', description: 'Soft walking boots.',
    stats: { armor: 3, moveSpeed: 3 },
  },
  swift_treads: {
    id: 'swift_treads', name: 'Swift Treads', slot: 'boots', rarity: 'uncommon',
    icon: '👟', description: 'Lighter than air.',
    stats: { armor: 5, moveSpeed: 10, agility: 3 },
  },
  warlords_sabatons: {
    id: 'warlords_sabatons', name: "Warlord's Sabatons", slot: 'boots', rarity: 'epic',
    icon: '🥾', description: 'Boots of an ancient warlord.',
    stats: { armor: 18, health: 40, strength: 4, moveSpeed: 4 },
  },

  // ----- OFFHAND -----
  wooden_shield: {
    id: 'wooden_shield', name: 'Wooden Shield', slot: 'offhand', rarity: 'common',
    icon: '🛡️', description: 'Simple roundshield.',
    stats: { armor: 8, health: 10 },
  },
  iron_shield: {
    id: 'iron_shield', name: 'Iron Shield', slot: 'offhand', rarity: 'uncommon',
    icon: '🛡️', description: 'Bound in iron.',
    stats: { armor: 18, endurance: 3 },
  },
  arcane_focus: {
    id: 'arcane_focus', name: 'Arcane Focus', slot: 'offhand', rarity: 'rare',
    icon: '🔮', description: 'A floating crystal of power.',
    stats: { mana: 50, intelligence: 6, damage: 8 },
  },

  // ----- RINGS -----
  copper_ring: {
    id: 'copper_ring', name: 'Copper Ring', slot: 'ring', rarity: 'common',
    icon: '💍', description: 'Simple copper band.',
    stats: { health: 10 },
  },
  ring_of_might: {
    id: 'ring_of_might', name: 'Ring of Might', slot: 'ring', rarity: 'rare',
    icon: '💍', description: 'A warrior\'s ring.',
    stats: { strength: 4, damage: 5 },
  },
  ring_of_swiftness: {
    id: 'ring_of_swiftness', name: 'Ring of Swiftness', slot: 'ring', rarity: 'rare',
    icon: '💍', description: 'Lightens your step.',
    stats: { agility: 4, moveSpeed: 6, attackSpeed: 5 },
  },
  band_of_kings: {
    id: 'band_of_kings', name: 'Band of Kings', slot: 'ring', rarity: 'legendary',
    icon: '💍', description: 'Worn by ancient sovereigns.',
    stats: { strength: 5, agility: 5, intelligence: 5, endurance: 5, health: 30 },
  },

  // ----- AMULETS -----
  bone_charm: {
    id: 'bone_charm', name: 'Bone Charm', slot: 'amulet', rarity: 'common',
    icon: '📿', description: 'A small bone trinket.',
    stats: { health: 12 },
  },
  amulet_of_focus: {
    id: 'amulet_of_focus', name: 'Amulet of Focus', slot: 'amulet', rarity: 'uncommon',
    icon: '📿', description: 'Sharpens the mind.',
    stats: { mana: 25, intelligence: 3 },
  },
  heartstone_pendant: {
    id: 'heartstone_pendant', name: 'Heartstone Pendant', slot: 'amulet', rarity: 'epic',
    icon: '💎', description: 'Pulses with vital energy.',
    stats: { health: 80, endurance: 5, armor: 5 },
  },
};

// Loot tables — by enemy tier
export const LOOT_TABLES: Record<string, string[]> = {
  // basic enemies
  basic: [
    'leather_cap', 'leather_pants', 'leather_boots', 'cloth_tunic', 'wooden_shield',
    'copper_ring', 'bone_charm',
  ],
  // mid tier
  elite: [
    'iron_helm', 'iron_breastplate', 'iron_greaves', 'swift_treads', 'iron_shield',
    'amulet_of_focus', 'shadow_hood', 'mage_robe', 'shadowsilk_pants',
    'arcane_focus', 'ring_of_might', 'ring_of_swiftness',
  ],
  // boss/rare
  boss: [
    'void_plate', 'warlords_sabatons', 'heartstone_pendant',
    'dragon_crown', 'band_of_kings',
  ],
};

let _uidCounter = 0;
export function makeUid(): string {
  return `it_${Date.now().toString(36)}_${(_uidCounter++).toString(36)}`;
}

export function rollItemFromTable(table: string[]): InventoryItem | null {
  if (!table.length) return null;
  // weighted by rarity
  const weighted = table.map((id) => {
    const def = ITEM_DATABASE[id];
    return { id, w: def ? RARITY_WEIGHT[def.rarity] : 1 };
  });
  const total = weighted.reduce((s, x) => s + x.w, 0);
  let r = Math.random() * total;
  for (const e of weighted) {
    r -= e.w;
    if (r <= 0) return { uid: makeUid(), defId: e.id };
  }
  return { uid: makeUid(), defId: weighted[0].id };
}
