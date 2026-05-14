import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { rateLimit, ipKeyGenerator } from "express-rate-limit";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

// Trust the first reverse proxy (Railway, VPS nginx, etc.) so req.ip
// resolves to the real client IP for rate-limiting.
app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
// ── CORS ───────────────────────────────────────────────────────────────────
// In production, lock down to explicit origins. In dev, allow everything.
const rawOrigins = process.env.CORS_ORIGINS;
const corsOptions: cors.CorsOptions = rawOrigins
  ? {
      origin: rawOrigins.split(',').map((o) => o.trim()),
      credentials: true,
    }
  : {
      origin: true, // reflect request origin (dev mode)
      credentials: true,
    };
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Rate limiting ──────────────────────────────────────────────────────────
// Two layers: a generous global limiter that catches runaway scraping, and
// a much tighter limiter on write endpoints (POST/PUT/PATCH/DELETE) where a
// flood would actually hurt the database. Both keyed by the real client IP
// (see `trust proxy` above). `/api/healthz` is exempt so platform health
// checks aren't counted.
const globalLimiter = rateLimit({
  windowMs: 60_000,
  limit: 600,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skip: (req) => req.path === "/healthz" || req.path === "/api/healthz",
  keyGenerator: (req) => ipKeyGenerator(req.ip ?? "unknown"),
});
const writeLimiter = rateLimit({
  windowMs: 60_000,
  limit: 60,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skip: (req) => req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS",
  keyGenerator: (req) => ipKeyGenerator(req.ip ?? "unknown"),
});

app.use(globalLimiter);
app.use(writeLimiter);

app.use("/api", router);

export default app;
