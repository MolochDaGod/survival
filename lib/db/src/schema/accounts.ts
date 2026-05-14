import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";

export const accountsTable = pgTable("accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  grudgeId: text("grudge_id").notNull().unique(),
  displayName: text("display_name"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Account = typeof accountsTable.$inferSelect;
export type InsertAccount = typeof accountsTable.$inferInsert;
