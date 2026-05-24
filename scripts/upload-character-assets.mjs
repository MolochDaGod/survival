#!/usr/bin/env node
/**
 * upload-character-assets.mjs — push Quaternius modular character GLTFs to R2.
 *
 * Reads from the local "Ultimate Modular Men" pack and uploads:
 *   - 11 individual character GLTFs → grudge-nexus/models/characters/male/{variant}.gltf
 *   - Animations.fbx               → grudge-nexus/models/animations/Animations.fbx
 *   - Weapon FBXs                  → grudge-nexus/models/gear/weapons/{weapon}.fbx
 *   - Modular FBX parts            → grudge-nexus/models/gear/male/{slot}/{variant}.fbx
 *
 * Requires env vars: CF_ACCOUNT_ID, OBJECT_STORAGE_KEY, OBJECT_STORAGE_SECRET, R2_BUCKET_ASSETS
 * Usage: node scripts/upload-character-assets.mjs [--dry-run]
 */

import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, basename, extname } from 'path';
import { fileURLToPath } from 'url';

// Load .env manually (no dotenv dependency)
const __dirname = fileURLToPath(new URL('.', import.meta.url));
const envPath = join(__dirname, '..', '.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

const DRY_RUN = process.argv.includes('--dry-run');
const FORCE   = process.argv.includes('--force');

// ── Config ──────────────────────────────────────────────────────────────────

const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID;
const ACCESS_KEY    = process.env.OBJECT_STORAGE_KEY;
const SECRET_KEY    = process.env.OBJECT_STORAGE_SECRET;
const BUCKET        = process.env.R2_BUCKET_ASSETS || 'grudge-assets';

if (!DRY_RUN && (!CF_ACCOUNT_ID || !ACCESS_KEY || !SECRET_KEY)) {
  console.error('Missing env vars: CF_ACCOUNT_ID, OBJECT_STORAGE_KEY, OBJECT_STORAGE_SECRET');
  console.error('Set them in .env or run with --dry-run to preview.');
  process.exit(1);
}

const s3 = DRY_RUN ? null : new S3Client({
  region: 'auto',
  endpoint: `https://${CF_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: ACCESS_KEY, secretAccessKey: SECRET_KEY },
  forcePathStyle: true,
});

// ── Source paths ─────────────────────────────────────────────────────────────

const PACK_ROOT = 'D:\\Games\\Models\\Ultimate Modular Men- Feb 2022-20260501T045435Z-3-001\\Ultimate Modular Men- Feb 2022';
const GLTF_DIR  = join(PACK_ROOT, 'Individual Characters', 'glTF');
const PARTS_DIR = join(PACK_ROOT, 'Separate Skeletal Meshes and Animations');
const ANIM_FILE = join(PARTS_DIR, 'Animations.fbx');

// ── R2 key prefix ───────────────────────────────────────────────────────────

const PREFIX = 'grudge-nexus/models';

// ── MIME types ───────────────────────────────────────────────────────────────

function mimeForExt(ext) {
  switch (ext.toLowerCase()) {
    case '.gltf': return 'model/gltf+json';
    case '.glb':  return 'model/gltf-binary';
    case '.fbx':  return 'application/octet-stream';
    case '.bin':  return 'application/octet-stream';
    case '.png':  return 'image/png';
    case '.jpg': case '.jpeg': return 'image/jpeg';
    default: return 'application/octet-stream';
  }
}

// ── Upload helper ───────────────────────────────────────────────────────────

async function upload(localPath, r2Key) {
  const ext = extname(localPath);
  const size = statSync(localPath).size;
  const sizeMB = (size / 1024 / 1024).toFixed(2);

  if (DRY_RUN) {
    console.log(`[DRY] ${r2Key}  (${sizeMB} MB)`);
    return;
  }

  // Skip if already exists (unless --force)
  if (!FORCE) {
    try {
      await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: r2Key }));
      console.log(`[SKIP] ${r2Key}  (already exists)`);
      return;
    } catch (e) {
      if (e.name !== 'NotFound' && e.$metadata?.httpStatusCode !== 404) throw e;
    }
  }

  const body = readFileSync(localPath);
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: r2Key,
    Body: body,
    ContentType: mimeForExt(ext),
  }));
  console.log(`[OK]   ${r2Key}  (${sizeMB} MB)`);
}

// ── Slot mapping ────────────────────────────────────────────────────────────

const SLOT_SUFFIX_MAP = {
  '_Body':     'chest',
  '_Head':     'head',
  '_Legs':     'legs',
  '_Feet':     'feet',
  '_Backpack': 'back',
};

function slotFromFilename(filename) {
  for (const [suffix, slot] of Object.entries(SLOT_SUFFIX_MAP)) {
    if (filename.includes(suffix)) return slot;
  }
  return null;
}

function variantFromFilename(filename) {
  // e.g. "Adventurer_Body.fbx" → "adventurer", "Casual2_Feet.fbx" → "casual2"
  const base = basename(filename, extname(filename));
  const parts = base.split('_');
  // Remove the slot suffix part
  for (const suffix of Object.keys(SLOT_SUFFIX_MAP)) {
    const clean = suffix.replace('_', '');
    const idx = parts.findIndex(p => p === clean);
    if (idx >= 0) { parts.splice(idx, 1); break; }
  }
  return parts.join('_').toLowerCase();
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\nQuaternius Character Asset Upload → R2 bucket: ${BUCKET}`);
  console.log(`Pack root: ${PACK_ROOT}`);
  if (DRY_RUN) console.log('(DRY RUN — no uploads)\n');
  else console.log('');

  let uploaded = 0;
  let skipped = 0;

  // 1. Upload individual character GLTFs
  console.log('── Individual Character GLTFs ──');
  if (existsSync(GLTF_DIR)) {
    for (const file of readdirSync(GLTF_DIR)) {
      if (!file.endsWith('.gltf')) continue;
      const variant = basename(file, '.gltf').toLowerCase();
      const r2Key = `${PREFIX}/characters/male/${variant}.gltf`;
      await upload(join(GLTF_DIR, file), r2Key);
      uploaded++;
    }
  } else {
    console.warn(`  glTF dir not found: ${GLTF_DIR}`);
  }

  // 2. Upload modular FBX parts per variant
  console.log('\n── Modular Gear Parts (FBX) ──');
  if (existsSync(PARTS_DIR)) {
    for (const dir of readdirSync(PARTS_DIR)) {
      const dirPath = join(PARTS_DIR, dir);
      if (!statSync(dirPath).isDirectory()) continue;
      if (dir === 'Weapons') continue; // handled separately

      for (const file of readdirSync(dirPath)) {
        if (!file.endsWith('.fbx')) continue;
        const slot = slotFromFilename(file);
        if (!slot) { console.log(`  [?] ${file} — unknown slot, skipping`); skipped++; continue; }
        const variant = variantFromFilename(file);
        const r2Key = `${PREFIX}/gear/male/${slot}/${variant}.fbx`;
        await upload(join(dirPath, file), r2Key);
        uploaded++;
      }
    }
  }

  // 3. Upload weapons
  console.log('\n── Weapons ──');
  const weaponsDir = join(PARTS_DIR, 'Weapons');
  if (existsSync(weaponsDir)) {
    for (const file of readdirSync(weaponsDir)) {
      if (!file.endsWith('.fbx')) continue;
      const name = basename(file, '.fbx').toLowerCase();
      const r2Key = `${PREFIX}/gear/weapons/${name}.fbx`;
      await upload(join(weaponsDir, file), r2Key);
      uploaded++;
    }
  }

  // 4. Upload shared animations
  console.log('\n── Animations ──');
  if (existsSync(ANIM_FILE)) {
    await upload(ANIM_FILE, `${PREFIX}/animations/Animations.fbx`);
    uploaded++;
  }

  console.log(`\nDone. ${uploaded} files ${DRY_RUN ? 'would be' : ''} uploaded, ${skipped} skipped.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
