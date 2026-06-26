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

// Copy website, skipping large dirs (images/) but keeping icons/ selectively
const SKIP_DIRS = new Set(['images']);
cpSync(src, dest, {
  recursive: true,
  filter: (s) => {
    const rel = s.replace(src, '').replace(/\\/g, '/').replace(/^\//, '');
    const top = rel.split('/')[0];
    if (SKIP_DIRS.has(top)) return false;
    // For icons/, only include factions + the specific perk icons the HTML references
    if (top === 'icons') {
      const parts = rel.split('/');
      // Allow the directory entries themselves (needed for recursive copy)
      if (parts.length <= 1) return true;  // icons/
      if (parts[1] === 'factions') return true;  // all faction crests
      if (parts[1] === 'perks') {
        if (parts.length <= 2) return true;  // icons/perks/
        if (parts.length <= 3) return true;  // icons/perks/warrior/
        // Only allow the specific icon files referenced in HTML
        const NEEDED = new Set([
          'hero/9.png','hero/12.png','hero/21.png','hero/28.png','hero/30.png','hero/33.png',
          'maker/14.png',
          'smarts/1.png','smarts/3.png','smarts/13.png','smarts/23.png',
          'warrior/4.png','warrior/14.png','warrior/29.png','warrior/34.png',
        ]);
        const iconPath = parts.slice(2).join('/');
        return NEEDED.has(iconPath);
      }
      return false;  // skip other icon subdirs
    }
    return true;
  },
});
console.log('[prebuilt] Website copied (images excluded, icons cherry-picked)');

// Copy arpg-game build output into /arpg-game/ subpath
const gameSrc = resolve(root, 'artifacts/arpg-game/dist/public');
const gameDest = resolve(dest, 'arpg-game');
const GAME_SKIP = new Set(['models', 'icons', 'textures', 'locations', 'books', 'bestiary', 'decoders', 'vendor', 'lore']);
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

// Always write config.json (overwrite stale versions from previous deploys)
const configPath = resolve(root, '.vercel/output/config.json');
{
  const config = {
    version: 3,
    routes: [
{ src: '/api/(.*)', dest: 'https://survival-api-production.up.railway.app/api/$1' },
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
