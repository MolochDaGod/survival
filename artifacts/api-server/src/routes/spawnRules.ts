/**
 * Spawn rule routes — controls where prefabs may appear in the world.
 *
 *   GET    /api/spawn-rules?prefabId=
 *   POST   /api/spawn-rules            (admin)
 *   DELETE /api/spawn-rules/:id        (admin)
 */
import { Router } from "express";
import { z } from "zod";
import { db, spawnRulesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAdmin } from "../lib/adminAuth.js";

const uuid = z.string().uuid();

const createSchema = z.object({
  prefabId: z.string().min(1),
  biome: z.string().max(64).nullable().optional(),
  minDistance: z.number().min(0).optional(),
  maxDistance: z.number().min(0).optional(),
  minWave: z.number().int().min(0).optional(),
  weight: z.number().int().min(0).optional(),
  enabled: z.boolean().optional(),
});

export const spawnRulesRouter = Router();

spawnRulesRouter.get("/", async (req, res) => {
  const prefabId = typeof req.query.prefabId === "string" ? req.query.prefabId : null;
  const q = db.select().from(spawnRulesTable);
  const rows = prefabId
    ? await q.where(eq(spawnRulesTable.prefabId, prefabId))
    : await q;
  res.json(rows);
});

spawnRulesRouter.post("/", requireAdmin, async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const [row] = await db.insert(spawnRulesTable).values(parsed.data).returning();
    res.status(201).json(row);
  } catch (err: any) {
    if (err?.code === "23503") {
      res.status(404).json({ error: "prefabId does not exist" });
      return;
    }
    throw err;
  }
});

spawnRulesRouter.delete("/:id", requireAdmin, async (req, res) => {
  const id = uuid.safeParse(req.params.id);
  if (!id.success) {
    res.status(400).json({ error: "invalid id" });
    return;
  }
  const r = await db
    .delete(spawnRulesTable)
    .where(eq(spawnRulesTable.id, id.data))
    .returning({ id: spawnRulesTable.id });
  if (r.length === 0) {
    res.status(404).json({ error: "not found" });
    return;
  }
  res.status(204).end();
});
