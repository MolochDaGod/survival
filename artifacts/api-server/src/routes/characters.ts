/**
 * Character routes — thin HTTP adapter over `charactersService`.
 *
 *   GET    /api/characters?accountId=  — list characters for an account
 *   POST   /api/characters             — create a new character
 *   GET    /api/characters/:id         — read one
 *   PUT    /api/characters/:id         — update name/config/saveData
 *   DELETE /api/characters/:id         — delete (cascades save)
 *
 * Routes do exactly two things: pull inputs out of `req`, and translate
 * `ServiceError`s into HTTP responses. All business rules live in the
 * service layer; all SQL lives in the repository. This is the reference
 * implementation of the routes → services → repositories pattern.
 */
import { Router } from "express";
import {
  charactersService,
  ServiceError,
} from "../services/charactersService";
import { logger } from "../lib/logger";

export const charactersRouter = Router();

function handleServiceError(err: unknown, res: import("express").Response): boolean {
  if (err instanceof ServiceError) {
    const status = err.code === "not_found" ? 404 : 400;
    res.status(status).json({ error: err.message, detail: err.detail });
    return true;
  }
  return false;
}

charactersRouter.get("/", async (req, res) => {
  try {
    const rows = await charactersService.list(String(req.query.accountId ?? ""));
    res.json(rows);
  } catch (err) {
    if (!handleServiceError(err, res)) {
      logger.error({ err }, '[characters] list failed');
      res.status(500).json({ error: 'list failed' });
    }
  }
});

charactersRouter.post("/", (req, res, next) => {
  // Double-wrap: Express 4 doesn't catch async rejections, so we funnel
  // every possible failure path through next(err) as a last resort.
  (async () => {
    try {
      const row = await charactersService.create(req.body);
      res.status(201).json(row);
    } catch (err: unknown) {
      if (handleServiceError(err, res)) return;
      logger.error({ err }, '[characters] create failed');
      if (!res.headersSent) {
        res.status(500).json({ error: 'character creation failed' });
      }
    }
  })().catch(next);
});

charactersRouter.get("/:id", async (req, res) => {
  try {
    const row = await charactersService.get(req.params.id);
    res.json(row);
  } catch (err) {
    if (!handleServiceError(err, res)) {
      logger.error({ err }, '[characters] get failed');
      res.status(500).json({ error: 'get failed' });
    }
  }
});

charactersRouter.put("/:id", async (req, res) => {
  try {
    const row = await charactersService.update(req.params.id, req.body);
    res.json(row);
  } catch (err) {
    if (!handleServiceError(err, res)) {
      logger.error({ err }, '[characters] update failed');
      res.status(500).json({ error: 'update failed' });
    }
  }
});

charactersRouter.delete("/:id", async (req, res) => {
  try {
    await charactersService.remove(req.params.id);
    res.status(204).end();
  } catch (err) {
    if (!handleServiceError(err, res)) {
      logger.error({ err }, '[characters] delete failed');
      res.status(500).json({ error: 'delete failed' });
    }
  }
});
