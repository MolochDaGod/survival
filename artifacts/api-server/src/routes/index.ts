import { Router, type IRouter } from "express";
import healthRouter from "./health";
import savegameRouter from "./savegame";
import assetsRouter from "./assets";
import assetStudioRouter from "./assetStudio";
import { accountsRouter } from "./accounts";
import { charactersRouter } from "./characters";
import { prefabsRouter } from "./prefabs";
import { spawnRulesRouter } from "./spawnRules";
import { adminRouter } from "./admin";
import statsRouter from "./stats";
import { engineRouter } from "./engine";
import { masksRouter } from "./masks";
import { assistantRouter } from "./assistant";

const router: IRouter = Router();

router.use(healthRouter);
router.use(savegameRouter);
router.use(assetsRouter);
router.use(assetStudioRouter);
router.use("/accounts", accountsRouter);
router.use("/characters", charactersRouter);
router.use("/prefabs", prefabsRouter);
router.use("/spawn-rules", spawnRulesRouter);
router.use("/admin", adminRouter);
router.use("/stats", statsRouter);
router.use("/engine", engineRouter);
router.use("/masks", masksRouter);
router.use("/assistant", assistantRouter);

export default router;
