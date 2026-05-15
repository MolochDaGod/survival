import {
  EquipSlot,
  InventoryItem,
  ItemDef,
  ItemStats,
  ITEM_DATABASE,
} from './Items';

export type EquippedSet = Partial<Record<EquipSlot, InventoryItem>>;

export const ALL_SLOTS: EquipSlot[] = [
  'mainhand', 'offhand', 'helm', 'chest', 'legs', 'boots', 'ring', 'amulet',
];

export class Inventory {
  bag: InventoryItem[] = [];
  equipped: EquippedSet = {};
  bagCap: number = 24;

  onChange: (() => void) | null = null;
  onPickup: ((def: ItemDef) => void) | null = null;

  getDef(item: InventoryItem | undefined): ItemDef | null {
    if (!item) return null;
    return ITEM_DATABASE[item.defId] ?? null;
  }

  addToBag(item: InventoryItem): boolean {
    if (this.bag.length >= this.bagCap) return false;
    this.bag.push(item);
    const def = this.getDef(item);
    if (def) this.onPickup?.(def);
    this.onChange?.();
    return true;
  }

  removeFromBag(uid: string): InventoryItem | null {
    const idx = this.bag.findIndex((i) => i.uid === uid);
    if (idx < 0) return null;
    const [it] = this.bag.splice(idx, 1);
    this.onChange?.();
    return it;
  }

  equipFromBag(uid: string): boolean {
    const item = this.bag.find((i) => i.uid === uid);
    if (!item) return false;
    const def = this.getDef(item);
    if (!def) return false;

    const slot = def.slot;
    const currentlyEquipped = this.equipped[slot];

    // remove from bag
    this.removeFromBag(uid);

    // swap: put currently equipped into bag
    if (currentlyEquipped) {
      this.bag.push(currentlyEquipped);
    }

    this.equipped[slot] = item;
    this.onChange?.();
    return true;
  }

  unequip(slot: EquipSlot): boolean {
    const item = this.equipped[slot];
    if (!item) return false;
    if (this.bag.length >= this.bagCap) return false;
    this.bag.push(item);
    delete this.equipped[slot];
    this.onChange?.();
    return true;
  }

  dropFromBag(uid: string): InventoryItem | null {
    return this.removeFromBag(uid);
  }

  /** Sum up all stat bonuses from currently equipped items (base + rolled affixes). */
  getTotalStats(): ItemStats & Record<string, number> {
    const total: Record<string, number> = {
      damage: 0, armor: 0, health: 0, mana: 0, moveSpeed: 0,
      attackSpeed: 0, critChance: 0,
      strength: 0, agility: 0, intelligence: 0, endurance: 0,
    };
    for (const slot of ALL_SLOTS) {
      const item = this.equipped[slot];
      if (!item) continue;

      // Base stats from item definition
      const def = this.getDef(item);
      if (def) {
        const s = def.stats;
        total.damage += s.damage ?? 0;
        total.armor += s.armor ?? 0;
        total.health += s.health ?? 0;
        total.mana += s.mana ?? 0;
        total.moveSpeed += s.moveSpeed ?? 0;
        total.attackSpeed += s.attackSpeed ?? 0;
        total.critChance += s.critChance ?? 0;
        total.strength += s.strength ?? 0;
        total.agility += s.agility ?? 0;
        total.intelligence += s.intelligence ?? 0;
        total.endurance += s.endurance ?? 0;
      }

      // Rolled affix bonuses from game-systems loot roller
      if (item.bonusStats) {
        for (const [stat, value] of Object.entries(item.bonusStats)) {
          total[stat] = (total[stat] ?? 0) + value;
        }
      }
    }
    return total;
  }

  snapshot() {
    return {
      bag: this.bag.slice(),
      equipped: { ...this.equipped },
      bagCap: this.bagCap,
    };
  }
}
