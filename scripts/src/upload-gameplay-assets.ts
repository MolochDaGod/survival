/**
 * upload-gameplay-assets.ts
 *
 * One-shot uploader for the static `gameplay.html` page assets.
 * Pushes the boss logo, favicon, and 120 perk PNGs into the R2
 * `R2_BUCKET_ASSETS` bucket under the `gameplay/` prefix, with long
 * cache lifetimes so the marketing page can be served from CDN.
 *
 * After running, set the `ASSETS` constant at the top of the
 * `gameplay.html` script block to the printed CDN base URL
 * (without trailing slash). Example:
 *
 *     const ASSETS = 'https://pub-xxxx.r2.dev/gameplay';
 *
 * Re-uploads are content-addressed by ETag — files unchanged on R2
 * are skipped.
 *
 * Required env (already set in this Repl):
 *   CF_ACCOUNT_ID, OBJECT_STORAGE_KEY, OBJECT_STORAGE_SECRET,
 *   R2_BUCKET_ASSETS, OBJECT_STORAGE_PUBLIC_URL or _R2_URL
 */

import { readFile, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { resolve, posix, sep } from 'node:path';
import { createHash } from 'node:crypto';

import {
  S3Client,
  HeadObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import mime from 'mime-types';

// ─── Config ────────────────────────────────────────────────────────────
const REPO_ROOT = resolve(import.meta.dirname, '..', '..');
const GAME_PUBLIC = resolve(REPO_ROOT, 'artifacts', 'arpg-game', 'public');
const REMOTE_PREFIX = 'gameplay';

const SOURCES: string[] = [
  'bosslogo.png',
  'favicon.svg',
];
// Legacy 4-track perk icons (still hosted; the new page uses the SVG set below).
for (const track of ['hero', 'warrior', 'smarts', 'maker']) {
  for (let n = 1; n <= 30; n++) {
    SOURCES.push(`icons/perks/${track}/${n}.png`);
  }
}
// Current 8-stat tier SVGs — what the new gameplay.html actually references.
for (const stat of ['bio', 'neu', 'kin', 'qnt', 'syn', 'chr', 'ent', 'gra']) {
  for (let t = 1; t <= 6; t++) {
    SOURCES.push(`icons/perks/stat-tiers/${stat}-t${t}.svg`);
  }
}

// ─── Env helpers ───────────────────────────────────────────────────────
function need(name: string): string {
  const v = process.env[name];
  if (!v) { console.error(`✖ missing env ${name}`); process.exit(1); }
  return v;
}

const BUCKET     = need('R2_BUCKET_ASSETS');
const ACCOUNT_ID = need('CF_ACCOUNT_ID');
const KEY        = need('OBJECT_STORAGE_KEY');
const SECRET     = need('OBJECT_STORAGE_SECRET');
const PUBLIC_BASE = process.env.OBJECT_STORAGE_PUBLIC_URL
                 || process.env.OBJECT_STORAGE_PUBLIC_R2_URL
                 || '';

// ─── R2 client ─────────────────────────────────────────────────────────
const s3 = new S3Client({
  region: process.env.OBJECT_STORAGE_REGION || 'auto',
  endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: KEY, secretAccessKey: SECRET },
  forcePathStyle: true,
});

// ─── Helpers ───────────────────────────────────────────────────────────
async function md5OfFile(path: string): Promise<string> {
  const buf = await readFile(path);
  return createHash('md5').update(buf).digest('hex');
}

async function remoteEtag(key: string): Promise<string | null> {
  try {
    const r = await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
    return (r.ETag ?? '').replace(/"/g, '') || null;
  } catch (e: unknown) {
    const err = e as { $metadata?: { httpStatusCode?: number } };
    if (err.$metadata?.httpStatusCode === 404) return null;
    throw e;
  }
}

async function uploadOne(localRel: string): Promise<{ uploaded: boolean; key: string }> {
  const localAbs = resolve(GAME_PUBLIC, localRel.split('/').join(sep));
  await stat(localAbs); // throws if missing — surface filename
  const key = posix.join(REMOTE_PREFIX, localRel);
  const localMd5 = await md5OfFile(localAbs);
  const remote = await remoteEtag(key);
  if (remote === localMd5) {
    return { uploaded: false, key };
  }
  const ct = mime.lookup(localAbs) || 'application/octet-stream';
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: createReadStream(localAbs),
    ContentType: ct,
    CacheControl: 'public, max-age=31536000, immutable',
  }));
  return { uploaded: true, key };
}

// ─── Main ──────────────────────────────────────────────────────────────
async function main() {
  console.log(`→ uploading ${SOURCES.length} assets to bucket "${BUCKET}" under "${REMOTE_PREFIX}/"`);
  let up = 0, skip = 0;
  for (const src of SOURCES) {
    try {
      const r = await uploadOne(src);
      if (r.uploaded) { up++; process.stdout.write('.'); }
      else            { skip++; process.stdout.write('·'); }
    } catch (e) {
      console.error(`\n✖ failed: ${src}`, e);
      process.exit(1);
    }
  }
  console.log(`\n✓ done — ${up} uploaded, ${skip} unchanged.`);

  if (PUBLIC_BASE) {
    const cdnBase = PUBLIC_BASE.replace(/\/+$/, '') + '/' + REMOTE_PREFIX;
    console.log('\nCDN base for gameplay.html:');
    console.log(`    ${cdnBase}`);
    console.log('\nSet the ASSETS constant in artifacts/arpg-game/public/gameplay.html to:');
    console.log(`    const ASSETS = ${JSON.stringify(cdnBase)};`);
    console.log(`\nSample icon URL: ${cdnBase}/icons/perks/hero/1.png`);
  } else {
    console.warn('\n⚠  OBJECT_STORAGE_PUBLIC_URL / _R2_URL is not set; cannot print CDN base.');
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
