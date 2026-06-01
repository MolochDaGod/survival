/**
 * Achievements Routes
 */
import { Router } from "express";
import { achievementsService, ServiceError } from "../services/achievementsService";
import { logger } from "../lib/logger";

export const achievementsRouter = Router();

function handleServiceError(err: unknown, res: import("express").Response): boolean {
  if (err instanceof ServiceError) {
    const status = err.code === "not_found" ? 404 : 400;
    res.status(status).json({ error: err.message, detail: err.detail });
    return true;
  }
  return false;
}

achievementsRouter.post("/", async (req, res, next) => {
  (async () => {
    try {
      const achievement = await achievementsService.unlock(req.body);
      res.status(201).json(achievement);
    } catch (err: unknown) {
      if (handleServiceError(err, res)) return;
      logger.error({ err }, "[achievements] unlock failed");
      if (!res.headersSent) {
        res.status(500).json({ error: "unlock failed" });
      }
    }
  })().catch(next);
});

achievementsRouter.get("/:characterId", async (req, res) => {
  try {
    const achievements = await achievementsService.getForCharacter(
      req.params.characterId,
    );
    res.json(achievements);
  } catch (err) {
    logger.error({ err }, "[achievements] get failed");
    res.status(500).json({ error: "get failed" });
  }
});

achievementsRouter.get("/:characterId/count", async (req, res) => {
  try {
    const count = await achievementsService.getCount(req.params.characterId);
    res.json({ count });
  } catch (err) {
    logger.error({ err }, "[achievements] count failed");
    res.status(500).json({ error: "count failed" });
  }
});

achievementsRouter.get("/:characterId/:key", async (req, res) => {
  try {
    const achievement = await achievementsService.getByKey(
      req.params.characterId,
      req.params.key,
    );
    res.json(achievement);
  } catch (err) {
    if (!handleServiceError(err, res)) {
      logger.error({ err }, "[achievements] get by key failed");
      res.status(500).json({ error: "get failed" });
    }
  }
});

