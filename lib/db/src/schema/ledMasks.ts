import { pgTable, varchar, text, integer, bigint, jsonb } from "drizzle-orm/pg-core";

/** CNFT LED masks minted to a Grudge ID server-side wallet. */
export const ledMasksTable = pgTable("led_masks", {
  id: varchar("id", { length: 36 }).primaryKey(),
  accountId: varchar("account_id", { length: 255 }).notNull(),
  grudgeId: varchar("grudge_id", { length: 255 }).notNull(),
  skinId: varchar("skin_id", { length: 64 }).notNull(),
  skinName: varchar("skin_name", { length: 128 }).notNull(),
  rarity: varchar("rarity", { length: 32 }).notNull(),
  priceGbux: integer("price_gbux").notNull().default(1000),
  walletAddress: text("wallet_address"),
  cnftMintId: varchar("cnft_mint_id", { length: 128 }),
  mintStatus: varchar("mint_status", { length: 24 }).notNull().default("minted"),
  traits: jsonb("traits"),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});

export type LedMask = typeof ledMasksTable.$inferSelect;
export type InsertLedMask = typeof ledMasksTable.$inferInsert;