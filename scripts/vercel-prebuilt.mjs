/**
 * Prepare .vercel/output/static for --prebuilt deployment.
 *
 * Copies the website build output, strips large asset directories
 * that should be served from R2 CDN, and ensures config.json exists.
 *
 * Usage: node scripts/vercel-prebuilt.mjs
 */
import { cpSync, rmSync, mkdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const src = resolve(root, 'artifacts/website/dist/public');
const dest = resolve(root, '.vercel/output/static');

console.log('[prebuilt] Copying website build → .vercel/output/static');

if (existsSync(dest)) rmSync(dest, { recursive: true });
mkdirSync(dest, { recursive: true });
cpSync(src, dest, { recursive: true });

// Strip large asset dirs that are served from R2 CDN
const stripDirs = ['icons', 'images'];
for (const dir of stripDirs) {
  const p = resolve(dest, dir);
  if (existsSync(p)) {
    rmSync(p, { recursive: true });
    console.log(`[prebuilt] Stripped ${dir}/ (served from R2)`);
  }
}

// Ensure config.json exists
const configPath = resolve(root, '.vercel/output/config.json');
if (!existsSync(configPath)) {
  const config = {
    version: 3,
    routes: [
      { src: '/api/(.*)', dest: 'https://api.grudge-studio.com/api/$1' },
      { src: '/arpg-game$', dest: '/arpg-game/index.html' },
      { src: '/arpg-game/$', dest: '/arpg-game/index.html' },
      { src: '/admin$', dest: '/admin/index.html' },
      { src: '/admin/$', dest: '/admin/index.html' },
      { handle: 'filesystem' },
    ],
  };
  mkdirSync(dirname(configPath), { recursive: true });
  const { writeFileSync } = await import('fs');
  writeFileSync(configPath, JSON.stringify(config, null, 2));
  console.log('[prebuilt] Created config.json');
}

console.log('[prebuilt] Ready for: vercel deploy --prebuilt --prod');
