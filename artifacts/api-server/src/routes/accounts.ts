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
import { randomUUID } from "node:crypto";
import { db, accountsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const upsertSchema = z.object({
  grudgeId: z.string().min(3).max(128),
  displayName: z.string().max(64).nullable().optional(),
  puterUuid: z.string().max(128).optional(),
  puterUsername: z.string().max(128).optional(),
  email: z.string().max(255).optional(),
  authType: z.string().max(64).optional(),
});

export const accountsRouter = Router();

/**
 * POST /api/accounts/upsert — get-or-create by grudgeId.
 *
 * The grudge-id comes from the client's Puter identity
 * (e.g. `puter_<uuid>` or `guest_<uuid>`). On first call this creates
 * the account row; subsequent calls update displayName/puterUsername.
 *
 * Compatible with the GrudgeBuilder schema (varchar id, bigint timestamps).
 */
accountsRouter.post("/upsert", async (req, res) => {
  const parsed = upsertSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { grudgeId, displayName, puterUuid, puterUsername, email, authType } = parsed.data;

  try {
    // Check if account already exists by grudge_id
    const existing = await db.query.accountsTable.findFirst({
      where: eq(accountsTable.grudgeId, grudgeId),
    });

    if (existing) {
      // Update display name and puter fields
      const [updated] = await db
        .update(accountsTable)
        .set({
          displayName: displayName ?? existing.displayName,
          puterUuid: puterUuid ?? existing.puterUuid,
          puterUsername: puterUsername ?? existing.puterUsername,
          updatedAt: Date.now(),
        })
        .where(eq(accountsTable.id, existing.id))
        .returning();
      res.json(updated);
      return;
    }

    // Create new account
    const now = Date.now();
    const [row] = await db
      .insert(accountsTable)
      .values({
        id: randomUUID(),
        grudgeId,
        displayName: displayName ?? null,
        puterUuid: puterUuid ?? null,
        puterUsername: puterUsername ?? null,
        email: email ?? null,
        authType: authType ?? (grudgeId.startsWith('puter_') ? 'puter' : 'guest'),
        isGuest: grudgeId.startsWith('guest_'),
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    res.json(row);
  } catch (err) {
    req.log?.error(err, '[accounts] upsert failed');
    res.status(500).json({ error: 'account upsert failed' });
  }
});

accountsRouter.get("/:grudgeId", async (req, res) => {
  const grudgeId = req.params.grudgeId;
  if (!grudgeId) {
    res.status(400).json({ error: "grudgeId required" });
    return;
  }
  try {
    const row = await db.query.accountsTable.findFirst({
      where: eq(accountsTable.grudgeId, grudgeId),
    });
    if (!row) {
      res.status(404).json({ error: "not found" });
      return;
    }
    res.json(row);
  } catch (err) {
    req.log?.error(err, '[accounts] get failed');
    res.status(500).json({ error: 'account lookup failed' });
  }
});
