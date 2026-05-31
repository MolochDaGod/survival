/**
 * upload-icons-r2.mjs — Bulk-upload all icon packs to Cloudflare R2 (grudge-assets bucket)
 *
 * Reads every PNG/JPG from public/icons/<category>/ directories, generates a
 * Grudge UUID for each, uploads to R2 under grudge-nexus/icons/<category>/<uuid>.<ext>,
 * and writes a manifest JSON at src/data/iconManifest.ts.
 *
 * Usage:  node scripts/upload-icons-r2.mjs
 * Env:    reads .env for CF_ACCOUNT_ID, OBJECT_STORAGE_KEY, OBJECT_STORAGE_SECRET, R2_BUCKET_ASSETS
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const ROOT       = path.resolve(__dirname, '..');

// ── Load .env ──────────────────────────────────────────────────────────────
function loadEnv() {
  const envPath = path.join(ROOT, '.env');
  if (!fs.existsSync(envPath)) {
    console.error('No .env found at', envPath);
    process.exit(1);
  }
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let   val = trimmed.slice(eq + 1).trim();
    // strip surrounding quotes
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}
loadEnv();

const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID;
const ACCESS_KEY    = process.env.OBJECT_STORAGE_KEY;
const SECRET_KEY    = process.env.OBJECT_STORAGE_SECRET;
const BUCKET        = process.env.R2_BUCKET_ASSETS || 'grudge-assets';
const CDN_BASE      = (process.env.OBJECT_STORAGE_PUBLIC_URL || 'https://assets.grudge-studio.com').replace(/\/$/, '');

if (!CF_ACCOUNT_ID || !ACCESS_KEY || !SECRET_KEY) {
  console.error('Missing R2 credentials in .env (CF_ACCOUNT_ID, OBJECT_STORAGE_KEY, OBJECT_STORAGE_SECRET)');
  process.exit(1);
}

const s3 = new S3Client({
  region:         'auto',
  endpoint:       `https://${CF_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials:    { accessKeyId: ACCESS_KEY, secretAccessKey: SECRET_KEY },
  forcePathStyle: true,
});

// ── Grudge UUID generator ──────────────────────────────────────────────────
function grudgeUuid() {
  // grudge-<8hex>-<4hex>-<4hex>-<4hex>-<12hex>
  const bytes = crypto.randomBytes(16);
  const hex   = bytes.toString('hex');
  return `grudge-${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20,32)}`;
}

// ── MIME from extension ────────────────────────────────────────────────────
function mimeFor(ext) {
  switch (ext.toLowerCase()) {
    case '.png':  return 'image/png';
    case '.jpg':
    case '.jpeg': return 'image/jpeg';
    default:      return 'application/octet-stream';
  }
}

// ── Check if key already exists (skip re-upload) ───────────────────────────
async function exists(key) {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
    return true;
  } catch {
    return false;
  }
}

// ── Upload a single file ───────────────────────────────────────────────────
async function upload(localPath, r2Key, contentType) {
  const body = fs.readFileSync(localPath);
  await s3.send(new PutObjectCommand({
    Bucket:       BUCKET,
    Key:          r2Key,
    Body:         body,
    ContentType:  contentType,
    CacheControl: 'public, max-age=31536000, immutable',
  }));
}

// ── Scan icon directories ──────────────────────────────────────────────────
const ICONS_DIR = path.join(ROOT, 'artifacts', 'arpg-game', 'public', 'icons');

// Categories to upload (each is a subdirectory of public/icons/)
const CATEGORIES = [
  'genetics',
  'cyberpunk-food',
  'cyberpunk-weapons',
  'cyberpunk-artifacts',
  'scifi-items',
  'scifi-misc',
  'rpg-gui',
];

async function main() {
  const manifest = {};   // { category: { originalName: { uuid, r2Key, cdnUrl, localPath } } }
  let uploaded  = 0;
  let skipped   = 0;
  let errors    = 0;

  for (const category of CATEGORIES) {
    const catDir = path.join(ICONS_DIR, category);
    if (!fs.existsSync(catDir)) {
      console.warn(`⚠  Category dir not found: ${category}`);
      continue;
    }

    manifest[category] = {};
    const files = fs.readdirSync(catDir).filter(f => /\.(png|jpg|jpeg)$/i.test(f));
    console.log(`\n📦 ${category}: ${files.length} files`);

    for (const file of files) {
      const ext     = path.extname(file).toLowerCase();
      const uuid    = grudgeUuid();
      const r2Key   = `grudge-nexus/icons/${category}/${uuid}${ext}`;
      const cdnUrl  = `${CDN_BASE}/${r2Key}`;
      const local   = path.join(catDir, file);

      manifest[category][file] = { uuid, r2Key, cdnUrl, localPath: `/icons/${category}/${file}` };

      try {
        await upload(local, r2Key, mimeFor(ext));
        uploaded++;
        process.stdout.write('.');
      } catch (err) {
        errors++;
        console.error(`\n✗ ${r2Key}: ${err.message}`);
      }
    }
  }

  console.log(`\n\n✅ Upload complete: ${uploaded} uploaded, ${skipped} skipped, ${errors} errors`);

  // ── Write manifest ──────────────────────────────────────────────────────
  const manifestPath = path.join(ROOT, 'artifacts', 'arpg-game', 'src', 'data', 'iconManifest.ts');
  const tsContent = `/**
 * Icon Manifest — auto-generated by scripts/upload-icons-r2.mjs
 * Maps original filenames → Grudge UUIDs + R2 CDN URLs.
 * DO NOT EDIT BY HAND.
 *
 * Generated: ${new Date().toISOString()}
 * Total icons: ${uploaded}
 */

export const CDN_BASE = '${CDN_BASE}';

export interface IconEntry {
  uuid: string;
  r2Key: string;
  cdnUrl: string;
  /** Local fallback path (relative to public/) */
  localPath: string;
}

export type IconCategory = ${CATEGORIES.map(c => `'${c}'`).join(' | ')};

export const ICON_MANIFEST: Record<IconCategory, Record<string, IconEntry>> = ${JSON.stringify(manifest, null, 2)} as const;

/** Quick lookup: category + filename → CDN URL */
export function iconUrl(category: IconCategory, filename: string): string {
  const entry = ICON_MANIFEST[category]?.[filename];
  return entry?.cdnUrl ?? entry?.localPath ?? '';
}

/** Quick lookup: category + filename → local fallback path */
export function iconLocal(category: IconCategory, filename: string): string {
  return ICON_MANIFEST[category]?.[filename]?.localPath ?? '';
}
`;

  fs.writeFileSync(manifestPath, tsContent, 'utf8');
  console.log(`📄 Manifest written to: ${manifestPath}`);

  // Also write raw JSON for tooling
  const jsonPath = path.join(ROOT, 'artifacts', 'arpg-game', 'src', 'data', 'iconManifest.json');
  fs.writeFileSync(jsonPath, JSON.stringify(manifest, null, 2), 'utf8');
  console.log(`📄 JSON manifest: ${jsonPath}`);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
