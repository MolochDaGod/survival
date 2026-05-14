import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema });

export * from "./schema";

// Re-export the most common drizzle-orm helpers so workspace packages that
// only depend on @workspace/db (e.g. scripts) can build typed queries without
// adding drizzle-orm to their own dependencies.
export { eq, ne, and, or, inArray, isNull, isNotNull, sql } from "drizzle-orm";
