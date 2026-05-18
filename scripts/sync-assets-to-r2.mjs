/**
 * sync-assets-to-r2.mjs
 *
 * Bulk-uploads arpg-game/public/* assets to the R2 `grudge-assets` bucket
 * so the game client can load them from the Cloudflare CDN instead of
 * bundling 1.5 GB into every Vercel deploy.
 *
 * Prerequisites:
 *   1. Copy .env.example → .env and fill in:
 *        CF_ACCOUNT_ID, OBJECT_STORAGE_KEY, OBJECT_STORAGE_SECRET,
 *        R2_BUCKET_ASSETS (default: grudge-assets)
 *   2. Run: pnpm install  (ensures @aws-sdk is available)
 *
 * Usage:
 *   node scripts/sync-assets-to-r2.mjs                  # full sync
 *   node scripts/sync-assets-to-r2.mjs --dry-run        # list what would upload
 *   node scripts/sync-assets-to-r2.mjs --prefix=models  # sync only models/
 *
 * The script:
 *   - Walks the CDN-eligible directories (models, icons, textures, etc.)
 *   - Skips files already on R2 (by ETag/size match) for incremental syncs
 *   - Uploads with correct Content-Type headers for Cloudflare to serve
 *   - Runs 8 concurrent uploads for throughput
 */
import { readFileSync, readdirSync, statSync, createReadStream } from "fs";
import { resolve, dirname, extname, relative } from "path";
import { fileURLToPath } from "url";
import { createHash } from "crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

// ── Load .env manually (no dotenv dependency needed) ──────────────────────
function loadEnv() {
  try {
    const envPath = resolve(root, ".env");
    const lines = readFileSync(envPath, "utf-8").split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq < 0) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim();
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {
    // no .env — rely on shell env
  }
}
loadEnv();

// ── Config ────────────────────────────────────────────────────────────────
const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID;
const ACCESS_KEY = process.env.OBJECT_STORAGE_KEY;
const SECRET_KEY = process.env.OBJECT_STORAGE_SECRET;
const REGION = process.env.OBJECT_STORAGE_REGION || "auto";
const BUCKET = process.env.R2_BUCKET_ASSETS || "grudge-assets";

if (!CF_ACCOUNT_ID || !ACCESS_KEY || !SECRET_KEY) {
  console.error(
    "Missing R2 credentials. Set CF_ACCOUNT_ID, OBJECT_STORAGE_KEY, OBJECT_STORAGE_SECRET in .env"
  );
  process.exit(1);
}

// ── Parse CLI args ────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const prefixArg = args.find((a) => a.startsWith("--prefix="));
const PREFIX_FILTER = prefixArg ? prefixArg.split("=")[1] : null;
const CONCURRENCY = 8;

// ── Directories that should live on CDN (match vercel-prebuilt GAME_SKIP) ─
const CDN_DIRS = [
  "models",
  "icons",
  "textures",
  "locations",
  "books",
  "bestiary",
  "assets", // assets/survival/*
];

const PUBLIC_DIR = resolve(root, "artifacts/arpg-game/public");

// ── Content-Type map ──────────────────────────────────────────────────────
const MIME = {
  ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json",
  ".fbx": "application/octet-stream",
  ".obj": "text/plain",
  ".mtl": "text/plain",
  ".bin": "application/octet-stream",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".gif": "image/gif",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav",
  ".json": "application/json",
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".wasm": "application/wasm",
};

function mimeFor(file) {
  return MIME[extname(file).toLowerCase()] || "application/octet-stream";
}

// ── S3 client (dynamic import so the script fails fast on missing creds) ──
const { S3Client, PutObjectCommand, HeadObjectCommand } = await import(
  "@aws-sdk/client-s3"
);

