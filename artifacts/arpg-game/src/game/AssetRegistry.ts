/**
 * AssetRegistry — UUID-keyed asset catalog + cache-aware loader.
 *
 * Every asset in the game has a stable UUID v5 derived from its path.
 * The registry provides:
 *   1. Lookup by UUID, name, path, or category
 *   2. Load-by-UUID (returns cached result on repeat calls)
 *   3. Batch pre-warming of an entire category
 *   4. Object-storage URL override — if a CDN/GCS URL is registered for
 *      a UUID it is used instead of the local /public path.
 *
 * Adding a new asset:
 *   1. Add the file to public/
 *   2. Re-run `pnpm run gen:asset-manifest`  (regenerates asset-manifest.json)
 *   3. The UUID is deterministic — already-stored references stay valid.
 *
 * This file is auto-generated ONCE then hand-maintained for URL overrides.
 */

import * as THREE from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { createGLTFLoader } from '@/game/loaders/createGLTFLoader';
import MANIFEST from './asset-manifest.json';

// ─── Types ────────────────────────────────────────────────────────────────────

export type AssetType =
  | 'model_gltf'
  | 'model_fbx'
  | 'texture_png'
  | 'texture_jpg'
  | 'bin'
  | 'unknown';

export interface AssetEntry {
  id:       string;
  name:     string;
  path:     string;
  type:     AssetType;
  category: string;
  /** Optional CDN / object-storage URL override */
  remoteUrl?: string;
}

export type AssetLoadResult = GLTF | THREE.Texture | null;

// ─── Indexes built at startup ─────────────────────────────────────────────────

const _byId   = new Map<string, AssetEntry>();
const _byPath = new Map<string, AssetEntry>();
const _byName = new Map<string, AssetEntry[]>();
const _byCat  = new Map<string, AssetEntry[]>();

for (const entry of Object.values(MANIFEST) as AssetEntry[]) {
  _byId.set(entry.id, entry);
  _byPath.set(entry.path, entry);

  let names = _byName.get(entry.name);
  if (!names) { names = []; _byName.set(entry.name, names); }
  names.push(entry);

  let cat = _byCat.get(entry.category);
  if (!cat) { cat = []; _byCat.set(entry.category, cat); }
  cat.push(entry);
}

// ─── Loaders ──────────────────────────────────────────────────────────────────

const _gltfLoader    = createGLTFLoader();
const _textureLoader = new THREE.TextureLoader();

// Promise cache — keyed by UUID so duplicate loads are deduplicated
const _cache = new Map<string, Promise<AssetLoadResult>>();

// ─── AssetRegistry ────────────────────────────────────────────────────────────

export const AssetRegistry = {

  // ── Lookup ─────────────────────────────────────────────────────────────────

  /** Look up an entry by its stable UUID */
  get(id: string): AssetEntry | undefined {
    return _byId.get(id);
  },

  /** Look up by public path, e.g. '/models/props/quaternius/Anvil.gltf' */
  getByPath(path: string): AssetEntry | undefined {
    return _byPath.get(path);
  },

  /**
   * Find entries by human-readable name.
   * Returns all matching entries (same name can exist in different categories).
   */
  findByName(name: string): AssetEntry[] {
    return _byName.get(name) ?? [];
  },

  /** Return all entries in a category folder, e.g. 'models/props/quaternius' */
  getCategory(cat: string): AssetEntry[] {
    return _byCat.get(cat) ?? [];
  },

  /** Return all categories in the registry */
  categories(): string[] {
    return [..._byCat.keys()];
  },

  /** Total number of registered assets */
  get size(): number { return _byId.size; },

  // ── Loading ────────────────────────────────────────────────────────────────

  /**
   * Load an asset by UUID.  Returns a cached Promise on repeat calls.
   * Automatically selects the loader based on asset type.
   * Falls back to remoteUrl if set (object storage CDN).
   */
  load(id: string): Promise<AssetLoadResult> {
    const cached = _cache.get(id);
    if (cached) return cached;

    const entry = _byId.get(id);
    if (!entry) {
      const p = Promise.resolve(null);
      _cache.set(id, p);
      return p;
    }

    const url = entry.remoteUrl ?? entry.path;
    let p: Promise<AssetLoadResult>;

    if (entry.type === 'model_gltf' || entry.type === 'model_fbx') {
      p = new Promise<AssetLoadResult>((resolve, reject) => {
        _gltfLoader.load(url, resolve, undefined, reject);
      });
    } else if (entry.type === 'texture_png' || entry.type === 'texture_jpg') {
      p = new Promise<AssetLoadResult>((resolve, reject) => {
        _textureLoader.load(url, resolve, undefined, reject);
      });
    } else {
      p = Promise.resolve(null);
    }

    _cache.set(id, p);
    return p;
  },

  /**
   * Load an asset by public path (convenience — resolves UUID internally).
   */
  loadByPath(path: string): Promise<AssetLoadResult> {
    const entry = _byPath.get(path);
    if (!entry) return Promise.resolve(null);
    return AssetRegistry.load(entry.id);
  },

  /**
   * Pre-warm an entire category into the cache.
   * Call with 'models/props/quaternius' before entering a biome to avoid
   * mid-gameplay hitches.
   */
  async prewarm(category: string): Promise<void> {
    const entries = _byCat.get(category) ?? [];
    await Promise.all(entries.map(e => AssetRegistry.load(e.id)));
  },

  /**
   * Prewarm multiple categories in parallel.
   */
  async prewarmAll(categories: string[]): Promise<void> {
    await Promise.all(categories.map(c => AssetRegistry.prewarm(c)));
  },

  // ── Remote URL management ─────────────────────────────────────────────────

  /**
   * Override the local path with a CDN / object-storage URL for a given UUID.
   * Call this at app startup after fetching a signed-URL mapping from the server.
   * Once set, any subsequent `load(id)` call uses the remote URL.
   * Clears the cache entry so the next `load()` re-fetches from the new URL.
   */
  setRemoteUrl(id: string, url: string): void {
    const entry = _byId.get(id);
    if (!entry) return;
    entry.remoteUrl = url;
    _cache.delete(id); // invalidate so next load uses new URL
  },

  /**
   * Bulk-register a remote URL map (UUID → URL).
   * Use after a `/api/storage/asset-urls` response from the API server.
   */
  applyRemoteUrlMap(map: Record<string, string>): void {
    for (const [id, url] of Object.entries(map)) {
      AssetRegistry.setRemoteUrl(id, url);
    }
  },

  // ── Cache control ──────────────────────────────────────────────────────────

  /** Evict a single asset from the cache (will be re-loaded on next access) */
  evict(id: string): void { _cache.delete(id); },

  /** Clear the entire load cache */
  clearCache(): void { _cache.clear(); },

  /** Number of currently cached (loaded or loading) assets */
  get cacheSize(): number { return _cache.size; },

};

// ─── Re-export manifest type for use in tooling / server code ─────────────────
export type { AssetEntry as ManifestEntry };
export { MANIFEST as ASSET_MANIFEST };
