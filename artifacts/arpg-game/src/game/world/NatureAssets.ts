/**
 * NatureAssets — shared load path for original-game terrain textures,
 * nature props, harvestable meshes, colony buildings, and vehicles.
 *
 * Sources (grim-armada-web / original ground game):
 *   /textures/terrain/{grass,sand,stone,snow,sky}.jpg
 *   /models/terrain/{tree1,bush,rock1,rock2,barrel,cliff*}.glb
 *   /models/colony/*  (space-colony buildings + T_Spase.png)
 *   /models/ships/*   (fleet vehicles)
 *   /models/prefabs/* (hemp, ore crystals, scrap, etc.)
 *
 * Rules (deploy-animated-character / game-asset-import):
 *   - Template cache only — never mount the shared root
 *   - Static props: Object3D.clone is fine; skinned → SkeletonUtils
 *   - Materials: preserve embedded maps; ensure sRGB on color maps
 *   - Plant feet: y -= box.min.y after scale
 */
import * as THREE from 'three';
import { createGLTFLoader } from '../loaders/createGLTFLoader';
import { assetUrl } from '../../lib/assetUrl';
import { LAYERS } from '../Layers';

// ── Texture paths (tileable splat set from original game) ────────────────────

export const TERRAIN_TEX = {
  grass: '/textures/terrain/grass.jpg',
  sand:  '/textures/terrain/sand.jpg',
  stone: '/textures/terrain/stone.jpg',
  snow:  '/textures/terrain/snow.jpg',
  sky:   '/textures/terrain/sky.jpg',
} as const;

// ── Nature prop catalog ──────────────────────────────────────────────────────

export type NatureKind =
  | 'tree'
  | 'bush'
  | 'rock'
  | 'ore'
  | 'herb'
  | 'log'
  | 'scrap'
  | 'crate'
  | 'hemp'
  | 'crystal';

export interface NatureMeshDef {
  kind: NatureKind;
  /** Root-relative GLB path */
  url: string;
  /** Uniform scale when raw bbox is unknown */
  scale: number;
  /** Multiplicative tint (white = keep author colors) */
  tint?: number;
  /** Target height in metres (overrides scale when > 0) */
  targetHeight?: number;
}

/** Primary nature meshes shipped from the original ground game. */
export const NATURE_MESHES: Record<string, NatureMeshDef> = {
  tree:    { kind: 'tree',    url: '/models/terrain/tree1.glb',  scale: 1, targetHeight: 6.0, tint: 0xffffff },
  bush:    { kind: 'bush',    url: '/models/terrain/bush.glb',   scale: 1, targetHeight: 1.1, tint: 0x88cc66 },
  rock:    { kind: 'rock',    url: '/models/terrain/rock1.glb',  scale: 1, targetHeight: 1.4, tint: 0xffffff },
  rock2:   { kind: 'rock',    url: '/models/terrain/rock2.glb',  scale: 1, targetHeight: 1.2, tint: 0xffffff },
  ore:     { kind: 'ore',     url: '/models/terrain/rock2.glb',  scale: 1, targetHeight: 1.3, tint: 0x8899cc },
  herb:    { kind: 'herb',    url: '/models/terrain/bush.glb',   scale: 1, targetHeight: 0.7, tint: 0x44cc44 },
  crate:   { kind: 'crate',   url: '/models/terrain/barrel.glb', scale: 1, targetHeight: 1.0, tint: 0xcc8844 },
  hemp:    { kind: 'hemp',    url: '/models/prefabs/hemp.glb',   scale: 1, targetHeight: 1.2, tint: 0x66aa44 },
  crystal: { kind: 'crystal', url: '/models/prefabs/ore_and_crystals.glb', scale: 1, targetHeight: 1.5, tint: 0xaaccff },
  scrap:   { kind: 'scrap',   url: '/models/prefabs/pile_of_scrap_metal_tools_rubbish_garbage.glb', scale: 1, targetHeight: 1.4, tint: 0xffffff },
  log:     { kind: 'log',     url: '/models/terrain/tree1.glb',  scale: 1, targetHeight: 1.2, tint: 0x5c3a1a },
};

/** Map ResourceSystem def ids → nature mesh keys. */
export const RESOURCE_MESH_MAP: Record<string, string> = {
  timber_log:      'log',
  iron_ore:        'ore',
  permafrost_ore:  'rock2',
  copper_deposit:  'rock',
  wild_herbs:      'herb',
  frozen_pond:     'rock2', // flat rock stand-in + blue tint at runtime
  flint_outcrop:   'rock',
};

// ── Template cache ───────────────────────────────────────────────────────────

const _gltf = createGLTFLoader();
const _texLoader = new THREE.TextureLoader();
const _meshCache = new Map<string, THREE.Group>();
const _meshPending = new Map<string, Promise<THREE.Group>>();
const _texCache = new Map<string, THREE.Texture>();
const _texPending = new Map<string, Promise<THREE.Texture>>();

