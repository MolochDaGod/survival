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

// Copy website, skipping large asset dirs via filter
const SKIP_DIRS = new Set(['icons', 'images']);
cpSync(src, dest, {
  recursive: true,
  filter: (s) => {
    const rel = s.replace(src, '').replace(/\\/g, '/').replace(/^\//, '');
    const top = rel.split('/')[0];
    return !SKIP_DIRS.has(top);
  },
});
console.log('[prebuilt] Website copied (icons/images excluded — served from R2)');

// Copy arpg-game build output into /arpg-game/ subpath
const gameSrc = resolve(root, 'artifacts/arpg-game/dist/public');
const gameDest = resolve(dest, 'arpg-game');
const GAME_SKIP = new Set(['models', 'icons', 'textures', 'locations', 'books', 'bestiary', 'assets', 'decoders', 'vendor', 'lore']);
if (existsSync(gameSrc)) {
  cpSync(gameSrc, gameDest, {
    recursive: true,
    filter: (s) => {
      const rel = s.replace(gameSrc, '').replace(/\\/g, '/').replace(/^\//, '');
      const top = rel.split('/')[0];
      return !GAME_SKIP.has(top);
    },
  });
  console.log('[prebuilt] Copied arpg-game build → /arpg-game/ (CDN assets excluded)');
} else {
  console.warn('[prebuilt] WARNING: arpg-game not built — run pnpm build:game first');
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
