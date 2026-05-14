import * as THREE from 'three';
import {
  computeBoundsTree,
  disposeBoundsTree,
  acceleratedRaycast,
} from 'three-mesh-bvh';

/**
 * Patch Three.js prototypes to use three-mesh-bvh's accelerated raycaster.
 * Call once at boot. After this:
 *   - geometry.computeBoundsTree() builds a BVH (O(n log n) once, O(log n) queries)
 *   - mesh.raycast() uses the BVH automatically when present
 *   - geometry.disposeBoundsTree() frees the BVH
 *
 * Massive perf win for camera occlusion, click-to-move, melee swings against
 * complex world geometry.
 */
let patched = false;
export function installBVH() {
  if (patched) return;
  THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
  THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
  THREE.Mesh.prototype.raycast = acceleratedRaycast;
  patched = true;
}

/**
 * Walk a scene and build BVHs on every static collider mesh found.
 * Skips skinned meshes (animated, BVH would constantly invalidate)
 * and meshes flagged with `userData.skipBVH = true`.
 */
export function buildBVHsForScene(scene: THREE.Object3D) {
  scene.traverse((obj) => {
    if (obj instanceof THREE.SkinnedMesh) return;
    if (obj instanceof THREE.Mesh && obj.geometry && !obj.userData.skipBVH) {
      const geo = obj.geometry as THREE.BufferGeometry & { boundsTree?: unknown };
      if (!geo.boundsTree) {
        geo.computeBoundsTree?.();
      }
    }
  });
}
