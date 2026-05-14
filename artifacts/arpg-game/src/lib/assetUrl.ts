/**
 * Asset URL resolver — routes asset paths through the R2 CDN in production
 * and keeps them local for dev.
 *
 * Usage:
 *   import { assetUrl } from '@/lib/assetUrl';
 *   loader.load(assetUrl('/models/characters/male/adventurer.gltf'), ...);
 *
 * Set `VITE_ASSET_CDN_URL` in your .env to the R2 custom domain, e.g.:
 *   VITE_ASSET_CDN_URL=https://assets.grudge-studio.com/grudge-nexus
 *
 * When unset (local dev), paths resolve relative to Vite's dev server as
 * before (e.g. `/models/foo.glb` → `http://localhost:5171/models/foo.glb`).
 */

const CDN_BASE = (import.meta.env.VITE_ASSET_CDN_URL as string | undefined)
  ?.replace(/\/+$/, '') ?? '';

/**
 * Resolve an asset path.
 *
 * @param path Root-relative path starting with `/`, e.g. `/models/foo.glb`
 * @returns    Full URL when CDN is configured, otherwise the path as-is.
 */
export function assetUrl(path: string): string {
  if (!CDN_BASE) return path;
  // Strip leading slash so we don't get `https://cdn.com//models/...`
  const clean = path.startsWith('/') ? path.slice(1) : path;
  return `${CDN_BASE}/${clean}`;
}
