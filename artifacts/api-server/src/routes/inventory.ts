/**
 * Inventory Routes
 */
import { Router } from "express";
import { inventoryService, ServiceError } from "../services/inventoryService";
import { logger } from "../lib/logger";

export const inventoryRouter = Router();

function handleServiceError(err: unknown, res: import("express").Response): boolean {
  if (err instanceof ServiceError) {
    const status = err.code === "not_found" ? 404 : 400;
    res.status(status).json({ error: err.message, detail: err.detail });
    return true;
  }
  return false;
}

inventoryRouter.get("/:characterId", async (req, res) => {
  try {
    const items = await inventoryService.getInventory(req.params.characterId);
    res.json(items);
  } catch (err) {
    logger.error({ err }, "[inventory] get failed");
    res.status(500).json({ error: "get failed" });
  }
});

inventoryRouter.post("/", async (req, res, next) => {
  (async () => {
    try {
      const item = await inventoryService.addItem(req.body);
      res.status(201).json(item);
    } catch (err: unknown) {
      if (handleServiceError(err, res)) return;
      logger.error({ err }, "[inventory] add failed");
      if (!res.headersSent) {
        res.status(500).json({ error: "add failed" });
      }
    }
  })().catch(next);
});

inventoryRouter.get("/item/:id", async (req, res) => {
  try {
    const item = await inventoryService.getItem(req.params.id);
    res.json(item);
  } catch (err) {
    if (!handleServiceError(err, res)) {
      logger.error({ err }, "[inventory] get item failed");
      res.status(500).json({ error: "get failed" });
    }
  }
});

inventoryRouter.put("/item/:id", async (req, res) => {
  try {
    const item = await inventoryService.updateItem(req.params.id, req.body);
    res.json(item);
  } catch (err) {
    if (!handleServiceError(err, res)) {
      logger.error({ err }, "[inventory] update failed");
      res.status(500).json({ error: "update failed" });
    }
  }
});

inventoryRouter.delete("/item/:id", async (req, res) => {
  try {
    await inventoryService.removeItem(req.params.id);
    res.status(204).end();
  } catch (err) {
    if (!handleServiceError(err, res)) {
      logger.error({ err }, "[inventory] delete failed");
      res.status(500).json({ error: "delete failed" });
    }
  }
});

inventoryRouter.delete("/:characterId", async (req, res) => {
  try {
    await inventoryService.clearInventory(req.params.characterId);
    res.status(204).end();
  } catch (err) {
    logger.error({ err }, "[inventory] clear failed");
    res.status(500).json({ error: "clear failed" });
  }
});

