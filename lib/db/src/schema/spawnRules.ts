import {
  pgTable,
  uuid,
  text,
  real,
  integer,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";
import { prefabsTable } from "./prefabs";

export const spawnRulesTable = pgTable("spawn_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  prefabId: text("prefab_id")
    .notNull()
    .references(() => prefabsTable.id, { onDelete: "cascade" }),
  biome: text("biome"),
  minDistance: real("min_distance").notNull().default(18),
  maxDistance: real("max_distance").notNull().default(64),
  minWave: integer("min_wave").notNull().default(0),
  weight: integer("weight").notNull().default(100),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type SpawnRule = typeof spawnRulesTable.$inferSelect;
export type InsertSpawnRule = typeof spawnRulesTable.$inferInsert;
