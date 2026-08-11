import { pgTable, varchar, text, integer, boolean, bigint, jsonb, timestamp } from "drizzle-orm/pg-core";

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
  /** Deterministic GRDG-* build fingerprint (EntitySpec hash). */
  grudgeSpecId: varchar("grudge_spec_id", { length: 16 }),
  /** Solana cNFT mint address when character is minted on-chain. */
  cnftMintId: varchar("cnft_mint_id", { length: 128 }),
  /** Canonical GRUDGE6 prefab slug (sir-aldric-valorheart, …). */
  prefabId: varchar("prefab_id", { length: 64 }),
  /** Compact EntitySpec spawn code (GRDG1.…). */
  spawnCode: text("spawn_code"),
  gameEra: text("game_era").default("warlords"),
  activeForEra: boolean("active_for_era").default(false),
  schemaVersion: integer("schema_version").default(1),
  gameState: jsonb("game_state"),
  /** Character creation config (race, class, appearance, origin). */
  config: jsonb("config"),
  /** Full cloud-save JSON blob (stats, wave, inventory, buildings, professions). */
  saveData: jsonb("save_data"),
  /** When the player last loaded/played this character. */
  lastPlayedAt: timestamp("last_played_at", { withTimezone: true }),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }),
});

export type Character = typeof charactersTable.$inferSelect;
export type InsertCharacter = typeof charactersTable.$inferInsert;
