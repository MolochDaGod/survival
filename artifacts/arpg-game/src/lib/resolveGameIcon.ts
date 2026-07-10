import { ICON_MANIFEST, type IconCategory } from '@/data/iconManifest';
import { assetUrl } from '@/lib/assetUrl';

const CDN_BASE = (import.meta.env.VITE_ASSET_CDN_URL as string | undefined)
  ?.replace(/\/+$/, '') ?? '';

/**
 * Resolve a game icon path or manifest key to a loadable URL.
 */
export function resolveGameIcon(src: string): string | null {
  if (!src) return null;
  if (/^https?:\/\//i.test(src)) return src;
  if (/^[\p{Extended_Pictographic}]/u.test(src.trim())) return null;

  const normalized = src.replace(/^\//, '');
  const segments = normalized.split('/');

  if (segments[0] === 'icons' && segments.length >= 3) {
    const category = segments[1] as IconCategory;
    const filename = segments.slice(2).join('/');
    const entry = ICON_MANIFEST[category]?.[filename];
    if (entry) return CDN_BASE ? entry.cdnUrl : entry.localPath;
  }

  if (segments.length >= 2 && segments[0] in ICON_MANIFEST) {
    const category = segments[0] as IconCategory;
    const filename = segments.slice(1).join('/');
    const entry = ICON_MANIFEST[category]?.[filename];
    if (entry) return CDN_BASE ? entry.cdnUrl : entry.localPath;
  }

  const path = src.startsWith('/') ? src : `/${src}`;
  return assetUrl(path);
}