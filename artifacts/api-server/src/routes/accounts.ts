/**
 * Account routes — one account per identity (grudgeId).
 *
 *   POST /api/accounts/upsert     — get-or-create by grudgeId
 *   GET  /api/accounts/:grudgeId  — read by grudgeId
 *
 * No admin auth: any client may upsert their own account. The grudgeId acts
 * as the identity proof (it lives in the user's localStorage / SSO session).
 */
import { Router } from "express";
import { z } from "zod";
import { db, accountsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

const upsertSchema = z.object({
  grudgeId: z.string().min(3).max(128),
  displayName: z.string().max(64).nullable().optional(),
});

export const accountsRouter = Router();

accountsRouter.post("/upsert", async (req, res) => {
  const parsed = upsertSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { grudgeId, displayName } = parsed.data;
  const [row] = await db
    .insert(accountsTable)
    .values({ grudgeId, displayName: displayName ?? null })
    .onConflictDoUpdate({
      target: accountsTable.grudgeId,
      set: { displayName: displayName ?? null, updatedAt: sql`now()` },
    })
    .returning();
  res.json(row);
});

accountsRouter.get("/:grudgeId", async (req, res) => {
  const grudgeId = req.params.grudgeId;
  if (!grudgeId) {
    res.status(400).json({ error: "grudgeId required" });
    return;
  }
  const row = await db.query.accountsTable.findFirst({
    where: eq(accountsTable.grudgeId, grudgeId),
  });
  if (!row) {
    res.status(404).json({ error: "not found" });
    return;
  }
  res.json(row);
});
