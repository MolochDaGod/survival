/**
 * Bullets — convenience layer over `VFXLibrary.BULLET_AMMO_SET` that picks a
 * specific sub-mesh out of the multi-mesh ammo GLB and returns a clone-ready
 * template suitable for `ProjectileSystem.spawn({ meshTemplate })`.
 *
 * The GLB is a SET (free-ammo-set-ultra) with multiple ammo variants as
 * named children (e.g. `Rifle_Bullet`, `9mm`, `Shotgun_Shell`, etc.).
 * We:
 *   1) Load + cache the parsed scene once (VFXLibrary handles this).
 *   2) Walk children to find a Mesh whose name matches (case-insensitive
 *      substring) the requested variant.
 *   3) Fall back to the first Mesh in the set when no name matches.
 *   4) Return a fresh Object3D clone the projectile system can re-clone per
 *      shot (cheap; the underlying geometry/material is shared).
 *
 * This keeps the per-active assignment problem deferred — the user gives
 * us a name later (e.g. "9mm") and we hand back a template without the
 * registry needing to know which actives use which ammo.
 *
 * Default ballistics (used when caller doesn't override):
 *
 *   speed     = 60 m/s     (rifle-class baseline)
 *   lifetime  = 1.2 s
 *   tracer    = false      (set true for SMG/MG feel)
 *   trajectory= 'linear'
 *
 * Usage:
 *
 *   const tmpl = await getBulletTemplate('9mm');
 *   sys.spawn({ ...DEFAULT_BULLET_OPTS, meshTemplate: tmpl, origin, direction, ...});
 */

import * as THREE from 'three';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { VFXLibrary, VFX } from '../vfx/VFXLibrary';
import type { Trajectory } from './ProjectileSystem';

/** Default ballistics for a generic bullet — override per-weapon as needed. */
export const DEFAULT_BULLET_OPTS = {
  speed:      60,
  lifetime:   1.2,
  trajectory: 'linear' as Trajectory,
  tracer:     false,
  damage:     10,
};

/**
 * Per-name template cache. The 70MB ammo set is parsed once by `VFXLibrary`
 * and cloned per-call; we cache the *selected* sub-mesh template here so we
 * don't walk + re-clone the whole set every time the same variant is asked
 * for. ProjectileSystem.spawn() then clones this template per shot.
 */
const _bulletCache = new Map<string, Promise<THREE.Object3D>>();

/**
 * Resolve a bullet template (Object3D) from the ammo set. Cached by name.
 *
 * @param name  Optional sub-mesh name match (case-insensitive substring).
 *              When omitted, returns the first Mesh in the set.
 *
 * Returns a stable template — DO NOT mutate. Pass to
 * `ProjectileSystem.spawn({ meshTemplate })` which will clone it per shot.
 */
export function getBulletTemplate(name?: string): Promise<THREE.Object3D> {
  const cacheKey = name?.toLowerCase().trim() ?? '__default__';
  let cached = _bulletCache.get(cacheKey);
  if (cached) return cached;

  cached = (async () => {
    // VFXLibrary.load returns a clone of the parsed root; we only need to
    // walk it once (per cacheKey) to extract our sub-mesh template.
    const root = await VFXLibrary.load(VFX.BULLET_AMMO_SET);
    const target = name?.toLowerCase().trim();

    let firstMesh: THREE.Mesh | null = null;
    let matched: THREE.Object3D | null = null;
    root.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        if (!firstMesh) firstMesh = child as THREE.Mesh;
        if (target && child.name.toLowerCase().includes(target) && !matched) {
          matched = child;
        }
      }
    });

    const picked = (matched ?? firstMesh) as THREE.Object3D | null;
    if (!picked) {
      console.warn('[Bullets] ammo set had no Mesh children; returning root group');
      return root;
    }

    // Re-clone so the picked sub-mesh isn't bound to the parent set's transform.
    const tmpl = skeletonClone(picked);
    tmpl.position.set(0, 0, 0);
    tmpl.rotation.set(0, 0, 0);
    return tmpl;
  })();

  _bulletCache.set(cacheKey, cached);
  return cached;
}

/** Clear the bullet template cache (e.g. on full game restart). */
export function clearBulletCache(): void {
  _bulletCache.clear();
}

/**
 * List all ammo variant names available in the set.
 * Useful for dev tooling / pickers; loads the set if not already cached.
 */
export async function listBulletNames(): Promise<string[]> {
  const root = await VFXLibrary.load(VFX.BULLET_AMMO_SET);
  const names: string[] = [];
  root.traverse((child) => {
    if ((child as THREE.Mesh).isMesh && child.name) names.push(child.name);
  });
  return names;
}
