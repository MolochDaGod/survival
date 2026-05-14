import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import app from "./app";
import { logger } from "./lib/logger";
import { ensureCatalog } from "./lib/assetBridge";
import { bootstrapStudioCatalog } from "./lib/assetStudioCatalog";
import { handleWsConnection } from "./realtime/wsHandler";

const port = Number(process.env["PORT"]) || 5000;

// Wrap the express app in a raw http server so we can attach a websocket
// upgrade listener for co-op multiplayer. The api-server is registered at
// /api in the artifact reverse-proxy, so the realtime endpoint lives at
// /api/realtime.
const server = createServer(app);

const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (req, socket, head) => {
  const url = req.url ?? "";
  // Match exact path or with trailing query.
  if (url === "/api/realtime" || url.startsWith("/api/realtime?")) {
    wss.handleUpgrade(req, socket, head, (ws) => {
      handleWsConnection(ws);
    });
  } else {
    socket.destroy();
  }
});

server.listen(port, () => {
  logger.info({ port }, "Server listening (http + ws)");

  // Probe D1 + ensure catalog schema in the background — never blocks boot.
  ensureCatalog(logger).catch((e) => {
    logger.error({ err: e }, "ensureCatalog threw unexpectedly");
  });

  // Warm the asset-studio catalog cache (snapshot in R2 → in-memory) so the
  // first /assets/studio/catalog request is sub-second. Never blocks boot.
  bootstrapStudioCatalog(logger).catch((e) => {
    logger.error({ err: e }, "bootstrapStudioCatalog threw unexpectedly");
  });
});

server.on("error", (err) => {
  logger.error({ err }, "http server error");
  process.exit(1);
});
