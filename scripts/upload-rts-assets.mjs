#!/usr/bin/env node
/**
 * upload-rts-assets.mjs — push RTS-Grudge attached_assets to R2.
 *
 * Uploads:
 *   - GLB models           → grudge-nexus/models/rts/{name}.glb
 *   - Backgrounds/images   → grudge-nexus/images/rts/{name}
 *   - Skill tree icons     → grudge-nexus/icons/skills/{class}/{name}
 *   - Extra animation FBXs → grudge-nexus/models/animations/extra/{name}.fbx
 *
 * Usage: node scripts/upload-rts-assets.mjs [--dry-run] [--force]
 */

import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, basename, extname } from 'path';
import { fileURLToPath } from 'url';

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

const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID;
const ACCESS_KEY    = process.env.OBJECT_STORAGE_KEY;
const SECRET_KEY    = process.env.OBJECT_STORAGE_SECRET;
const BUCKET        = process.env.R2_BUCKET_ASSETS || 'grudge-assets';

if (!DRY_RUN && (!CF_ACCOUNT_ID || !ACCESS_KEY || !SECRET_KEY)) {
  console.error('Missing env vars. Set them in .env or run with --dry-run.');
  process.exit(1);
}

const s3 = DRY_RUN ? null : new S3Client({
  region: 'auto',
  endpoint: `https://${CF_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: ACCESS_KEY, secretAccessKey: SECRET_KEY },
  forcePathStyle: true,
});

const ASSETS_ROOT = 'F:\\GitHub\\RTS-Grudge\\attached_assets';
const PREFIX = 'grudge-nexus';

function mimeForExt(ext) {
  switch (ext.toLowerCase()) {
    case '.glb':  return 'model/gltf-binary';
    case '.gltf': return 'model/gltf+json';
    case '.fbx':  return 'application/octet-stream';
    case '.png':  return 'image/png';
    case '.jpg': case '.jpeg': return 'image/jpeg';
    case '.gif':  return 'image/gif';
    case '.html': return 'text/html';
    default: return 'application/octet-stream';
  }
}

async function upload(localPath, r2Key) {
  const ext = extname(localPath);
  const size = statSync(localPath).size;
  const sizeMB = (size / 1024 / 1024).toFixed(2);

  if (DRY_RUN) { console.log(`[DRY] ${r2Key}  (${sizeMB} MB)`); return; }

  if (!FORCE) {
    try {
      await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: r2Key }));
      console.log(`[SKIP] ${r2Key}`);
      return;
    } catch (e) {
      if (e.name !== 'NotFound' && e.$metadata?.httpStatusCode !== 404) throw e;
    }
  }

  const body = readFileSync(localPath);
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await s3.send(new PutObjectCommand({
        Bucket: BUCKET, Key: r2Key, Body: body, ContentType: mimeForExt(ext),
      }));
      console.log(`[OK]   ${r2Key}  (${sizeMB} MB)`);
      return;
    } catch (e) {
      if (attempt < 3 && (e.code?.includes?.('SSL') || e.message?.includes?.('SSL') || e.code?.includes?.('ECONNRESET'))) {
        console.log(`[RETRY ${attempt}/3] ${r2Key}`);
        await new Promise(r => setTimeout(r, 2000 * attempt));
      } else throw e;
    }
  }
}

function sanitize(name) {
  return name.replace(/\s+/g, '_').replace(/[()]/g, '').toLowerCase();
}

async function main() {
  console.log(`\nRTS-Grudge Asset Upload → R2 bucket: ${BUCKET}`);
  console.log(`Source: ${ASSETS_ROOT}`);
  if (DRY_RUN) console.log('(DRY RUN)\n'); else console.log('');

  let count = 0;

  // 1. Root-level GLBs → models/rts/
  console.log('── GLB Models ──');
  for (const file of readdirSync(ASSETS_ROOT)) {
    if (!file.endsWith('.glb')) continue;
    const key = `${PREFIX}/models/rts/${sanitize(basename(file, '.glb'))}.glb`;
    await upload(join(ASSETS_ROOT, file), key);
    count++;
  }

  // 2. Root-level images (png/jpg)
  console.log('\n── Root Images ──');
  for (const file of readdirSync(ASSETS_ROOT)) {
    const ext = extname(file).toLowerCase();
    if (!['.png', '.jpg', '.jpeg'].includes(ext)) continue;
    const key = `${PREFIX}/images/rts/${sanitize(basename(file, ext))}${ext}`;
    await upload(join(ASSETS_ROOT, file), key);
    count++;
  }

  // 3. backgroundsandimages/
  const bgDir = join(ASSETS_ROOT, 'backgroundsandimages');
  if (existsSync(bgDir)) {
    console.log('\n── Backgrounds & Images ──');
    for (const file of readdirSync(bgDir)) {
      const ext = extname(file).toLowerCase();
      if (!['.png', '.jpg', '.jpeg', '.gif'].includes(ext)) continue;
      const key = `${PREFIX}/images/backgrounds/${sanitize(basename(file, ext))}${ext}`;
      await upload(join(bgDir, file), key);
      count++;
    }
  }

  // 4. extra animations/
  const animDir = join(ASSETS_ROOT, 'extra animations');
  if (existsSync(animDir)) {
    console.log('\n── Extra Animations ──');
    for (const file of readdirSync(animDir)) {
      if (!file.endsWith('.fbx')) continue;
      const key = `${PREFIX}/models/animations/extra/${sanitize(basename(file, '.fbx'))}.fbx`;
      await upload(join(animDir, file), key);
      count++;
    }
  }

  // 5. grudge-skill-tree icons
  const skillDir = join(ASSETS_ROOT, 'grudge-skill-tree', 'icons-src');
  if (existsSync(skillDir)) {
    console.log('\n── Skill Tree Icons ──');
    for (const classDir of readdirSync(skillDir)) {
      const classPath = join(skillDir, classDir);
      if (!statSync(classPath).isDirectory()) continue;
      // Icons are nested one more level: EarthMage_Free/EarthMage_Free/EarthMage_1.png
      const innerDirs = readdirSync(classPath).filter(d => statSync(join(classPath, d)).isDirectory());
      for (const inner of innerDirs) {
        for (const file of readdirSync(join(classPath, inner))) {
          if (!file.endsWith('.png')) continue;
          const className = sanitize(classDir.replace('_Free', ''));
          const key = `${PREFIX}/icons/skills/${className}/${sanitize(basename(file, '.png'))}.png`;
          await upload(join(classPath, inner, file), key);
          count++;
        }
      }
    }
  }

  // 6. Skill tree contact sheets
  const sheetsDir = join(ASSETS_ROOT, 'grudge-skill-tree', 'contact-sheets');
  if (existsSync(sheetsDir)) {
    console.log('\n── Skill Contact Sheets ──');
    for (const file of readdirSync(sheetsDir)) {
      if (!file.endsWith('.png')) continue;
      const key = `${PREFIX}/icons/skills/sheets/${sanitize(basename(file, '.png'))}.png`;
      await upload(join(sheetsDir, file), key);
      count++;
    }
  }

  console.log(`\nDone. ${count} files ${DRY_RUN ? 'would be' : ''} uploaded.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
