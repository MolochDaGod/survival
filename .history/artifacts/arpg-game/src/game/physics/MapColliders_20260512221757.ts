/**
 * MapColliders — bake static trimesh colliders for a loaded map GLB.
 *
 * The map is a single big static thing (town buildings, terrain mesh,
 * roads, props baked into the GLB). The cheapest correct way to give
 * Rapier "this is the world" is one fixed rigid body per mesh, each with
 * a `trimesh` collider built from the mesh's indexed geometry.
 *
 * What we skip:
 *   - Anything tagged in `userData` as `noCollide`, `decal`, or `vfx`.
 *   - Common no-collide name patterns: water, sky, fog, cloud, particle
 *     FX, leaf/leaves/foliage, AND specifically *decorative* grass meshes
 *     (grass_blade / grass_card / grass_billboard / grass_sprite /
 *     grass_decal). Plain "grass"/"lawn"/"turf"-named meshes still
 *     collide because they're the actual ground the player walks on —
 *     skipping them was the cause of the "falling through the green
 *     grass" bug in main-town.
 *   - Meshes with zero indices (Rapier rejects them).
 *
 * Returns a disposer so the engine can rebuild colliders cleanly when
 * the player travels to a new GLB-backed location.
 */
import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import type { PhysicsWorld } from './PhysicsWorld';

const SKIP_NAME_RE = /(water|sky|fog|cloud|particle|vfx|leaf|leaves|foliage|grass[_-]?(blade|card|billboard|sprite|decal|cluster|tuft))/i;

export interface MapColliderHandle {
  /** Number of trimesh colliders attached. */
  count: number;
  /** Remove every body+collider this builder created. Safe to call once. */
  dispose: () => void;
}

export function buildMapColliders(
  physics: PhysicsWorld,
  root: THREE.Object3D,
): MapColliderHandle {
  const RAPIER = physics.RAPIER;
  const world = physics.world;
  const bodies: RAPIER.RigidBody[] = [];

  // World matrices need to be current — the GLB may have just been added
  // to the scene with non-identity parent transforms (StarterMap scales
  // the loaded root, FeaturePlacer reparents pieces, etc.).
  root.updateMatrixWorld(true);

  root.traverse((obj) => {
    if (!(obj as THREE.Mesh).isMesh) return;
    const mesh = obj as THREE.Mesh;
    const ud = (mesh.userData ?? {}) as Record<string, unknown>;
    if (ud.noCollide || ud.decal || ud.vfx) return;
    if (mesh.name && SKIP_NAME_RE.test(mesh.name)) return;

    const geom = mesh.geometry as THREE.BufferGeometry | undefined;
    if (!geom) return;
    const posAttr = geom.getAttribute('position') as THREE.BufferAttribute | undefined;
    if (!posAttr || posAttr.count === 0) return;

    // Collect transformed vertices in world space. Rapier expects a flat
    // Float32Array of [x,y,z, x,y,z, ...] and a Uint32Array of indices.
    // We bake the mesh's worldMatrix into the vertices and attach the
    // body at the origin, which is simpler than juggling per-body
    // translations/rotations for nested map hierarchies.
    const vertices = new Float32Array(posAttr.count * 3);
    const tmp = new THREE.Vector3();
    for (let i = 0; i < posAttr.count; i++) {
      tmp.fromBufferAttribute(posAttr, i).applyMatrix4(mesh.matrixWorld);
      vertices[i * 3 + 0] = tmp.x;
      vertices[i * 3 + 1] = tmp.y;
      vertices[i * 3 + 2] = tmp.z;
    }

    let indices: Uint32Array;
    const idxAttr = geom.getIndex();
    if (idxAttr) {
      // Rapier requires Uint32Array specifically — copy if the source is
      // Uint16Array (very common from GLTFLoader).
      const src = idxAttr.array as ArrayLike<number>;
      indices = new Uint32Array(src.length);
      for (let i = 0; i < src.length; i++) indices[i] = src[i];
    } else {
      // Non-indexed: synthesize a sequential index buffer (0,1,2, 3,4,5, ...).
      const triCount = Math.floor(posAttr.count / 3);
      indices = new Uint32Array(triCount * 3);
      for (let i = 0; i < indices.length; i++) indices[i] = i;
    }
    if (indices.length === 0) return;

    const bodyDesc = RAPIER.RigidBodyDesc.fixed();
    const body = world.createRigidBody(bodyDesc);
    const colliderDesc = RAPIER.ColliderDesc.trimesh(vertices, indices);
    world.createCollider(colliderDesc, body);
    bodies.push(body);
  });

  let disposed = false;
  return {
    count: bodies.length,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      for (const body of bodies) {
        try { world.removeRigidBody(body); } catch { /* already gone */ }
      }
      bodies.length = 0;
    },
  };
}
