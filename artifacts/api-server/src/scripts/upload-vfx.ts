/**
 * One-off script: upload curated VFX + bullet GLBs from /tmp/vfx-stage/
 * to the Replit App Storage bucket under the public search path.
 *
 * Run from monorepo root:
 *   pnpm --filter @workspace/api-server exec tsx src/scripts/upload-vfx.ts
 *
 * Resolves uploaded files at GET /api/assets/public/<key>
 */
import { Storage } from '@google-cloud/storage';
import { readdir, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { join, relative, extname } from 'node:path';

const REPLIT_SIDECAR = 'http://127.0.0.1:1106';
const STAGE_DIR = '/tmp/vfx-stage';

const gcs = new Storage({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  credentials: {
    audience:           'replit',
    subject_token_type: 'access_token',
    token_url:          `${REPLIT_SIDECAR}/token`,
    type:               'external_account',
    credential_source: {
      url:    `${REPLIT_SIDECAR}/credential`,
      format: { type: 'json', subject_token_field_name: 'access_token' },
    },
    universe_domain: 'googleapis.com',
  } as any, // eslint-disable-line @typescript-eslint/no-explicit-any
  projectId: '',
});

function contentTypeFor(name: string): string {
  const ext = extname(name).toLowerCase();
  if (ext === '.glb')  return 'model/gltf-binary';
  if (ext === '.gltf') return 'model/gltf+json';
  if (ext === '.bin')  return 'application/octet-stream';
  if (ext === '.png')  return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.ktx2') return 'image/ktx2';
  return 'application/octet-stream';
}

async function* walk(dir: string): AsyncGenerator<string> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      // skip _extract — godot resources, not consumable in three.js
      if (entry.name === '_extract') continue;
      yield* walk(full);
    } else if (entry.isFile()) {
      yield full;
    }
  }
}

async function main(): Promise<void> {
  // Resolve the upload destination from PUBLIC_OBJECT_SEARCH_PATHS — first entry.
  // Format: /<bucket>/<prefix> e.g. /replit-objstore-uuid/public
  const searchPaths = (process.env.PUBLIC_OBJECT_SEARCH_PATHS || '')
    .split(',').map(s => s.trim()).filter(Boolean);
  if (searchPaths.length === 0) {
    throw new Error('PUBLIC_OBJECT_SEARCH_PATHS not set');
  }
  const dest = searchPaths[0]!.replace(/^\/+/, '').replace(/\/+$/, '');
  const slash = dest.indexOf('/');
  const bucketName = slash === -1 ? dest : dest.slice(0, slash);
  const destPrefix = slash === -1 ? '' : dest.slice(slash + 1);
  console.log(`[upload-vfx] bucket=${bucketName} destPrefix=${destPrefix || '(root)'}`);

  const bucket = gcs.bucket(bucketName);

  let count = 0;
  let bytes = 0;
  for await (const filePath of walk(STAGE_DIR)) {
    const rel = relative(STAGE_DIR, filePath); // e.g. vfx/foo.glb
    const objectKey = destPrefix ? `${destPrefix}/${rel}` : rel;
    const size = (await stat(filePath)).size;

    process.stdout.write(`  → ${rel} (${(size / 1024 / 1024).toFixed(1)}MB) ... `);

    const file = bucket.file(objectKey);
    await new Promise<void>((resolve, reject) => {
      const writeStream = file.createWriteStream({
        resumable: size > 5 * 1024 * 1024,
        metadata: {
          contentType: contentTypeFor(rel),
          cacheControl: 'public, max-age=31536000, immutable',
        },
      });
      createReadStream(filePath).pipe(writeStream)
        .on('finish', () => resolve())
        .on('error', reject);
    });
    count += 1;
    bytes += size;
    process.stdout.write('ok\n');
  }
  console.log(`[upload-vfx] done: ${count} files, ${(bytes / 1024 / 1024).toFixed(1)}MB total`);
}

main().catch((e) => {
  console.error('[upload-vfx] failed:', e);
  process.exit(1);
});
