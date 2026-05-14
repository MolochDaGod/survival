import {
  pgTable,
  text,
  jsonb,
  real,
  boolean,
  integer,
  timestamp,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const PREFAB_KINDS = [
  "monster",
  "npc",
  "player_body",
  "item",
  "vfx",
  "container",
  "structure",
] as const;
export type PrefabKind = (typeof PREFAB_KINDS)[number];

export const prefabsTable = pgTable("prefabs", {
  id: text("id").primaryKey(),
  kind: text("kind", { enum: PREFAB_KINDS }).notNull(),
  name: text("name").notNull(),
  description: text("description"),
  modelPath: text("model_path"),
  texturePath: text("texture_path"),
  scale: real("scale").notNull().default(1.0),
  data: jsonb("data").notNull().default({}),
  tags: text("tags")
    .array()
    .notNull()
    .default(sql`ARRAY[]::text[]`),
  draft: boolean("draft").notNull().default(false),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Prefab = typeof prefabsTable.$inferSelect;
export type InsertPrefab = typeof prefabsTable.$inferInsert;
