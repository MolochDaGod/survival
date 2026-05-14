/**
 * Prefab routes — scriptable entity definitions.
 *
 * Read endpoints are public (the game client fetches prefabs on boot).
 * Write endpoints require the admin bearer token.
 *
 *   GET    /api/prefabs?kind=&includeDrafts=
 *   GET    /api/prefabs/:id
 *   POST   /api/prefabs                (admin)
 *   PUT    /api/prefabs/:id            (admin)
 *   DELETE /api/prefabs/:id            (admin)
 */
import { Router } from "express";
import { z } from "zod";
import { db, prefabsTable, PREFAB_KINDS } from "@workspace/db";
import { eq, and, sql, asc } from "drizzle-orm";
import { requireAdmin } from "../lib/adminAuth.js";

const upsertSchema = z.object({
  id: z
    .string()
    .min(1)
    .max(96)
    .regex(/^[a-z0-9_]+$/, "id must be lowercase alphanumeric/underscore"),
  kind: z.enum(PREFAB_KINDS),
  name: z.string().min(1).max(96),
  description: z.string().max(2048).nullable().optional(),
  modelPath: z.string().max(512).nullable().optional(),
  texturePath: z.string().max(512).nullable().optional(),
  scale: z.number().positive().max(1000).optional(),
  data: z.unknown().optional(),
  tags: z.array(z.string().max(64)).max(32).optional(),
  draft: z.boolean().optional(),
});

export const prefabsRouter = Router();

prefabsRouter.get("/", async (req, res) => {
  const kindParse = z.enum(PREFAB_KINDS).safeParse(req.query.kind);
  const includeDrafts =
    req.query.includeDrafts === "true" || req.query.includeDrafts === "1";

  const filters = [
    ...(includeDrafts ? [] : [eq(prefabsTable.draft, false)]),
    ...(kindParse.success ? [eq(prefabsTable.kind, kindParse.data)] : []),
  ];

  const rows = await db
    .select()
    .from(prefabsTable)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(asc(prefabsTable.kind), asc(prefabsTable.id));
  res.json(rows);
});

prefabsRouter.get("/:id", async (req, res) => {
  const id = String(req.params.id);
  const row = await db.query.prefabsTable.findFirst({
    where: eq(prefabsTable.id, id),
  });
  if (!row) {
    res.status(404).json({ error: "not found" });
    return;
  }
  res.json(row);
});

prefabsRouter.post("/", requireAdmin, async (req, res) => {
  const parsed = upsertSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const [row] = await db
      .insert(prefabsTable)
      .values({
        id: parsed.data.id,
        kind: parsed.data.kind,
        name: parsed.data.name,
        description: parsed.data.description ?? null,
        modelPath: parsed.data.modelPath ?? null,
        texturePath: parsed.data.texturePath ?? null,
        scale: parsed.data.scale ?? 1.0,
        data: (parsed.data.data ?? {}) as object,
        tags: parsed.data.tags ?? [],
        draft: parsed.data.draft ?? false,
      })
      .returning();
    res.status(201).json(row);
  } catch (err: any) {
    if (err?.code === "23505") {
      res.status(409).json({ error: "prefab id already exists" });
      return;
    }
    throw err;
  }
});

prefabsRouter.put("/:id", requireAdmin, async (req, res) => {
  const id = String(req.params.id);
  const parsed = upsertSchema.partial({ id: true }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const patch: Record<string, unknown> = {
    updatedAt: sql`now()`,
    version: sql`${prefabsTable.version} + 1`,
  };
  for (const [k, v] of Object.entries(parsed.data)) {
    if (k === "id") continue;
    if (v !== undefined) patch[k] = v;
  }
  const [row] = await db
    .update(prefabsTable)
    .set(patch)
    .where(eq(prefabsTable.id, id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "not found" });
    return;
  }
  res.json(row);
});

prefabsRouter.delete("/:id", requireAdmin, async (req, res) => {
  const id = String(req.params.id);
  const r = await db
    .delete(prefabsTable)
    .where(eq(prefabsTable.id, id))
    .returning({ id: prefabsTable.id });
  if (r.length === 0) {
    res.status(404).json({ error: "not found" });
    return;
  }
  res.status(204).end();
});
