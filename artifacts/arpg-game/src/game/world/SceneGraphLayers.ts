/**
 * SceneGraphLayers — the three visual roots every outdoor Three.js scene
 * should hang under. Do not confuse with:
 *
 *   LAYERS.*           → Three.js Object3D.layers bitfield (camera/raycast)
 *   GROUP.* / GROUPS_* → Rapier collision membership/filter
 *
 * Hierarchy (best-looking, easiest to cull and light):
 *
 *   Scene
 *     ├─ WorldRoot     static terrain, buildings, nature scatter
 *     ├─ HarvestRoot   harvestables / interact props (streamed in/out)
 *     ├─ ActorRoot     player, NPCs, enemies (dynamic)
 *     └─ VfxRoot       bullets, particles, telegraphs (no shadows)
 *
 * Why three (plus VFX):
 *   1. World  — rare updates; big static shadows; GROUND-tagged terrain only
 *   2. Harvest — mid-rate stream; solid PROP colliders + harvest sensors
 *   3. Actors — every frame; own mixers; never pollute ground raycasts
 *
 * Harvest meshes sit on WORLD render layer (camera occlusion) but NEVER on
 * GROUND — otherwise GroundSampler.groundY() would land on rock tops/canopies.
 */
import * as THREE from 'three';
import { LAYERS, enableLayerRecursive } from '../Layers';

export type SceneLayerId = 'world' | 'harvest' | 'actors' | 'vfx';

export interface SceneGraphRoots {
  world: THREE.Group;
  harvest: THREE.Group;
  actors: THREE.Group;
  vfx: THREE.Group;
}

const ROOT_NAMES: Record<SceneLayerId, string> = {
  world: 'WorldRoot',
  harvest: 'HarvestRoot',
  actors: 'ActorRoot',
  vfx: 'VfxRoot',
};

let _roots: SceneGraphRoots | null = null;

/**
 * Attach (or return) the four roots under `scene`. Idempotent — safe to call
 * from SceneBuilder and ResourceSystem.
 */
export function ensureSceneGraph(scene: THREE.Scene): SceneGraphRoots {
  if (_roots && _roots.world.parent === scene) return _roots;

  const findOrCreate = (id: SceneLayerId): THREE.Group => {
    const existing = scene.getObjectByName(ROOT_NAMES[id]);
    if (existing && (existing as THREE.Group).isGroup) {
      return existing as THREE.Group;
    }
    const g = new THREE.Group();
    g.name = ROOT_NAMES[id];
    g.matrixAutoUpdate = true;
    scene.add(g);
    return g;
  };

  _roots = {
    world: findOrCreate('world'),
    harvest: findOrCreate('harvest'),
    actors: findOrCreate('actors'),
    vfx: findOrCreate('vfx'),
  };
  return _roots;
}

export function getSceneGraph(): SceneGraphRoots | null {
  return _roots;
}

/** Tag visual mesh for camera occlusion (WORLD) without spoiling ground rays. */
export function tagAsWorldProp(root: THREE.Object3D): void {
  enableLayerRecursive(root, LAYERS.WORLD);
  // Explicitly keep off GROUND
  root.traverse((o) => {
    o.layers.disable(LAYERS.GROUND);
  });
}

/** Terrain / walkable floors only — GroundSampler targets this. */
export function tagAsWalkableGround(root: THREE.Object3D): void {
  enableLayerRecursive(root, LAYERS.GROUND);
  enableLayerRecursive(root, LAYERS.WORLD);
}

/** Actors: default layer + optional ENEMIES for combat filters. */
export function tagAsActor(root: THREE.Object3D, enemy = false): void {
  root.traverse((o) => {
    o.layers.enable(LAYERS.DEFAULT);
    if (enemy) o.layers.enable(LAYERS.ENEMIES);
    o.layers.disable(LAYERS.GROUND);
  });
}

/** VFX: render-only, never blocks camera or ground. */
export function tagAsVfx(root: THREE.Object3D): void {
  root.traverse((o) => {
    o.layers.set(LAYERS.VFX);
  });
}
