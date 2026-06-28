import { Router } from "express";
import { z } from "zod";

const AI_BASE = process.env.GRUDGE_AI_URL ?? "https://ai.grudge-studio.com";
const AI_KEY = process.env.GRUDGE_AI_API_KEY ?? "";

const chatSchema = z.object({
  grudgeId: z.string().min(3).max(128),
  message: z.string().min(1).max(2000),
  maskName: z.string().max(128).optional(),
  maskRarity: z.string().max(32).optional(),
});

export const assistantRouter = Router();

assistantRouter.post("/chat", async (req, res) => {
  const parsed = chatSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { grudgeId, message, maskName, maskRarity } = parsed.data;
  const maskContext = maskName
    ? `The user owns LED mask "${maskName}" (${maskRarity ?? "unknown"} rarity). `
    : "The user has not minted a LED mask yet. ";

  const systemHint =
    `${maskContext}You are the personal Grudox mask AI — a sharp, loyal companion tied to their Grudge ID (${grudgeId}). ` +
    "Keep replies under 120 words. Sci-fi survival tone. Help with Grudox, masks, GBUX, and the Nexus.";

  try {
    const upstream = await fetch(`${AI_BASE}/v1/agents/companion/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(AI_KEY ? { Authorization: `Bearer ${AI_KEY}` } : {}),
      },
      body: JSON.stringify({
        messages: [
          { role: "system", content: systemHint },
          { role: "user", content: message },
        ],
      }),
    });

    if (!upstream.ok) {
      const text = await upstream.text();
      req.log?.warn({ status: upstream.status, text }, "[assistant] upstream error");
      res.json({
        reply:
          "Mask AI is syncing with the Nexus uplink. Try again in a moment — your assistant activates with your LED mask.",
        offline: true,
      });
      return;
    }

    const data = (await upstream.json()) as { reply?: string; content?: string; message?: string };
    const reply = data.reply ?? data.content ?? data.message ?? "Signal received.";
    res.json({ reply, offline: false });
  } catch (err) {
    req.log?.error(err, "[assistant] chat failed");
    res.json({
      reply:
        "Uplink interrupted. Your mask AI will reconnect once the relay stabilizes.",
      offline: true,
    });
  }
});