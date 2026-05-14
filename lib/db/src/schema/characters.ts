import { pgTable, varchar, text, integer, boolean, bigint, jsonb } from "drizzle-orm/pg-core";

/**
 * Shared characters table — matches production schema from GrudgeBuilder.
 * Both apps read/write the same Neon DB.
 */
export const charactersTable = pgTable("characters", {
  id: varchar("id", { length: 255 }).primaryKey(),
  accountId: varchar("account_id", { length: 255 }),
  grudgeId: varchar("grudge_id", { length: 255 }),
  name: text("name").notNull(),
  raceId: text("race_id").notNull().default("human"),
  classId: text("class_id").notNull().default("survivor"),
  level: integer("level").notNull().default(1),
  xp: integer("xp").notNull().default(0),
  hp: integer("hp").notNull().default(100),
  energy: integer("energy").notNull().default(100),
  attributes: jsonb("attributes").notNull().default({}),
  equipment: jsonb("equipment").notNull().default({}),
  inventory: jsonb("inventory").notNull().default([]),
  professionLevels: jsonb("profession_levels").notNull().default({}),
  gold: integer("gold").notNull().default(0),
  experience: integer("experience").notNull().default(0),
  attributePoints: integer("attribute_points").notNull().default(24),
  skillPoints: integer("skill_points").notNull().default(0),
  faction: text("faction"),
  isGuest: boolean("is_guest"),
  isActive: boolean("is_active"),
  spriteConfig: jsonb("sprite_config"),
  model3d: jsonb("model_3d"),
  gameState: jsonb("game_state"),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }),
});

export type Character = typeof charactersTable.$inferSelect;
export type InsertCharacter = typeof charactersTable.$inferInsert;
