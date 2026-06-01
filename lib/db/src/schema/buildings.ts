import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  real,
  jsonb,
  timestamp,
  boolean,
} from "drizzle-orm/pg-core";
import { charactersTable } from "./characters";
import { prefabsTable } from "./prefabs";

/**
 * Buildings Table
 * Tracks placed structures, bases, and constructions in the game world
 */
export const buildingsTable = pgTable("buildings", {
  id: uuid("id").primaryKey().defaultRandom(),
  characterId: varchar("character_id", { length: 255 })
    .notNull()
    .references(() => charactersTable.id, { onDelete: "cascade" }),
  prefabId: varchar("prefab_id", { length: 255 })
    .notNull()
    .references(() => prefabsTable.id, { onDelete: "restrict" }),
  name: text("name").notNull(),
  buildingType: varchar("building_type", { length: 100 }).notNull(), // shelter, farm, workshop, turret, etc.
  position: jsonb("position").notNull(), // { x, y, z }
  rotation: jsonb("rotation").notNull().default({}), // { x, y, z } in degrees
  scale: real("scale").notNull().default(1.0),
  health: integer("health").notNull().default(100),
  maxHealth: integer("max_health").notNull().default(100),
  level: integer("level").notNull().default(1),
  durability: integer("durability").notNull().default(100),
  maxDurability: integer("max_durability").notNull().default(100),
  isActive: boolean("is_active").notNull().default(true),
  isDestroyed: boolean("is_destroyed").notNull().default(false),
  storage: jsonb("storage"), // inventory for storage buildings
  production: jsonb("production"), // production data for farms/workshops
  upgrades: jsonb("upgrades").notNull().default({}), // applied upgrades
  customData: jsonb("custom_data"),
  builtAt: timestamp("built_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Building = typeof buildingsTable.$inferSelect;
export type InsertBuilding = typeof buildingsTable.$inferInsert;

