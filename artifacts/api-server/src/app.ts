import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { rateLimit, ipKeyGenerator } from "express-rate-limit";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

// ── BigInt JSON safety ─────────────────────────────────────────────────────
// Drizzle returns `bigint` columns as native JS BigInt. JSON.stringify throws
// on BigInt by default ("Do not know how to serialize a BigInt"). This
// global patch converts BigInts to Numbers during serialization so Express's
// res.json() never crashes. Safe because our bigint columns (created_at,
// updated_at) are epoch-ms timestamps that fit in Number.MAX_SAFE_INTEGER
// until the year 287,396.
(BigInt.prototype as unknown as { toJSON: () => number }).toJSON = function () {
  return Number(this);
};

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
// ── CORS ─────────────────────────────────────────────────────────────────────
// In production, lock down to explicit origins (supports wildcard patterns
// like *.vercel.app and *.grudge-studio.com). In dev, allow everything.
//
// Patterns are converted to RegExp: "*.vercel.app" → /^https:\/\/.*\.vercel\.app$/
// Exact strings are compared directly. Localhost entries match as-is.

/** Convert a CORS_ORIGINS entry to a RegExp or null (passthrough). */
function originPatternToRegex(pattern: string): RegExp | string {
  if (!pattern.includes('*')) return pattern; // exact match
  // Strip the protocol prefix — the regex already anchors with ^https?://
  const cleaned = pattern.replace(/^https?:\/\//, '');
  const escaped = cleaned
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&') // escape regex specials
    .replace(/\*/g, '.*');                    // * → .*
  return new RegExp(`^https?:\\/\\/${escaped}$`);
}

const rawOrigins = process.env.CORS_ORIGINS;

/** Compiled allowlist — exported so the WS upgrade handler can reuse it. */
export const corsAllowList: (string | RegExp)[] = rawOrigins
  ? rawOrigins.split(',').map(o => originPatternToRegex(o.trim()))
  : [];

/** Test whether an origin matches the compiled allowlist. */
export function isOriginAllowed(origin: string | undefined): boolean {
  if (!origin) return false;
  if (corsAllowList.length === 0) return true; // dev mode
  return corsAllowList.some((entry) =>
    typeof entry === 'string' ? entry === origin : entry.test(origin),
  );
}

const corsOptions: cors.CorsOptions = rawOrigins
  ? {
      origin: (origin, cb) => {
        if (!origin || isOriginAllowed(origin)) cb(null, true);
        else cb(new Error('CORS: origin not allowed'));
      },
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

// ── Global error handler (MUST be last middleware) ─────────────────────────
// Catches any error that escapes route handlers (async rejections, BigInt
// serialization, Drizzle query failures, etc.) and returns JSON instead of
// Express's default HTML error page.
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const msg = err instanceof Error ? err.message : String(err);
  logger.error({ err }, '[global] unhandled error');
  if (!res.headersSent) {
    res.status(500).json({ error: 'internal server error', detail: msg });
  }
});

export default app;
