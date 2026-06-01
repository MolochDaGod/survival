/**
 * Allies Routes
 */
import { Router } from "express";
import { alliesService, ServiceError } from "../services/alliesService";
import { logger } from "../lib/logger";

export const alliesRouter = Router();

function handleServiceError(err: unknown, res: import("express").Response): boolean {
  if (err instanceof ServiceError) {
    const status = err.code === "not_found" ? 404 : 400;
    res.status(status).json({ error: err.message, detail: err.detail });
    return true;
  }
  return false;
}

alliesRouter.post("/", async (req, res, next) => {
  (async () => {
    try {
      const ally = await alliesService.recruit(req.body);
      res.status(201).json(ally);
    } catch (err: unknown) {
      if (handleServiceError(err, res)) return;
      logger.error({ err }, "[allies] recruit failed");
      if (!res.headersSent) {
        res.status(500).json({ error: "recruit failed" });
      }
    }
  })().catch(next);
});

alliesRouter.get("/:characterId", async (req, res) => {
  try {
    const allies = await alliesService.getAllies(req.params.characterId);
    res.json(allies);
  } catch (err) {
    logger.error({ err }, "[allies] get failed");
    res.status(500).json({ error: "get failed" });
  }
});

alliesRouter.get("/ally/:id", async (req, res) => {
  try {
    const ally = await alliesService.getAlly(req.params.id);
    res.json(ally);
  } catch (err) {
    if (!handleServiceError(err, res)) {
      logger.error({ err }, "[allies] get ally failed");
      res.status(500).json({ error: "get failed" });
    }
  }
});

alliesRouter.put("/ally/:id", async (req, res) => {
  try {
    const ally = await alliesService.updateAlly(req.params.id, req.body);
    res.json(ally);
  } catch (err) {
    if (!handleServiceError(err, res)) {
      logger.error({ err }, "[allies] update failed");
      res.status(500).json({ error: "update failed" });
    }
  }
});

alliesRouter.delete("/ally/:id", async (req, res) => {
  try {
    await alliesService.removeAlly(req.params.id);
    res.status(204).end();
  } catch (err) {
    if (!handleServiceError(err, res)) {
      logger.error({ err }, "[allies] delete failed");
      res.status(500).json({ error: "delete failed" });
    }
  }
});

alliesRouter.post("/ally/:id/loyalty", async (req, res) => {
  try {
    const { amount } = req.body;
    if (typeof amount !== "number") {
      res.status(400).json({ error: "amount must be a number" });
      return;
    }
    const ally = await alliesService.increaseLoyalty(req.params.id, amount);
    res.json(ally);
  } catch (err) {
    if (!handleServiceError(err, res)) {
      logger.error({ err }, "[allies] loyalty failed");
      res.status(500).json({ error: "loyalty failed" });
    }
  }
});

