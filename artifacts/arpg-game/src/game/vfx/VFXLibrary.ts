/**
 * VFXLibrary — manifest + lazy loader for VFX/bullet GLBs hosted in the
 * Replit App Storage public bucket.
 *
 * URL pattern (served by api-server `/api/assets/public/<key>`):
 *
 *   ${BASE_URL}api/assets/public/vfx/<name>.glb
 *   ${BASE_URL}api/assets/public/bullets/<name>.glb
 *
 * Usage:
 *
 *   import { VFXLibrary, VFX } from './vfx/VFXLibrary';
 *   const trail = await VFXLibrary.load(VFX.TRAIL);
 *   scene.add(trail);
 *
 * Caching:
 *   • The first call for a given id parses the GLTF and caches the root scene.
 *   • Subsequent calls return a SkeletonUtils.clone() of the cached scene
 *     (cheap; preserves SkinnedMesh bones if the asset has any).
 *   • The promise itself is cached so concurrent callers share the fetch.
 *
 * Adding a new VFX:
 *   1) Upload the GLB to the bucket under `public/vfx/<name>.glb`
 *      (use `pnpm --filter @workspace/scripts exec tsx
 *       /home/runner/workspace/artifacts/api-server/src/scripts/upload-vfx.ts`
 *       after dropping the file in /tmp/vfx-stage/).
 *   2) Add a logical id below in `VFX` and an entry in `MANIFEST`.
 *
 * NOTE: per-active assignments (which VFX a perk uses) live elsewhere; this
 * file is purely the catalog + loader.
 */

import * as THREE from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { createGLTFLoader } from '@/game/loaders/createGLTFLoader';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';

// ─── Logical ids ──────────────────────────────────────────────────────────────

/**
 * Stable string ids for every VFX/bullet asset hosted in App Storage.
 * Add new ids here in lock-step with `MANIFEST` below.
 */
export const VFX = {
  // explosions
  EXPLOSION_LARGE:        'EXPLOSION_LARGE',         // floor-smashed-exploded
  EXPLOSION_METEOR:       'EXPLOSION_METEOR',
  EXPLOSION_SPHERE:       'EXPLOSION_SPHERE',
  EXPLOSION_STYLIZED:     'EXPLOSION_STYLIZED',      // 120MB — heavy, prefer pre-warm
  EXPLOSIONS_MULTI:       'EXPLOSIONS_MULTI',
  EXPLOSION_SKELETON:     'EXPLOSION_SKELETON',      // animated skeleton burst
  // fire
  FIRE_ANIMATION:         'FIRE_ANIMATION',
  FIRE_STYLIZED:          'FIRE_STYLIZED',
  FIRE_HURRICANE:         'FIRE_HURRICANE',
  // ice / freeze
  FREEZE:                 'FREEZE',
  // lightning / energy
  CHAIN_LIGHTNING:        'CHAIN_LIGHTNING',
  // utility / spell rings
  MAGIC_RING_YELLOW:      'MAGIC_RING_YELLOW',
  WARNING_TELEGRAPH:      'WARNING_TELEGRAPH',       // local/area warning ring
  APERTURE_OUT:           'APERTURE_OUT',            // tech-style portal/aperture
  // projectile decoration
  TRAIL:                  'TRAIL',                   // generic trail/streak
  // ammo (bullets)
  BULLET_AMMO_SET:        'BULLET_AMMO_SET',         // free-ammo-set-ultra (multi-mesh)
} as const;

export type VFXId = typeof VFX[keyof typeof VFX];

/** Loose category buckets the engine can pre-warm together. */
export type VFXCategory = 'explosion' | 'fire' | 'ice' | 'lightning' | 'ring' | 'trail' | 'bullet';

export interface VFXEntry {
  /** Object key under the public bucket (after `public/`). */
  key:             string;
  /** Loose category for batch pre-warming. */
  category:        VFXCategory;
  /** Suggested uniform scale on first use; callers may override. */
  defaultScale:    number;
  /** Suggested visible lifetime in seconds (for non-looping bursts). */
  defaultLifetime: number;
  /** True if the asset is large (>50MB) — caller should pre-warm in a loading screen. */
  heavy?:          boolean;
  /** Free-form notes about the asset's intended use. */
  notes?:          string;
}

// ─── Manifest ─────────────────────────────────────────────────────────────────

