/**
 * Buildings Routes
 */
import { Router } from "express";
import { buildingsService, ServiceError } from "../services/buildingsService";
import { logger } from "../lib/logger";

export const buildingsRouter = Router();

function handleServiceError(err: unknown, res: import("express").Response): boolean {
  if (err instanceof ServiceError) {
    const status = err.code === "not_found" ? 404 : 400;
    res.status(status).json({ error: err.message, detail: err.detail });
    return true;
  }
  return false;
}

buildingsRouter.post("/", async (req, res, next) => {
  (async () => {
    try {
      const building = await buildingsService.placeBuilding(req.body);
      res.status(201).json(building);
    } catch (err: unknown) {
      if (handleServiceError(err, res)) return;
      logger.error({ err }, "[buildings] place failed");
      if (!res.headersSent) {
        res.status(500).json({ error: "place failed" });
      }
    }
  })().catch(next);
});

buildingsRouter.get("/:characterId", async (req, res) => {
  try {
    const buildings = await buildingsService.getBuildings(req.params.characterId);
    res.json(buildings);
  } catch (err) {
    logger.error({ err }, "[buildings] get failed");
    res.status(500).json({ error: "get failed" });
  }
});

buildingsRouter.get("/building/:id", async (req, res) => {
  try {
    const building = await buildingsService.getBuilding(req.params.id);
    res.json(building);
  } catch (err) {
    if (!handleServiceError(err, res)) {
      logger.error({ err }, "[buildings] get building failed");
      res.status(500).json({ error: "get failed" });
    }
  }
});

buildingsRouter.put("/building/:id", async (req, res) => {
  try {
    const building = await buildingsService.updateBuilding(req.params.id, req.body);
    res.json(building);
  } catch (err) {
    if (!handleServiceError(err, res)) {
      logger.error({ err }, "[buildings] update failed");
      res.status(500).json({ error: "update failed" });
    }
  }
});

buildingsRouter.delete("/building/:id", async (req, res) => {
  try {
    const building = await buildingsService.destroyBuilding(req.params.id);
    res.json(building);
  } catch (err) {
    if (!handleServiceError(err, res)) {
      logger.error({ err }, "[buildings] destroy failed");
      res.status(500).json({ error: "destroy failed" });
    }
  }
});

buildingsRouter.post("/building/:id/upgrade", async (req, res) => {
  try {
    const { upgradeName } = req.body;
    if (!upgradeName) {
      res.status(400).json({ error: "upgradeName required" });
      return;
    }
    const building = await buildingsService.upgradeBuilding(req.params.id, upgradeName);
    res.json(building);
  } catch (err) {
    if (!handleServiceError(err, res)) {
      logger.error({ err }, "[buildings] upgrade failed");
      res.status(500).json({ error: "upgrade failed" });
    }
  }
});

