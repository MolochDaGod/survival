import { Router } from "express";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { db, accountsTable, ledMasksTable, eq, desc } from "@workspace/db";
import { MASK_PRICE_GBUX, MASK_SKINS, rollMaskSkin } from "../data/maskSkins";
import { ensureAccountWallet } from "../lib/grudgeWallet";
import { mintMaskCnft } from "../lib/maskMint";

const grudgeSchema = z.object({
  grudgeId: z.string().min(3).max(128),
});

export const masksRouter = Router();

masksRouter.get("/catalog", (_req, res) => {
  res.json({
    priceGbux: MASK_PRICE_GBUX,
    skins: MASK_SKINS.map(({ id, name, rarity, weight, primary, secondary, glow, pattern }) => ({
      id, name, rarity, weight, primary, secondary, glow, pattern,
    })),
  });
});

masksRouter.post("/preview-roll", (_req, res) => {
  const skin = rollMaskSkin();
  res.json({ skin });
});

masksRouter.get("/mine", async (req, res) => {
  const grudgeId = String(req.query.grudgeId ?? "");
  if (!grudgeId) {
    res.status(400).json({ error: "grudgeId required" });
    return;
  }
  try {
    const rows = await db
      .select()
      .from(ledMasksTable)
      .where(eq(ledMasksTable.grudgeId, grudgeId))
      .orderBy(desc(ledMasksTable.createdAt));
    res.json(rows);
  } catch (err) {
    req.log?.error(err, "[masks] mine failed");
    res.status(500).json({ error: "failed to load masks" });
  }
});

masksRouter.post("/purchase", async (req, res) => {
  const parsed = grudgeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { grudgeId } = parsed.data;

  try {
    const account = await db.query.accountsTable.findFirst({
      where: eq(accountsTable.grudgeId, grudgeId),
    });
    if (!account) {
      res.status(404).json({ error: "Account not found — sign in first" });
      return;
    }

    const balance = account.gbuxBalance ?? 0;
    if (balance < MASK_PRICE_GBUX) {
      res.status(402).json({
        error: "Insufficient GBUX",
        required: MASK_PRICE_GBUX,
        balance,
      });
      return;
    }

    const walletAddress = await ensureAccountWallet(account);
    const skin = rollMaskSkin();
    const now = Date.now();
    const maskId = randomUUID();
    const mint = await mintMaskCnft(maskId, skin, walletAddress, grudgeId);

    const [updated] = await db
      .update(accountsTable)
      .set({
        gbuxBalance: balance - MASK_PRICE_GBUX,
        updatedAt: now,
      })
      .where(eq(accountsTable.id, account.id))
      .returning();

    const [mask] = await db
      .insert(ledMasksTable)
      .values({
        id: maskId,
        accountId: account.id,
        grudgeId,
        skinId: skin.id,
        skinName: skin.name,
        rarity: skin.rarity,
        priceGbux: MASK_PRICE_GBUX,
        walletAddress,
        cnftMintId: mint.cnftMintId,
        mintStatus: mint.mintStatus,
        traits: {
          primary: skin.primary,
          secondary: skin.secondary,
          glow: skin.glow,
          pattern: skin.pattern,
        },
        createdAt: now,
      })
      .returning();

    res.json({
      mask,
      skin,
      gbuxBalance: updated?.gbuxBalance ?? balance - MASK_PRICE_GBUX,
      assistantUnlocked: true,
    });
  } catch (err) {
    req.log?.error(err, "[masks] purchase failed");
    res.status(500).json({ error: "mask purchase failed" });
  }
});