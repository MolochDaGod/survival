/**
 * Generate optimized favicon and logo files from the source grudges-logo.png.
 *
 * Outputs:
 *   favicon.ico     — 32x32 (ICO format via PNG in ico wrapper)
 *   favicon-16.png  — 16x16
 *   favicon-32.png  — 32x32
 *   favicon-192.png — 192x192 (Android home screen)
 *   favicon-512.png — 512x512 (PWA splash)
 *   apple-touch-icon.png — 180x180
 *   logo-256.png    — 256x256 (in-game HUD, login screen)
 *   logo-512.png    — 512x512 (OG image, marketing)
 *   opengraph.png   — 1200x630 (centered logo on dark bg)
 *
 * Usage: node scripts/gen-favicons.mjs [source.png]
 */
import sharp from 'sharp';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const source = process.argv[2] || resolve(root, 'artifacts/arpg-game/public/grudges-logo.png');
const websitePublic = resolve(root, 'artifacts/website/public');
const gamePublic = resolve(root, 'artifacts/arpg-game/public');

async function gen(outDir, name, size, opts = {}) {
  const outPath = resolve(outDir, name);
  await sharp(source)
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ quality: 90, compressionLevel: 9 })
    .toFile(outPath);
  const stat = (await import('fs')).statSync(outPath);
  console.log(`  ${name} — ${size}x${size} (${(stat.size / 1024).toFixed(1)} KB)`);
}

async function genOG(outDir) {
  // 1200x630 with centered logo on dark background
  const logoSize = 400;
  const logo = await sharp(source)
    .resize(logoSize, logoSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  const outPath = resolve(outDir, 'opengraph.png');
  await sharp({
    create: { width: 1200, height: 630, channels: 4, background: { r: 10, g: 6, b: 4, alpha: 255 } }
  })
    .composite([{ input: logo, gravity: 'centre' }])
    .png({ quality: 85 })
    .toFile(outPath);

  const stat = (await import('fs')).statSync(outPath);
  console.log(`  opengraph.png — 1200x630 (${(stat.size / 1024).toFixed(1)} KB)`);
}

console.log(`Source: ${source}`);
console.log(`\nWebsite (${websitePublic}):`);
await gen(websitePublic, 'favicon-16.png', 16);
await gen(websitePublic, 'favicon-32.png', 32);
await gen(websitePublic, 'favicon-192.png', 192);
await gen(websitePublic, 'favicon-512.png', 512);
await gen(websitePublic, 'apple-touch-icon.png', 180);
await gen(websitePublic, 'logo-256.png', 256);
await genOG(websitePublic);

console.log(`\nGame (${gamePublic}):`);
await gen(gamePublic, 'favicon-32.png', 32);
await gen(gamePublic, 'favicon-192.png', 192);
await gen(gamePublic, 'apple-touch-icon.png', 180);
await gen(gamePublic, 'logo-256.png', 256);
await gen(gamePublic, 'logo-512.png', 512);

console.log('\nDone. Update HTML <link> tags to reference the new files.');
