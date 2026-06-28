import { Router } from "express";
import { getDefaultEngineManifest } from "@workspace/grudge-engine";

export const engineRouter = Router();

/** GET /api/engine/manifest — scriptable Nexus engine defaults (controllers, cameras, animations). */
engineRouter.get("/manifest", (_req, res) => {
  res.json(getDefaultEngineManifest());
});