/**
 * Items Service
 * Manages item definitions, stats, and properties
 */

import { db, itemsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";

export class ServiceError extends Error {
  constructor(
    public code: "not_found" | "invalid_input" | "conflict",
    message: string,
    public detail?: string,
  ) {
    super(message);
  }
}

export interface ItemInput {
  id: string;
  name: string;
  description?: string;
  itemType: string;
  rarity?: "common" | "uncommon" | "rare" | "epic" | "legendary";
  weight?: number;
  value?: number;
  maxStack?: number;
  maxDurability?: number;
  stats?: Record<string, unknown>;
  effects?: unknown[];
  requirements?: Record<string, unknown>;
  enchantable?: boolean;
  tradeable?: boolean;
  soulbound?: boolean;
  iconUrl?: string;
  modelPath?: string;
  customData?: Record<string, unknown>;
}

export interface ItemUpdate {
  name?: string;
  description?: string;
  itemType?: string;
  rarity?: string;
  weight?: number;
  value?: number;
  maxStack?: number;
  maxDurability?: number;
  stats?: Record<string, unknown>;
  effects?: unknown[];
  requirements?: Record<string, unknown>;
  enchantable?: boolean;
  tradeable?: boolean;
  soulbound?: boolean;
  iconUrl?: string;
  modelPath?: string;
  customData?: Record<string, unknown>;
}

export const itemsService = {
  /**
   * Create item definition
   */
  async createItem(input: ItemInput) {
    if (!input.id || !input.name || !input.itemType) {
      throw new ServiceError("invalid_input", "id, name, and itemType required");
    }

    // Check if item already exists
    const existing = await db.query.itemsTable.findFirst({
      where: eq(itemsTable.id, input.id),
    });

    if (existing) {
      throw new ServiceError("conflict", "Item already exists");
    }

    const [item] = await db
      .insert(itemsTable)
      .values({
        id: input.id,
        name: input.name,
        description: input.description ?? null,
        itemType: input.itemType,
        rarity: input.rarity ?? "common",
        weight: input.weight ?? 1.0,
        value: input.value ?? 0,
        maxStack: input.maxStack ?? 1,
        maxDurability: input.maxDurability ?? null,
        stats: input.stats ?? {},
        effects: input.effects ?? [],
        requirements: input.requirements ?? {},
        enchantable: input.enchantable ?? false,
        tradeable: input.tradeable ?? true,
        soulbound: input.soulbound ?? false,
        iconUrl: input.iconUrl ?? null,
        modelPath: input.modelPath ?? null,
        customData: input.customData ?? null,
      })
      .returning();

    return item;
  },

  /**
   * Get item by ID
   */
  async getItem(itemId: string) {
    const item = await db.query.itemsTable.findFirst({
      where: eq(itemsTable.id, itemId),
    });

    if (!item) {
      throw new ServiceError("not_found", "Item not found");
    }

    return item;
  },

  /**
   * List all items
   */
  async listItems(limit: number = 100) {
    return db.select().from(itemsTable).limit(limit);
  },

  /**
   * Get items by type
   */
  async getItemsByType(itemType: string) {
    return db
      .select()
      .from(itemsTable)
      .where(eq(itemsTable.itemType, itemType))
      .orderBy(desc(itemsTable.rarity));
  },

  /**
   * Get items by rarity
   */
  async getItemsByRarity(rarity: string) {
    return db
      .select()
      .from(itemsTable)
      .where(eq(itemsTable.rarity, rarity))
      .orderBy(itemsTable.name);
  },

  /**
   * Update item
   */
  async updateItem(itemId: string, input: ItemUpdate) {
    const item = await db.query.itemsTable.findFirst({
      where: eq(itemsTable.id, itemId),
    });

    if (!item) {
      throw new ServiceError("not_found", "Item not found");
    }

    const [updated] = await db
      .update(itemsTable)
      .set({
        name: input.name ?? item.name,
        description: input.description ?? item.description,
        itemType: input.itemType ?? item.itemType,
        rarity: input.rarity ?? item.rarity,
        weight: input.weight ?? item.weight,
        value: input.value ?? item.value,
        maxStack: input.maxStack ?? item.maxStack,
        maxDurability: input.maxDurability ?? item.maxDurability,
        stats: input.stats ?? item.stats,
        effects: input.effects ?? item.effects,
        requirements: input.requirements ?? item.requirements,
        enchantable: input.enchantable ?? item.enchantable,
        tradeable: input.tradeable ?? item.tradeable,
        soulbound: input.soulbound ?? item.soulbound,
        iconUrl: input.iconUrl ?? item.iconUrl,
        modelPath: input.modelPath ?? item.modelPath,
        customData: input.customData ?? item.customData,
        updatedAt: new Date(),
      })
      .where(eq(itemsTable.id, itemId))
      .returning();

    return updated;
  },

  /**
   * Delete item
   */
  async deleteItem(itemId: string) {
    const item = await db.query.itemsTable.findFirst({
      where: eq(itemsTable.id, itemId),
    });

    if (!item) {
      throw new ServiceError("not_found", "Item not found");
    }

    await db.delete(itemsTable).where(eq(itemsTable.id, itemId));

    return true;
  },

  /**
   * Search items
   */
  async searchItems(query: string) {
    return db
      .select()
      .from(itemsTable)
      .where(db.sql`${itemsTable.name} ILIKE ${'%' + query + '%'}`);
  },
};

