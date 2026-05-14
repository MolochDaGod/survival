/**
 * Admin authentication middleware.
 *
 * All destructive routes (create/update/delete prefabs, wipe characters,
 * mutate the asset catalog) require a bearer token matching ADMIN_TOKEN.
 *
 * If ADMIN_TOKEN is not set in the environment, we auto-generate one on first
 * boot and persist it to .local/.admin_token (gitignored). The token is logged
 * once at startup so the developer can grab it and paste it into the admin
 * panel. Production deployments should set ADMIN_TOKEN explicitly.
 */
import type { Request, Response, NextFunction } from "express";
import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { logger } from "./logger.js";

const TOKEN_FILE = resolve(process.cwd(), "../../.local/.admin_token");

let cachedToken: string | null = null;

export function getAdminToken(): string {
  if (cachedToken) return cachedToken;

  // 1. Explicit env var wins.
  const fromEnv = process.env.ADMIN_TOKEN?.trim();
  if (fromEnv) {
    cachedToken = fromEnv;
    return cachedToken;
  }

  // 2. Persisted file (auto-generated on a previous boot).
  try {
    if (existsSync(TOKEN_FILE)) {
      const fromFile = readFileSync(TOKEN_FILE, "utf8").trim();
      if (fromFile) {
        cachedToken = fromFile;
        logger.info(
          { tokenFile: TOKEN_FILE },
          "[adminAuth] loaded admin token from .local/.admin_token",
        );
        return cachedToken;
      }
    }
  } catch (err) {
    logger.warn({ err }, "[adminAuth] failed to read existing admin token");
  }

  // 3. Generate fresh and persist.
  cachedToken = randomBytes(24).toString("hex");
  try {
    mkdirSync(dirname(TOKEN_FILE), { recursive: true });
    writeFileSync(TOKEN_FILE, cachedToken, { mode: 0o600 });
    logger.warn(
      { tokenFile: TOKEN_FILE, token: cachedToken },
      "[adminAuth] generated new admin token — set ADMIN_TOKEN env var to override. Token written to .local/.admin_token",
    );
  } catch (err) {
    logger.error(
      { err },
      "[adminAuth] could not persist generated admin token; admin auth will rotate on every restart",
    );
  }
  return cachedToken;
}

/**
 * Extract a bearer token from the standard Authorization header. Returns
 * null when the header is missing or does not match the bearer scheme.
 */
function extractBearer(req: Request): string | null {
  const h = req.headers.authorization ?? "";
  if (!h.toLowerCase().startsWith("bearer ")) return null;
  return h.slice(7).trim() || null;
}

/**
 * Express middleware. Use on any route that mutates server state and is not
 * owned by the requesting end-user.
 */
export function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const expected = getAdminToken();
  const provided = extractBearer(req);
  if (!provided || provided !== expected) {
    res.status(401).json({ error: "admin auth required" });
    return;
  }
  next();
}

/**
 * Same as requireAdmin but exposed as a no-op when ADMIN_DISABLE_AUTH=1.
 * Useful for local end-to-end tests that don't want to fish out the token.
 */
export function requireAdminUnlessDisabled(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (process.env.ADMIN_DISABLE_AUTH === "1") {
    next();
    return;
  }
  requireAdmin(req, res, next);
}