export const MANIFEST: Record<VFXId, VFXEntry> = {
  [VFX.EXPLOSION_LARGE]:    { key: 'vfx/floor-smashed-exploded.glb', category: 'explosion', defaultScale: 1.0, defaultLifetime: 2.4 },
  [VFX.EXPLOSION_METEOR]:   { key: 'vfx/meteor-explosion.glb',       category: 'explosion', defaultScale: 1.0, defaultLifetime: 2.0 },
  [VFX.EXPLOSION_SPHERE]:   { key: 'vfx/sphere-explosion.glb',       category: 'explosion', defaultScale: 1.0, defaultLifetime: 1.6 },
  [VFX.EXPLOSION_STYLIZED]: { key: 'vfx/stylized-explosion.glb',     category: 'explosion', defaultScale: 1.0, defaultLifetime: 2.4, heavy: true, notes: '120MB; use sparingly / cinematic' },
  [VFX.EXPLOSIONS_MULTI]:   { key: 'vfx/explosions.glb',             category: 'explosion', defaultScale: 1.0, defaultLifetime: 2.0, notes: 'multi-burst pack' },
  [VFX.EXPLOSION_SKELETON]: { key: 'vfx/explode-skeleton-animated.glb', category: 'explosion', defaultScale: 1.0, defaultLifetime: 2.0, notes: 'skeleton-rigged dismemberment' },

  [VFX.FIRE_ANIMATION]:     { key: 'vfx/fire-animation.glb',         category: 'fire',      defaultScale: 1.0, defaultLifetime: 1.2 },
  [VFX.FIRE_STYLIZED]:      { key: 'vfx/stylized-fire.glb',          category: 'fire',      defaultScale: 1.0, defaultLifetime: 1.5 },
  [VFX.FIRE_HURRICANE]:     { key: 'vfx/anime-fire-hurricane.glb',   category: 'fire',      defaultScale: 1.0, defaultLifetime: 2.0 },

  [VFX.FREEZE]:             { key: 'vfx/freeze.glb',                 category: 'ice',       defaultScale: 1.0, defaultLifetime: 1.6 },

  [VFX.CHAIN_LIGHTNING]:    { key: 'vfx/chain-lightning.glb',        category: 'lightning', defaultScale: 1.0, defaultLifetime: 0.8 },

  [VFX.MAGIC_RING_YELLOW]:  { key: 'vfx/magic-ring-yellow.glb',      category: 'ring',      defaultScale: 1.0, defaultLifetime: 1.5 },
  [VFX.WARNING_TELEGRAPH]:  { key: 'vfx/warning-telegraph.glb',      category: 'ring',      defaultScale: 1.0, defaultLifetime: 0.9, notes: 'AOE telegraph before strike' },
  [VFX.APERTURE_OUT]:       { key: 'vfx/aperture-out.glb',           category: 'ring',      defaultScale: 1.0, defaultLifetime: 1.4 },

  [VFX.TRAIL]:              { key: 'vfx/trail.glb',                  category: 'trail',     defaultScale: 1.0, defaultLifetime: 0.6, notes: 'attach as projectile child' },

  [VFX.BULLET_AMMO_SET]:    { key: 'bullets/free-ammo-set-ultra.glb',category: 'bullet',    defaultScale: 1.0, defaultLifetime: 1.2, heavy: true, notes: 'multi-mesh ammo set; pick child by name' },
};

// ─── Loader ───────────────────────────────────────────────────────────────────

/** Returns the absolute URL for a VFX id (BASE_URL-aware so subpath deploys work). */
export function vfxUrl(id: VFXId): string {
  const entry = MANIFEST[id];
  if (!entry) throw new Error(`[VFXLibrary] unknown id: ${id}`);
  // Vite injects BASE_URL with a trailing slash; works for both `/` root and subpath.
  const base = import.meta.env.BASE_URL ?? '/';
  const baseTrim = base.endsWith('/') ? base : `${base}/`;
  return `${baseTrim}api/assets/public/${entry.key}`;
}

const _gltfLoader = createGLTFLoader();
const _sceneCache = new Map<VFXId, Promise<THREE.Group>>();

/**
 * Load a VFX by id. Returns a fresh `Group` clone each call so callers may
 * position/scale/dispose independently. The underlying GLTF is parsed once.
 *
 * The returned Group includes any animations from the source GLB on
 * `userData.animations` (THREE.AnimationClip[]) so callers can drive an
 * AnimationMixer if they want playback.
 */
export const VFXLibrary = {
  manifest: MANIFEST,

  /** Resolve to a Group clone; safe to add to the scene immediately. */
  async load(id: VFXId): Promise<THREE.Group> {
    let cached = _sceneCache.get(id);
    if (!cached) {
      const url = vfxUrl(id);
      cached = new Promise<THREE.Group>((resolve, reject) => {
        _gltfLoader.load(
          url,
          (gltf: GLTF) => {
            const root = gltf.scene;
            // attach animations as userData so clones inherit access
            (root.userData as Record<string, unknown>).animations = gltf.animations ?? [];
            resolve(root);
          },
          undefined,
          (err) => reject(err),
        );
      });
      _sceneCache.set(id, cached);
    }
    const cachedRoot = await cached;
    const cloned = skeletonClone(cachedRoot) as THREE.Group;
    // copy over animations reference for the clone
    (cloned.userData as Record<string, unknown>).animations =
      (cachedRoot.userData as Record<string, unknown>).animations ?? [];
    // apply default scale unless caller already overrode
    const scale = MANIFEST[id].defaultScale;
    cloned.scale.setScalar(scale);
    return cloned;
  },

  /** Prewarm a list of VFX ids (parallel). */
  async prewarm(ids: VFXId[]): Promise<void> {
    await Promise.all(ids.map((id) => this.load(id).catch((err) => {
      // Swallow per-asset errors so one missing file doesn't break the boot.
      console.warn(`[VFXLibrary] prewarm failed for ${id}:`, err);
    })));
  },

  /** Prewarm an entire category. */
  async prewarmCategory(category: VFXCategory): Promise<void> {
    const ids = (Object.keys(MANIFEST) as VFXId[]).filter(
      (id) => MANIFEST[id].category === category,
    );
    await this.prewarm(ids);
  },

  /** Clear cached parsed scenes (e.g. on full game restart). */
  dispose(): void {
    _sceneCache.clear();
  },
};

export default VFXLibrary;
