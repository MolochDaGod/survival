import * as THREE from 'three';

/** Split `path/to/model.glb#NodeName` into url + optional sub-node name. */
export function parseGltfPath(path: string): { url: string; nodeName?: string } {
  const hash = path.indexOf('#');
  if (hash === -1) return { url: path };
  return { url: path.slice(0, hash), nodeName: path.slice(hash + 1) };
}

/**
 * Clone a named sub-node from a loaded GLTF scene into a standalone group
 * with its base resting on Y=0 (handy for grid placement).
 */
export function extractGltfSubnode(root: THREE.Object3D, nodeName: string): THREE.Group | null {
  const found = root.getObjectByName(nodeName);
  if (!found) return null;

  const group = new THREE.Group();
  group.name = nodeName;
  group.add(found.clone(true));

  const bbox = new THREE.Box3().setFromObject(group);
  group.position.y -= bbox.min.y;
  return group;
}

/** Uniform-scale `group` so its longest XZ side fits `target` metres. */
export function fitGroupToXZ(group: THREE.Object3D, target: number): number {
  const bbox = new THREE.Box3().setFromObject(group);
  const size = new THREE.Vector3();
  bbox.getSize(size);
  const longest = Math.max(size.x, size.z);
  const scale = longest > 0.001 ? target / longest : 1;
  group.scale.setScalar(scale);
  return scale;
}