import {
  pgTable,
  uuid,
  varchar,
  integer,
  jsonb,
  timestamp,
} from "drizzle-orm/pg-core";
import { charactersTable } from "./characters";
import { prefabsTable } from "./prefabs";

/**
 * Inventory Items Table
 * Tracks individual items in character inventories with durability, enchantments, etc.
 */
export const inventoryItemsTable = pgTable("inventory_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  characterId: varchar("character_id", { length: 255 })
    .notNull()
    .references(() => charactersTable.id, { onDelete: "cascade" }),
  prefabId: varchar("prefab_id", { length: 255 })
    .notNull()
    .references(() => prefabsTable.id, { onDelete: "restrict" }),
  quantity: integer("quantity").notNull().default(1),
  slotIndex: integer("slot_index"),
  durability: integer("durability"),
  maxDurability: integer("max_durability"),
  enchantments: jsonb("enchantments"),
  customData: jsonb("custom_data"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type InventoryItem = typeof inventoryItemsTable.$inferSelect;
export type InsertInventoryItem = typeof inventoryItemsTable.$inferInsert;

