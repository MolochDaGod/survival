/**
 * Items Routes
 */
import { Router } from "express";
import { itemsService, ServiceError } from "../services/itemsService";
import { logger } from "../lib/logger";

export const itemsRouter = Router();

function handleServiceError(err: unknown, res: import("express").Response): boolean {
  if (err instanceof ServiceError) {
    const status = err.code === "not_found" ? 404 : 400;
    res.status(status).json({ error: err.message, detail: err.detail });
    return true;
  }
  return false;
}

itemsRouter.post("/", async (req, res, next) => {
  (async () => {
    try {
      const item = await itemsService.createItem(req.body);
      res.status(201).json(item);
    } catch (err: unknown) {
      if (handleServiceError(err, res)) return;
      logger.error({ err }, "[items] create failed");
      if (!res.headersSent) {
        res.status(500).json({ error: "create failed" });
      }
    }
  })().catch(next);
});

itemsRouter.get("/", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 100, 1000);
    const items = await itemsService.listItems(limit);
    res.json(items);
  } catch (err) {
    logger.error({ err }, "[items] list failed");
    res.status(500).json({ error: "list failed" });
  }
});

itemsRouter.get("/search", async (req, res) => {
  try {
    const query = String(req.query.q || "");
    if (!query) {
      res.status(400).json({ error: "query required" });
      return;
    }
    const items = await itemsService.searchItems(query);
    res.json(items);
  } catch (err) {
    logger.error({ err }, "[items] search failed");
    res.status(500).json({ error: "search failed" });
  }
});

itemsRouter.get("/type/:type", async (req, res) => {
  try {
    const items = await itemsService.getItemsByType(req.params.type);
    res.json(items);
  } catch (err) {
    logger.error({ err }, "[items] get by type failed");
    res.status(500).json({ error: "get failed" });
  }
});

itemsRouter.get("/rarity/:rarity", async (req, res) => {
  try {
    const items = await itemsService.getItemsByRarity(req.params.rarity);
    res.json(items);
  } catch (err) {
    logger.error({ err }, "[items] get by rarity failed");
    res.status(500).json({ error: "get failed" });
  }
});

itemsRouter.get("/:id", async (req, res) => {
  try {
    const item = await itemsService.getItem(req.params.id);
    res.json(item);
  } catch (err) {
    if (!handleServiceError(err, res)) {
      logger.error({ err }, "[items] get failed");
      res.status(500).json({ error: "get failed" });
    }
  }
});

itemsRouter.put("/:id", async (req, res) => {
  try {
    const item = await itemsService.updateItem(req.params.id, req.body);
    res.json(item);
  } catch (err) {
    if (!handleServiceError(err, res)) {
      logger.error({ err }, "[items] update failed");
      res.status(500).json({ error: "update failed" });
    }
  }
});

itemsRouter.delete("/:id", async (req, res) => {
  try {
    await itemsService.deleteItem(req.params.id);
    res.status(204).end();
  } catch (err) {
    if (!handleServiceError(err, res)) {
      logger.error({ err }, "[items] delete failed");
      res.status(500).json({ error: "delete failed" });
    }
  }
});

