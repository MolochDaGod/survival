import { pgTable, varchar, text, integer, boolean, bigint, timestamp, jsonb } from "drizzle-orm/pg-core";

/**
 * Shared accounts table — matches the production schema used by
 * GrudgeBuilder (grudge-studio-api on Railway). Both apps read/write
 * the same Neon DB. DO NOT run drizzle push --force against this.
 */
export const accountsTable = pgTable("accounts", {
  id: varchar("id", { length: 255 }).primaryKey(),
  grudgeId: varchar("grudge_id", { length: 255 }),
  displayName: text("display_name"),
  puterUuid: varchar("puter_uuid", { length: 255 }),
  puterUsername: varchar("puter_username", { length: 255 }),
  email: varchar("email", { length: 255 }),
  authType: varchar("auth_type", { length: 255 }),
  isGuest: boolean("is_guest"),
  gold: integer("gold").notNull().default(0),
  premiumCurrency: integer("premium_currency").notNull().default(0),
  gbuxBalance: integer("gbux_balance").notNull().default(0),
  accountXp: integer("account_xp").notNull().default(0),
  avatarUrl: text("avatar_url"),
  walletAddress: text("wallet_address"),
  faction: varchar("faction", { length: 255 }),
  gameState: jsonb("game_state"),
  metadata: jsonb("metadata"),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }),
});

export type Account = typeof accountsTable.$inferSelect;
export type InsertAccount = typeof accountsTable.$inferInsert;
