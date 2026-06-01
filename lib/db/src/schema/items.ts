import {
  pgTable,
  varchar,
  text,
  integer,
  real,
  jsonb,
  timestamp,
  boolean,
} from "drizzle-orm/pg-core";

/**
 * Items Table
 * Defines item types, stats, and properties (separate from prefabs for game-specific data)
 */
export const itemsTable = pgTable("items", {
  id: varchar("id", { length: 255 }).primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  itemType: varchar("item_type", { length: 100 }).notNull(), // weapon, armor, consumable, material, etc.
  rarity: varchar("rarity", { length: 50 }).notNull().default("common"), // common, uncommon, rare, epic, legendary
  weight: real("weight").notNull().default(1.0),
  value: integer("value").notNull().default(0), // gold value
  maxStack: integer("max_stack").notNull().default(1),
  maxDurability: integer("max_durability"),
  stats: jsonb("stats").notNull().default({}), // damage, armor, etc.
  effects: jsonb("effects").notNull().default([]), // status effects, buffs, etc.
  requirements: jsonb("requirements").notNull().default({}), // level, stats, etc.
  enchantable: boolean("enchantable").notNull().default(false),
  tradeable: boolean("tradeable").notNull().default(true),
  soulbound: boolean("soulbound").notNull().default(false),
  iconUrl: text("icon_url"),
  modelPath: text("model_path"),
  customData: jsonb("custom_data"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Item = typeof itemsTable.$inferSelect;
export type InsertItem = typeof itemsTable.$inferInsert;

