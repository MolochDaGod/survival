import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  jsonb,
  timestamp,
  boolean,
} from "drizzle-orm/pg-core";
import { charactersTable } from "./characters";
import { prefabsTable } from "./prefabs";

/**
 * Allies Table
 * Tracks companion NPCs, summons, and recruited allies
 */
export const alliesTable = pgTable("allies", {
  id: uuid("id").primaryKey().defaultRandom(),
  characterId: varchar("character_id", { length: 255 })
    .notNull()
    .references(() => charactersTable.id, { onDelete: "cascade" }),
  prefabId: varchar("prefab_id", { length: 255 })
    .notNull()
    .references(() => prefabsTable.id, { onDelete: "restrict" }),
  name: text("name").notNull(),
  level: integer("level").notNull().default(1),
  experience: integer("experience").notNull().default(0),
  health: integer("health").notNull().default(100),
  maxHealth: integer("max_health").notNull().default(100),
  stats: jsonb("stats").notNull().default({}), // strength, dexterity, etc.
  equipment: jsonb("equipment").notNull().default({}),
  skills: jsonb("skills").notNull().default([]),
  loyalty: integer("loyalty").notNull().default(50), // 0-100 scale
  isActive: boolean("is_active").notNull().default(true),
  recruitedAt: timestamp("recruited_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Ally = typeof alliesTable.$inferSelect;
export type InsertAlly = typeof alliesTable.$inferInsert;

