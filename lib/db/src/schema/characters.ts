import { pgTable, uuid, text, jsonb, timestamp } from "drizzle-orm/pg-core";
import { accountsTable } from "./accounts";

export const charactersTable = pgTable("characters", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id")
    .notNull()
    .references(() => accountsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  config: jsonb("config").notNull(),
  saveData: jsonb("save_data"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  lastPlayedAt: timestamp("last_played_at", { withTimezone: true }),
});

export type Character = typeof charactersTable.$inferSelect;
export type InsertCharacter = typeof charactersTable.$inferInsert;