function applyGraphicalMapping(root: THREE.Object3D, tint?: number): void {
  const tintColor = tint != null && tint !== 0xffffff ? new THREE.Color(tint) : null;
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.layers.enable(LAYERS.WORLD);
    mesh.frustumCulled = true;

    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const raw of mats) {
      if (!raw) continue;
      const mat = raw as THREE.MeshStandardMaterial;
      // Upgrade Phong → Standard if needed
      if ((raw as THREE.MeshPhongMaterial).isMeshPhongMaterial) {
        const old = raw as THREE.MeshPhongMaterial;
        mesh.material = new THREE.MeshStandardMaterial({
          map: old.map,
          color: old.color?.clone?.() ?? new THREE.Color(0xcccccc),
          roughness: 0.85,
          metalness: 0.05,
          transparent: old.transparent,
          opacity: old.opacity,
          side: old.side,
        });
        continue;
      }
      if (mat.map) {
        mat.map.colorSpace = THREE.SRGBColorSpace;
        mat.map.anisotropy = Math.min(8, mat.map.anisotropy || 4);
      }
      if (mat.emissiveMap) mat.emissiveMap.colorSpace = THREE.SRGBColorSpace;
      // Data maps stay linear
      if (mat.normalMap) mat.normalMap.colorSpace = THREE.NoColorSpace;
      if (mat.roughnessMap) mat.roughnessMap.colorSpace = THREE.NoColorSpace;
      if (mat.metalnessMap) mat.metalnessMap.colorSpace = THREE.NoColorSpace;
      if (mat.aoMap) mat.aoMap.colorSpace = THREE.NoColorSpace;
      // Fix invisible / zero opacity
      if (mat.opacity < 0.05) mat.opacity = 1;
      if (mat.transparent && mat.opacity >= 0.99) mat.transparent = false;
      mat.roughness = Math.max(0.35, mat.roughness ?? 0.85);
      mat.metalness = Math.min(0.35, mat.metalness ?? 0.05);
      if (tintColor && mat.color) mat.color.multiply(tintColor);
      mat.needsUpdate = true;
    }
  });
}

function fitAndPlant(root: THREE.Object3D, targetHeight?: number): void {
  root.scale.set(1, 1, 1);
  root.position.set(0, 0, 0);
  root.updateMatrixWorld(true);
  let box = new THREE.Box3().setFromObject(root);
  let size = box.getSize(new THREE.Vector3());
  if (size.y > 20) {
    root.scale.setScalar(0.01);
    root.updateMatrixWorld(true);
    box = new THREE.Box3().setFromObject(root);
    size = box.getSize(new THREE.Vector3());
  }
  if (targetHeight && size.y > 0.05) {
    root.scale.multiplyScalar(targetHeight / size.y);
    root.updateMatrixWorld(true);
    box = new THREE.Box3().setFromObject(root);
  }
  const center = box.getCenter(new THREE.Vector3());
  root.position.set(-center.x, -box.min.y, -center.z);
}

export function loadTerrainTexture(key: keyof typeof TERRAIN_TEX): Promise<THREE.Texture> {
  const path = TERRAIN_TEX[key];
  if (_texCache.has(path)) return Promise.resolve(_texCache.get(path)!);
  if (_texPending.has(path)) return _texPending.get(path)!;

  const p = new Promise<THREE.Texture>((resolve) => {
    _texLoader.load(
      assetUrl(path),
      (tex) => {
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 8;
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        _texCache.set(path, tex);
        _texPending.delete(path);
        resolve(tex);
      },
      undefined,
      () => {
        // 1×1 fallback so shaders never hang
        const data = new THREE.DataTexture(new Uint8Array([120, 140, 80, 255]), 1, 1);
        data.needsUpdate = true;
        data.colorSpace = THREE.SRGBColorSpace;
        _texCache.set(path, data);
        _texPending.delete(path);
        resolve(data);
      },
    );
  });
  _texPending.set(path, p);
  return p;
}

export async function loadAllTerrainTextures(): Promise<{
  grass: THREE.Texture;
  sand: THREE.Texture;
  stone: THREE.Texture;
  snow: THREE.Texture;
}> {
  const [grass, sand, stone, snow] = await Promise.all([
    loadTerrainTexture('grass'),
    loadTerrainTexture('sand'),
    loadTerrainTexture('stone'),
    loadTerrainTexture('snow'),
  ]);
  return { grass, sand, stone, snow };
}

function loadMeshTemplate(def: NatureMeshDef): Promise<THREE.Group> {
  const key = def.url;
  if (_meshCache.has(key)) return Promise.resolve(_meshCache.get(key)!);
  if (_meshPending.has(key)) return _meshPending.get(key)!;

  const p = new Promise<THREE.Group>((resolve, reject) => {
    _gltf.load(
      assetUrl(def.url),
      (gltf) => {
        const root = gltf.scene as THREE.Group;
        applyGraphicalMapping(root, def.tint);
        fitAndPlant(root, def.targetHeight);
        if (def.scale !== 1 && !def.targetHeight) {
          root.scale.multiplyScalar(def.scale);
          fitAndPlant(root, undefined);
        }
        _meshCache.set(key, root);
        _meshPending.delete(key);
        resolve(root);
      },
      undefined,
      (err) => {
        _meshPending.delete(key);
        reject(err);
      },
    );
  });
  _meshPending.set(key, p);
  return p;
}

/**
 * Clone a nature mesh instance for the scene. Returns null if the asset
 * failed to load (caller should use procedural fallback).
 */
export async function cloneNatureMesh(key: string): Promise<THREE.Group | null> {
  const def = NATURE_MESHES[key];
  if (!def) return null;
  try {
    const template = await loadMeshTemplate(def);
    // Static nature props — Object3D.clone is OK (not skinned characters).
    const inst = template.clone(true) as THREE.Group;
    applyGraphicalMapping(inst, def.tint);
    return inst;
  } catch (err) {
    console.warn(`[NatureAssets] failed ${def.url}`, err);
    return null;
  }
}

/** Prefetch common nature meshes + splat textures at boot. */
export async function prefetchNatureAssets(): Promise<void> {
  await Promise.allSettled([
    loadAllTerrainTextures(),
    ...Object.keys(NATURE_MESHES).map((k) =>
      loadMeshTemplate(NATURE_MESHES[k]).catch(() => null),
    ),
  ]);
}
