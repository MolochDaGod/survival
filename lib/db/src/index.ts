import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool, types } = pg;

// ── BigInt safety ──────────────────────────────────────────────────────────
// PostgreSQL `bigint` (OID 20) is returned as a string by the `pg` driver.
// Drizzle's `bigint({ mode: "number" })` converts it, but some code paths
// (especially esbuild-bundled builds) can end up with native JS BigInt
// values that crash JSON.stringify. Force the pg driver to parse bigint
// columns as plain JS numbers at the lowest level so the issue never arises.
types.setTypeParser(types.builtins.INT8, (val: string) => {
  const n = Number(val);
  // Safety: if the value exceeds MAX_SAFE_INTEGER, fall back to string
  // to avoid silent precision loss. Our timestamps are epoch-ms which
  // won't overflow until year 287,396.
  return Number.isSafeInteger(n) ? n : val;
});

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
export { eq, ne, and, or, inArray, isNull, isNotNull, sql, desc, asc } from "drizzle-orm";
