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
// Ship JS/CSS/HTML + Draco/Basis decoders (~1.3 MB). Large art (models,
// textures, locations, …) stays on the R2 CDN. Decoders must be co-located
// with the app so GLTFLoader does not depend on third-party CDNs at boot.
const GAME_SKIP = new Set(['models', 'icons', 'textures', 'locations', 'books', 'bestiary', 'vendor', 'lore']);
if (existsSync(gameSrc)) {
  cpSync(gameSrc, gameDest, {
    recursive: true,
    filter: (s) => {
      const rel = s.replace(gameSrc, '').replace(/\\/g, '/').replace(/^\//, '');
      const top = rel.split('/')[0];
      return !GAME_SKIP.has(top);
    },
  });
  console.log('[prebuilt] Copied arpg-game build → /arpg-game/ (CDN assets excluded, decoders included)');
} else {
  console.warn('[prebuilt] WARNING: arpg-game not built — run pnpm build:game first');
}

// Always write config.json (overwrite stale versions from previous deploys)
const configPath = resolve(root, '.vercel/output/config.json');
{
  // Route order matters: static game catalogs first (always online), then
  // Railway for dynamic APIs, then SPA fallbacks. Crafting page lives at
  // /crafting.html with a clean /crafting URL.
  const config = {
    version: 3,
    routes: [
      { src: '/api/game/?$', dest: '/data/game-index.json' },
      { src: '/api/game/catalog/?$', dest: '/data/game-catalog.json' },
      { src: '/api/game/recipes/?$', dest: '/data/recipes.json' },
      { src: '/api/game/items/?$', dest: '/data/items.json' },
      { src: '/api/game/stations/?$', dest: '/data/stations.json' },
      { src: '/api/(.*)', dest: 'https://survival-api-production.up.railway.app/api/$1' },
      { src: '/crafting/?$', dest: '/crafting.html' },
      { src: '/operators/?$', dest: '/operators.html' },
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

// Emit static /api/game catalogs into website dist + .vercel/output/static
try {
  const { spawnSync } = await import('child_process');
  const gen = spawnSync(
    process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
    ['exec', 'tsx', 'scripts/gen-game-catalog.mjs'],
    { cwd: root, stdio: 'inherit', shell: true },
  );
  if (gen.status !== 0) {
    console.warn('[prebuilt] WARNING: gen-game-catalog failed — /api/game static routes may be stale');
  } else {
    console.log('[prebuilt] Game data catalogs written (recipes/items/stations)');
  }
} catch (err) {
  console.warn('[prebuilt] WARNING: could not run gen-game-catalog:', err);
}

console.log('[prebuilt] Ready for: vercel deploy --prebuilt --prod');
