import * as THREE from 'three';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { POLYHAVEN_SKY_HDR } from './PolyHavenCatalog';

export interface OutdoorEnvironmentResult {
  envMap: THREE.Texture;
  background: THREE.Texture;
  hdrTexture: THREE.DataTexture;
}

/**
 * Load a Poly Haven outdoor HDR and bake PMREM IBL for PBR materials.
 * Falls back to the caller's existing RoomEnvironment when fetch fails.
 */
export async function loadPolyHavenEnvironment(
  renderer: THREE.WebGLRenderer,
  hdrUrl: string = POLYHAVEN_SKY_HDR,
): Promise<OutdoorEnvironmentResult | null> {
  try {
    const loader = new RGBELoader();
    const hdr = await loader.loadAsync(hdrUrl);
    hdr.mapping = THREE.EquirectangularReflectionMapping;
    hdr.colorSpace = THREE.LinearSRGBColorSpace;

    const pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    const envMap = pmrem.fromEquirectangular(hdr).texture;
    pmrem.dispose();

    return { envMap, background: hdr, hdrTexture: hdr };
  } catch (err) {
    console.warn('[PolyHavenEnvironment] HDR load failed:', err);
    return null;
  }
}

/** Apply outdoor IBL to the scene and bump PBR env response on meshes. */
export function applyOutdoorEnvironment(
  scene: THREE.Scene,
  result: OutdoorEnvironmentResult,
  _opts: { backgroundBlend?: number } = {},
): void {
  scene.environment = result.envMap;
  scene.background = result.background;
  if ('environmentIntensity' in scene) {
    (scene as THREE.Scene & { environmentIntensity: number }).environmentIntensity = 1.15;
  }
  scene.fog = new THREE.FogExp2(0xb8c8e0, 0.00085);

  scene.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const mat of mats) {
      if (mat instanceof THREE.MeshStandardMaterial) {
        mat.envMapIntensity = Math.max(mat.envMapIntensity ?? 0.5, 0.85);
        mat.needsUpdate = true;
      }
    }
  });
}