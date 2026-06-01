import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { charactersTable } from "./characters";

/**
 * Achievements Table
 * Tracks unlocked achievements and milestones for characters
 */
export const achievementsTable = pgTable("achievements", {
  id: uuid("id").primaryKey().defaultRandom(),
  characterId: varchar("character_id", { length: 255 })
    .notNull()
    .references(() => charactersTable.id, { onDelete: "cascade" }),
  achievementKey: varchar("achievement_key", { length: 255 }).notNull(),
  title: text("title").notNull(),
  description: text("description"),
  iconUrl: text("icon_url"),
  rarity: varchar("rarity", { length: 50 }).default("common"), // common, rare, epic, legendary
  unlockedAt: timestamp("unlocked_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Achievement = typeof achievementsTable.$inferSelect;
export type InsertAchievement = typeof achievementsTable.$inferInsert;

