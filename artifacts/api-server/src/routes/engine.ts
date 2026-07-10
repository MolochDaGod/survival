import { Router } from "express";
import { getDefaultEngineManifest, getManifestForEra } from "@workspace/grudge-engine";

export const engineRouter = Router();

/** GET /api/engine/manifest — scriptable engine defaults (controllers, cameras, animations). */
engineRouter.get("/manifest", (req, res) => {
  const era = typeof req.query.era === "string" ? req.query.era : undefined;
  res.json(era ? getManifestForEra(era) : getDefaultEngineManifest());
});