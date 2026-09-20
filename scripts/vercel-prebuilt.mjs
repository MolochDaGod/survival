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
      // Faction crests + banners (map/claim identity) — skip raw Imgur dumps
      if (parts[1] === 'factions') {
        if (parts.includes('raw')) return false;
        return true;
      }
      // Full perk packs + stat-tier SVGs for /perks production catalog
      if (parts[1] === 'perks') return true;
      return false;  // skip other icon subdirs (genetics etc. stay in arpg CDN/local)
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
      // Canonical host: grudges.grudge-studio.com — survival.* permanently redirects.
      {
        src: '/(.*)',
        has: [{ type: 'host', value: 'survival.grudge-studio.com' }],
        status: 301,
        headers: { Location: 'https://grudges.grudge-studio.com/$1' },
      },
      // Systems catalog — static slices (same payload as Railway /api/systems*).
      // Keep BEFORE the Railway /api proxy so definitions stay available even if API lags.
      { src: '/api/systems$', dest: '/data/grudges-systems.json' },
      { src: '/api/systems/$', dest: '/data/grudges-systems.json' },
      { src: '/api/systems/overview/?', dest: '/data/systems-overview.json' },
      { src: '/api/systems/perks/?', dest: '/data/systems-perks.json' },
      { src: '/api/systems/professions/?', dest: '/data/systems-professions.json' },
      { src: '/api/systems/crafting/?', dest: '/data/systems-crafting.json' },
      { src: '/api/systems/recipes/?', dest: '/data/systems-recipes.json' },
      { src: '/api/systems/buildables/?', dest: '/data/systems-buildables.json' },
      { src: '/api/systems/icons/?', dest: '/data/systems-icons.json' },
      { src: '/api/systems/township/?', dest: '/data/systems-township.json' },
      { src: '/api/systems/combat/?', dest: '/data/systems-combat.json' },
      { src: '/api/(.*)', dest: 'https://survival-api-production.up.railway.app/api/$1' },
      { src: '/arpg-game$', dest: '/arpg-game/index.html' },
      { src: '/arpg-game/$', dest: '/arpg-game/index.html' },
      { src: '/admin$', dest: '/admin/index.html' },
      { src: '/admin/$', dest: '/admin/index.html' },
      { src: '/mapstarter$', dest: '/mapstarter.html' },
      { src: '/mapstarter/$', dest: '/mapstarter.html' },
      { src: '/main-panel$', dest: '/main-panel.html' },
      { src: '/perks$', dest: '/perks.html' },
      { src: '/crafting$', dest: '/crafting.html' },
      { src: '/professions$', dest: '/professions.html' },
      { src: '/combat$', dest: '/combat.html' },
      { handle: 'filesystem' },
    ],
  };
  mkdirSync(dirname(configPath), { recursive: true });
  const { writeFileSync } = await import('fs');
  writeFileSync(configPath, JSON.stringify(config, null, 2));
  console.log('[prebuilt] Created config.json');
}

console.log('[prebuilt] Ready for: vercel deploy --prebuilt --prod');
