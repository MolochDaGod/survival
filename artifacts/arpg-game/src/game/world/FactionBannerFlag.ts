/**
 * FactionBannerFlag — pole + transparent faction banner cloth for camps / towns.
 *
 * Identifies settlement ownership in-world (who owns this camp / city).
 * Textures from `data/factions.ts` bannerPath (bg-removed Imgur banners).
 */
import * as THREE from 'three';
import { FACTIONS, type FactionId } from '../../data/factions';
import { assetUrl } from '../../lib/assetUrl';
import { LAYERS } from '../Layers';
import { worldHeight } from './WorldGen';

const _texLoader = new THREE.TextureLoader();
const _texCache = new Map<string, THREE.Texture>();
const _matCache = new Map<string, THREE.MeshStandardMaterial>();

function loadBannerTexture(path: string): THREE.Texture {
  let t = _texCache.get(path);
  if (t) return t;
  t = _texLoader.load(assetUrl(path));
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.needsUpdate = true;
  _texCache.set(path, t);
  return t;
}

function bannerMaterial(factionId: FactionId): THREE.MeshStandardMaterial {
  let m = _matCache.get(factionId);
  if (m) return m;
  const def = FACTIONS[factionId];
  const map = loadBannerTexture(def.bannerPath);
  m = new THREE.MeshStandardMaterial({
    map,
    transparent: true,
    alphaTest: 0.12,
    side: THREE.DoubleSide,
    roughness: 0.9,
    metalness: 0.02,
    depthWrite: true,
  });
  _matCache.set(factionId, m);
  return m;
}

const POLE_MAT = new THREE.MeshStandardMaterial({
  color: 0x4a3420,
  roughness: 0.95,
  metalness: 0.02,
});
const CAP_MAT = new THREE.MeshStandardMaterial({
  color: 0x8a7040,
  roughness: 0.55,
  metalness: 0.35,
});

export interface FactionBannerOpts {
  /** Pole height metres (default 3 — claim-flag scale from info.html). */
  poleHeight?: number;
  /** Cloth width metres. */
  clothW?: number;
  /** Cloth height metres. */
  clothH?: number;
  /** Yaw radians. */
  ry?: number;
}

/**
 * Place a faction claim banner at world XZ (grounded to heightfield).
 * userData: { isFactionBanner, factionId, settlementName? }
 */
export function placeFactionBannerFlag(
  scene: THREE.Scene,
  factionId: FactionId,
  wx: number,
  wz: number,
  opts: FactionBannerOpts & { settlementName?: string } = {},
): THREE.Group {
  const poleH = opts.poleHeight ?? 3.0;
  const clothW = opts.clothW ?? 1.05;
  const clothH = opts.clothH ?? 1.55;
  const ry = opts.ry ?? 0;
  const ground = worldHeight(wx, wz);

  const root = new THREE.Group();
  root.name = `faction_banner_${factionId}`;
  root.position.set(wx, ground, wz);
  root.rotation.y = ry;
  root.userData.isFactionBanner = true;
  root.userData.factionId = factionId;
  if (opts.settlementName) root.userData.settlementName = opts.settlementName;

  // Pole (cylinder along Y)
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.045, 0.055, poleH, 8),
    POLE_MAT,
  );
  pole.position.y = poleH * 0.5;
  pole.castShadow = true;
  pole.layers.enable(LAYERS.WORLD);
  root.add(pole);

  // Finial
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), CAP_MAT);
  cap.position.y = poleH + 0.04;
  cap.layers.enable(LAYERS.WORLD);
  root.add(cap);

  // Cross-bar
  const bar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.03, 0.03, clothW + 0.12, 6),
    POLE_MAT,
  );
  bar.rotation.z = Math.PI / 2;
  bar.position.set(clothW * 0.5, poleH - 0.08, 0);
  bar.layers.enable(LAYERS.WORLD);
  root.add(bar);

  // Cloth — hangs from cross-bar, offset +X so pole is at left edge of banner
  const cloth = new THREE.Mesh(
    new THREE.PlaneGeometry(clothW, clothH),
    bannerMaterial(factionId),
  );
  cloth.position.set(clothW * 0.5, poleH - 0.08 - clothH * 0.5, 0.02);
  cloth.castShadow = true;
  cloth.receiveShadow = true;
  cloth.layers.enable(LAYERS.WORLD);
  cloth.userData.isFactionBannerCloth = true;
  root.add(cloth);

  scene.add(root);
  return root;
}

/** Dispose shared materials/textures (call on world teardown if needed). */
export function disposeFactionBannerAssets(): void {
  for (const m of _matCache.values()) m.dispose();
  _matCache.clear();
  for (const t of _texCache.values()) t.dispose();
  _texCache.clear();
}
