/**
 * Inventory Service
 * Manages character inventory items, equipment, and item tracking
 */

import {
  db,
  inventoryItemsTable,
  charactersTable,
  prefabsTable,
} from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { randomUUID } from "node:crypto";

export class ServiceError extends Error {
  constructor(
    public code: "not_found" | "invalid_input" | "conflict",
    message: string,
    public detail?: string,
  ) {
    super(message);
  }
}

export interface InventoryItemInput {
  characterId: string;
  prefabId: string;
  quantity?: number;
  slotIndex?: number;
  durability?: number;
  maxDurability?: number;
  enchantments?: Record<string, unknown>;
  customData?: Record<string, unknown>;
}

export interface InventoryItemUpdate {
  quantity?: number;
  slotIndex?: number;
  durability?: number;
  enchantments?: Record<string, unknown>;
  customData?: Record<string, unknown>;
}

export const inventoryService = {
  /**
   * Add item to inventory
   */
  async addItem(input: InventoryItemInput) {
    if (!input.characterId || !input.prefabId) {
      throw new ServiceError("invalid_input", "characterId and prefabId required");
    }

    // Verify character exists
    const character = await db.query.charactersTable.findFirst({
      where: eq(charactersTable.id, input.characterId),
    });

    if (!character) {
      throw new ServiceError("not_found", "Character not found");
    }

    // Verify prefab exists
    const prefab = await db.query.prefabsTable.findFirst({
      where: eq(prefabsTable.id, input.prefabId),
    });

    if (!prefab) {
      throw new ServiceError("not_found", "Item prefab not found");
    }

    const [item] = await db
      .insert(inventoryItemsTable)
      .values({
        id: randomUUID(),
        characterId: input.characterId,
        prefabId: input.prefabId,
        quantity: input.quantity ?? 1,
        slotIndex: input.slotIndex ?? null,
        durability: input.durability ?? null,
        maxDurability: input.maxDurability ?? null,
        enchantments: input.enchantments ?? null,
        customData: input.customData ?? null,
      })
      .returning();

    return item;
  },

  /**
   * Get inventory for character
   */
  async getInventory(characterId: string) {
    return db
      .select({
        id: inventoryItemsTable.id,
        characterId: inventoryItemsTable.characterId,
        prefabId: inventoryItemsTable.prefabId,
        prefabName: prefabsTable.name,
        prefabKind: prefabsTable.kind,
        quantity: inventoryItemsTable.quantity,
        slotIndex: inventoryItemsTable.slotIndex,
        durability: inventoryItemsTable.durability,
        maxDurability: inventoryItemsTable.maxDurability,
        enchantments: inventoryItemsTable.enchantments,
        customData: inventoryItemsTable.customData,
        createdAt: inventoryItemsTable.createdAt,
        updatedAt: inventoryItemsTable.updatedAt,
      })
      .from(inventoryItemsTable)
      .leftJoin(prefabsTable, eq(inventoryItemsTable.prefabId, prefabsTable.id))
      .where(eq(inventoryItemsTable.characterId, characterId))
      .orderBy(inventoryItemsTable.slotIndex);
  },

  /**
   * Get single inventory item
   */
  async getItem(itemId: string) {
    const item = await db.query.inventoryItemsTable.findFirst({
      where: eq(inventoryItemsTable.id, itemId),
    });

    if (!item) {
      throw new ServiceError("not_found", "Inventory item not found");
    }

    return item;
  },

  /**
   * Update inventory item
   */
  async updateItem(itemId: string, input: InventoryItemUpdate) {
    const item = await db.query.inventoryItemsTable.findFirst({
      where: eq(inventoryItemsTable.id, itemId),
    });

    if (!item) {
      throw new ServiceError("not_found", "Inventory item not found");
    }

    const [updated] = await db
      .update(inventoryItemsTable)
      .set({
        quantity: input.quantity ?? item.quantity,
        slotIndex: input.slotIndex ?? item.slotIndex,
        durability: input.durability ?? item.durability,
        enchantments: input.enchantments ?? item.enchantments,
        customData: input.customData ?? item.customData,
        updatedAt: new Date(),
      })
      .where(eq(inventoryItemsTable.id, itemId))
      .returning();

    return updated;
  },

  /**
   * Remove item from inventory
   */
  async removeItem(itemId: string) {
    const item = await db.query.inventoryItemsTable.findFirst({
      where: eq(inventoryItemsTable.id, itemId),
    });

    if (!item) {
      throw new ServiceError("not_found", "Inventory item not found");
    }

    await db.delete(inventoryItemsTable).where(eq(inventoryItemsTable.id, itemId));

    return true;
  },

  /**
   * Clear entire inventory
   */
  async clearInventory(characterId: string) {
    await db
      .delete(inventoryItemsTable)
      .where(eq(inventoryItemsTable.characterId, characterId));

    return true;
  },

  /**
   * Get items by type
   */
  async getItemsByType(characterId: string, itemType: string) {
    return db
      .select()
      .from(inventoryItemsTable)
      .where(
        and(
          eq(inventoryItemsTable.characterId, characterId),
          eq(prefabsTable.kind, itemType),
        ),
      )
      .leftJoin(prefabsTable, eq(inventoryItemsTable.prefabId, prefabsTable.id));
  },
};

