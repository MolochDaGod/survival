import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createGLTFLoader } from '../../loaders/createGLTFLoader';
import { LAYERS } from '../../Layers';
import { Biome, getBiome, isWater } from '../WorldGen';
import { getBlendedHeight } from '../TerrainPatchSystem';
import { getSectorForPosition } from '../../../data/sectors';
import { POLYHAVEN_NATURE_MODELS } from './PolyHavenCatalog';

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function groundY(x: number, z: number): number {
  return getBlendedHeight(x, z);
}

function biomeToTag(biome: Biome): string {
  switch (biome) {
    case Biome.Forest: return 'forest';
    case Biome.Grassland: return 'grassland';
    case Biome.Highland:
    case Biome.Mountain:
    case Biome.SnowPeak:
      return 'highland';
    case Biome.Beach:
      return 'coast';
    default:
      return 'grassland';
  }
}

const BIOME_BIAS_MAP: Record<string, readonly string[]> = {
  highland: ['highland', 'grassland', 'forest'],
  forest: ['forest', 'grassland'],
  grassland: ['grassland', 'forest', 'coast'],
  pit: ['pit', 'wreckage', 'highland'],
  coast: ['coast', 'grassland', 'forest'],
  wreckage: ['wreckage', 'pit', 'grassland'],
  farmland: ['grassland', 'forest'],
  town: ['grassland', 'wreckage'],
};

/**
 * Scatter Poly Haven CC0 nature GLTFs across the open world by biome.
 */
export class PolyHavenNature {
  private loader: GLTFLoader;
  private templates = new Map<string, THREE.Group>();
  private root = new THREE.Group();
  private scattered = false;

  constructor(
    private scene: THREE.Scene,
    loadingManager?: THREE.LoadingManager,
  ) {
    this.loader = createGLTFLoader(loadingManager);
    this.root.name = 'PolyHavenNature';
    this.scene.add(this.root);
  }

  async scatter(count = 420, seed = 0x6e617475): Promise<number> {
    if (this.scattered) return this.root.children.length;
    await this.loadTemplates();

    const rng = mulberry32(seed);
    const half = 9500;
    let placed = 0;

    for (let i = 0; i < count; i++) {
      const x = (rng() * 2 - 1) * half;
      const z = (rng() * 2 - 1) * half;
      if (Math.hypot(x, z) < 180) continue;

      const y = groundY(x, z);
      const biome = getBiome(y);
      if (isWater(biome)) continue;

      const biomeTag = biomeToTag(biome);
      const sector = getSectorForPosition(x, z);
      const allowed = sector
        ? (BIOME_BIAS_MAP[sector.biomeBias] ?? [biomeTag])
        : [biomeTag];

      const candidates = POLYHAVEN_NATURE_MODELS.filter((m) =>
        m.biomes.some((b) => allowed.includes(b) || b === biomeTag),
      );
      if (!candidates.length) continue;

      const pick = candidates[Math.floor(rng() * candidates.length)];
      const template = this.templates.get(pick.id);
      if (!template) continue;

      const inst = template.clone(true);
      const s = pick.scale * (0.75 + rng() * 0.5);
      inst.scale.setScalar(s);
      inst.rotation.y = rng() * Math.PI * 2;
      inst.position.set(x, y, z);
      inst.traverse((c) => {
        if (c instanceof THREE.Mesh) {
          c.castShadow = true;
          c.receiveShadow = true;
          c.layers.enable(LAYERS.WORLD);
        }
      });
      this.root.add(inst);
      placed++;
    }

    this.scattered = true;
    console.info(`[PolyHavenNature] scattered ${placed} models`);
    return placed;
  }

  private async loadTemplates(): Promise<void> {
    await Promise.all(
      POLYHAVEN_NATURE_MODELS.map(
        (def) =>
          new Promise<void>((resolve) => {
            if (this.templates.has(def.id)) {
              resolve();
              return;
            }
            this.loader.load(
              def.url,
              (gltf) => {
                const group = gltf.scene as THREE.Group;
                group.traverse((c) => {
                  if (c instanceof THREE.Mesh && c.material instanceof THREE.MeshStandardMaterial) {
                    c.material.envMapIntensity = 1.0;
                  }
                });
                this.templates.set(def.id, group);
                resolve();
              },
              undefined,
              () => {
                console.warn(`[PolyHavenNature] missing ${def.id}`);
                resolve();
              },
            );
          }),
      ),
    );
  }
}