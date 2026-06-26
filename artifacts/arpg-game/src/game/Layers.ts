import * as THREE from 'three';

/**
 * Three.js Layers are 32-bit channel masks on every Object3D. Cameras and
 * Raycasters carry their own layer mask and only "see" objects whose mask
 * intersects theirs.
 *
 * We use named layers so we can:
 *  - Restrict camera-occlusion raycasts to WORLD geometry only (huge perf win
 *    versus walking the full scene graph and skipping enemies/VFX/loot).
 *  - Hide debug-only meshes from the main camera but keep them visible for
 *    debug tooling.
 *  - Cull VFX from secondary cameras (e.g. minimap) without removing them
 *    from the scene.
 */
export const LAYERS = {
  /** Default — everything renders here unless explicitly moved. */
  DEFAULT: 0,
  /** Solid world geometry (terrain, walls, pillars, rocks). Camera-occluders. */
  WORLD: 1,
  /** Living enemies. Targetable by bullets/melee, ignored by camera occlusion. */
  ENEMIES: 2,
  /** Loot drops, pickups, sparkles. Camera ignores. */
  LOOT: 3,
  /** VFX, projectiles, particles. Render-only. */
  VFX: 4,
  /** Debug visualizers (axes, BVH wireframes, hit volumes). */
  DEBUG: 5,
  /**
   * Walkable ground only — terrain chunks + arena floor. Strict subset of
   * WORLD, used by GroundSampler so a downward raycast under a tree hits
   * the dirt, not the canopy. Props/walls/rocks are deliberately excluded
   * even though they render in WORLD for camera occlusion.
   */
  GROUND: 6,
  /**
   * Interior-only meshes (inner walls, ceilings, indoor props). The main
   * camera enables this layer when the player is inside a building so
   * indoor geometry becomes visible; it stays disabled outdoors so we can
   * see the building's exterior without the interior occluding it.
   */
  INTERIOR: 7,
} as const;

/** Tag a single object with a layer (single channel). Disables DEFAULT. */
export function setLayer(obj: THREE.Object3D, layer: number) {
  obj.layers.set(layer);
}

/**
 * Tag an object with an additional layer while keeping it on DEFAULT.
 * Use this when you want the object to stay visible to the main camera AND
 * be selectable by a raycaster filtering on the new layer.
 */
export function tagWorld(obj: THREE.Object3D) {
  obj.layers.enable(LAYERS.WORLD);
}

/** Recursively tag an object and all descendants with a layer. */
export function setLayerRecursive(root: THREE.Object3D, layer: number) {
  root.traverse((o) => o.layers.set(layer));
}

/** Add an object to an additional layer without removing existing channels. */
export function enableLayerRecursive(root: THREE.Object3D, layer: number) {
  root.traverse((o) => o.layers.enable(layer));
}

/**
 * Build a layer mask suitable for `Raycaster.layers.mask = ...`.
 * `cameraRaycastMask()` → only WORLD geometry.
 */
export function buildMask(...layers: number[]): number {
  let mask = 0;
  for (const l of layers) mask |= 1 << l;
  return mask;
}

/** Mask covering only WORLD layer — for camera occlusion. */
export const MASK_WORLD = buildMask(LAYERS.WORLD);
/** Mask covering bullets' valid hit targets. */
export const MASK_HITTABLE = buildMask(LAYERS.WORLD, LAYERS.ENEMIES);
/** Mask covering walkable ground only — for foot-anchoring raycasts. */
export const MASK_GROUND = buildMask(LAYERS.GROUND);

type RaycasterWithBVH = THREE.Raycaster & {
  firstHitOnly?: boolean;
  camera?: THREE.Camera;
};

/**
 * One-time raycaster setup for queries against WORLD-tagged meshes (walls,
 * terrain, pillars). Filters out Sprites/VFX on other layers and satisfies
 * Three.js r183's `raycaster.camera` requirement when the scene graph is
 * walked recursively. Used by ThirdPersonCamera and ClimbController.
 */
export function bindWorldRaycaster(
  raycaster: THREE.Raycaster,
  camera: THREE.Camera,
): void {
  const r = raycaster as RaycasterWithBVH;
  r.firstHitOnly = true;
  raycaster.layers.mask = MASK_WORLD;
  r.camera = camera;
}