const s3 = new S3Client({
  region: REGION,
  endpoint: `https://${CF_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: ACCESS_KEY, secretAccessKey: SECRET_KEY },
  forcePathStyle: true,
});

// ── Walk directory ────────────────────────────────────────────────────────
function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(full));
    } else {
      out.push(full);
    }
  }
  return out;
}

// ── Check if file exists on R2 with same size (skip re-upload) ────────────
async function existsOnR2(key, localSize) {
  try {
    const head = await s3.send(
      new HeadObjectCommand({ Bucket: BUCKET, Key: key })
    );
    return head.ContentLength === localSize;
  } catch {
    return false;
  }
}

// ── Upload one file ───────────────────────────────────────────────────────
async function uploadFile(localPath, key) {
  const body = readFileSync(localPath);
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: body,
      ContentType: mimeFor(localPath),
    })
  );
}

// ── Main ──────────────────────────────────────────────────────────────────
async function main() {
  console.log(`[sync] Bucket: ${BUCKET}`);
  console.log(`[sync] CDN dirs: ${CDN_DIRS.join(", ")}`);
  console.log(`[sync] Source: ${PUBLIC_DIR}`);
  if (PREFIX_FILTER) console.log(`[sync] Filter: ${PREFIX_FILTER}`);
  if (DRY_RUN) console.log("[sync] DRY RUN — no uploads");
  console.log("");

  // Collect files
  const allFiles = [];
  for (const dir of CDN_DIRS) {
    const full = resolve(PUBLIC_DIR, dir);
    try {
      statSync(full);
    } catch {
      console.log(`[sync] Skipping ${dir}/ (not found)`);
      continue;
    }
    const files = walk(full);
    for (const f of files) {
      const key = relative(PUBLIC_DIR, f).replace(/\\/g, "/");
      if (PREFIX_FILTER && !key.startsWith(PREFIX_FILTER)) continue;
      allFiles.push({ localPath: f, key, size: statSync(f).size });
    }
  }

  console.log(`[sync] Found ${allFiles.length} files (${(allFiles.reduce((s, f) => s + f.size, 0) / 1024 / 1024).toFixed(1)} MB)`);

  if (DRY_RUN) {
    for (const f of allFiles.slice(0, 30)) {
      console.log(`  would upload: ${f.key} (${(f.size / 1024).toFixed(1)} KB)`);
    }
    if (allFiles.length > 30)
      console.log(`  ... and ${allFiles.length - 30} more`);
    return;
  }

  // Upload with concurrency pool
  let uploaded = 0;
  let skipped = 0;
  let failed = 0;
  let totalBytes = 0;
  const startTime = Date.now();

  async function process(file) {
    try {
      const exists = await existsOnR2(file.key, file.size);
      if (exists) {
        skipped++;
        return;
      }
      await uploadFile(file.localPath, file.key);
      uploaded++;
      totalBytes += file.size;
      if (uploaded % 50 === 0 || uploaded === 1) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        const mbDone = (totalBytes / 1024 / 1024).toFixed(1);
        console.log(
          `[sync] ${uploaded} uploaded, ${skipped} skipped, ${failed} failed (${mbDone} MB in ${elapsed}s)`
        );
      }
    } catch (err) {
      failed++;
      console.error(`[sync] FAILED: ${file.key} — ${err.message}`);
    }
  }

  // Run pool
  const queue = [...allFiles];
  const workers = [];
  for (let i = 0; i < CONCURRENCY; i++) {
    workers.push(
      (async () => {
        while (queue.length > 0) {
          const file = queue.shift();
          if (file) await process(file);
        }
      })()
    );
  }
  await Promise.all(workers);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log("");
  console.log(`[sync] Done in ${elapsed}s`);
  console.log(`[sync]   Uploaded: ${uploaded} files (${(totalBytes / 1024 / 1024).toFixed(1)} MB)`);
  console.log(`[sync]   Skipped:  ${skipped} (already on R2)`);
  console.log(`[sync]   Failed:   ${failed}`);
}

main().catch((err) => {
  console.error("[sync] Fatal:", err);
  process.exit(1);
});
