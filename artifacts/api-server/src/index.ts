import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import app, { isOriginAllowed } from "./app";
import { logger } from "./lib/logger";
import { ensureCatalog } from "./lib/assetBridge";
import { ensureWorldCatalog } from "./lib/worldCatalog";
import { bootstrapStudioCatalog } from "./lib/assetStudioCatalog";
import { handleWsConnection } from "./realtime/wsHandler";
import { pool } from "@workspace/db";

const port = Number(process.env["PORT"]) || 5000;

// Wrap the express app in a raw http server so we can attach a websocket
// upgrade listener for co-op multiplayer. The api-server is registered at
// /api in the artifact reverse-proxy, so the realtime endpoint lives at
// /api/realtime.
const server = createServer(app);

const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (req, socket, head) => {
  const url = req.url ?? "";

  // ── Origin validation (industry best practice for WS) ───────────────────
  // Vercel can't proxy WS upgrades, so the client connects directly to
  // Railway. We must validate the Origin header ourselves — the express
  // CORS middleware never sees upgrade requests.
  const origin = req.headers.origin;
  if (origin && !isOriginAllowed(origin)) {
    logger.warn({ origin }, "WS upgrade rejected: origin not allowed");
    socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
    socket.destroy();
    return;
  }

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

  ensureWorldCatalog(logger).catch((e) => {
    logger.error({ err: e }, "ensureWorldCatalog threw unexpectedly");
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

// ── Graceful shutdown (Docker / Railway sends SIGTERM) ──────────────────────
function shutdown(signal: string) {
  logger.info({ signal }, "Received shutdown signal — draining connections");
  // Stop accepting new connections. Existing ones finish their current
  // request/response cycle then close naturally.
  server.close(() => {
    logger.info("HTTP server closed");
    // Close every open WebSocket so clients reconnect to the new instance.
    wss.clients.forEach((ws) => ws.close(1012, 'server restarting'));
    // Drain the PostgreSQL connection pool.
    pool.end().then(() => {
      logger.info("DB pool drained — exiting");
      process.exit(0);
    }).catch(() => process.exit(1));
  });
  // If drain takes too long, force exit after 15 s.
  setTimeout(() => {
    logger.warn("Graceful shutdown timed out — forcing exit");
    process.exit(1);
  }, 15_000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT",  () => shutdown("SIGINT"));
