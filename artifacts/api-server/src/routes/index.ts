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
import { gameSessionsRouter } from "./gameSessions";
import { leaderboardRouter } from "./leaderboard";
import { inventoryRouter } from "./inventory";
import { achievementsRouter } from "./achievements";
import { alliesRouter } from "./allies";
import { buildingsRouter } from "./buildings";
import { itemsRouter } from "./items";

const router: IRouter = Router();

router.use(healthRouter);
router.use(savegameRouter);
router.use(assetsRouter);
router.use(assetStudioRouter);
router.use("/accounts", accountsRouter);
router.use("/characters", charactersRouter);
router.use("/prefabs", prefabsRouter);
router.use("/spawn-rules", spawnRulesRouter);
router.use("/sessions", gameSessionsRouter);
router.use("/leaderboard", leaderboardRouter);
router.use("/inventory", inventoryRouter);
router.use("/achievements", achievementsRouter);
router.use("/allies", alliesRouter);
router.use("/buildings", buildingsRouter);
router.use("/items", itemsRouter);
router.use("/admin", adminRouter);
router.use("/stats", statsRouter);

export default router;

