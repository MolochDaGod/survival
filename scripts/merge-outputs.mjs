/**
 * merge-outputs.mjs
 *
 * After all artifacts have been built, copies sub-app build outputs
 * (arpg-game, admin, asset-studio) into the website output directory
 * so Vercel's single `outputDirectory` serves everything.
 *
 * Usage: node scripts/merge-outputs.mjs
 */
import { cpSync, existsSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const websiteOut = resolve(root, "artifacts/website/dist/public");

/** Sub-apps whose build output should be merged into the website root. */
const SUB_APPS = ["arpg-game", "admin", "asset-studio"];

if (!existsSync(websiteOut)) {
  console.warn("[merge] WARNING: website output not found — run build:website first");
  process.exit(0);
}

for (const app of SUB_APPS) {
  const src = resolve(root, `artifacts/${app}/dist/public`);
  const dest = resolve(websiteOut, app);

  if (!existsSync(src)) {
    console.warn(`[merge] Skipping ${app} — not built (${src})`);
    continue;
  }

  mkdirSync(dest, { recursive: true });
  cpSync(src, dest, { recursive: true });
  console.log(`[merge] Copied ${app} → ${dest}`);
}

console.log("[merge] Done — all sub-apps merged into website output.");
