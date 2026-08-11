import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

/**
 * Local first (shipped under public/decoders/), then Google CDN for Draco
 * and jsDelivr for Basis if the local path 404s in a partial deploy.
 *
 * Path layout matches three.js examples:
 *   <base>decoders/draco/gltf/{draco_decoder.wasm,draco_wasm_wrapper.js}
 *   <base>decoders/basis/{basis_transcoder.js,basis_transcoder.wasm}
 */
const LOCAL_DECODER_BASE = (import.meta.env.BASE_URL || '/') + 'decoders/';
const CDN_DRACO =
  'https://www.gstatic.com/draco/versioned/decoders/1.5.7/';
const CDN_BASIS =
  'https://cdn.jsdelivr.net/npm/three@0.183.2/examples/jsm/libs/basis/';

let _draco: DRACOLoader | null = null;
let _ktx2: KTX2Loader | null = null;
let _ktx2DetectedFor: THREE.WebGLRenderer | null = null;
let _dracoPath = LOCAL_DECODER_BASE + 'draco/gltf/';
let _basisPath = LOCAL_DECODER_BASE + 'basis/';
let _probed = false;

/** Probe local decoder presence once; fall back to CDN if missing. */
async function ensureDecoderPaths(): Promise<void> {
  if (_probed) return;
  _probed = true;
  try {
    const probe = await fetch(_dracoPath + 'draco_wasm_wrapper.js', {
      method: 'HEAD',
      cache: 'force-cache',
    });
    if (!probe.ok) {
      console.warn(
        '[createGLTFLoader] Local Draco missing — using Google CDN decoders',
      );
      _dracoPath = CDN_DRACO;
    }
  } catch {
    console.warn(
      '[createGLTFLoader] Local Draco unreachable — using Google CDN decoders',
    );
    _dracoPath = CDN_DRACO;
  }
  try {
    const probe = await fetch(_basisPath + 'basis_transcoder.js', {
      method: 'HEAD',
      cache: 'force-cache',
    });
    if (!probe.ok) {
      console.warn(
        '[createGLTFLoader] Local Basis missing — using jsDelivr transcoder',
      );
      _basisPath = CDN_BASIS;
    }
  } catch {
    _basisPath = CDN_BASIS;
  }
}

function getDraco(): DRACOLoader {
  if (!_draco) {
    _draco = new DRACOLoader();
    _draco.setDecoderPath(_dracoPath);
    _draco.setDecoderConfig({ type: 'wasm' });
    _draco.preload();
  }
  return _draco;
}

function getKtx2(): KTX2Loader {
  if (!_ktx2) {
    _ktx2 = new KTX2Loader();
    _ktx2.setTranscoderPath(_basisPath);
  }
  return _ktx2;
}

/**
 * KTX2Loader needs a WebGLRenderer to detect which transcoder targets
 * (ASTC / BC7 / ETC2 / etc.) the GPU supports. Call once after the
 * renderer is created (AssetManager does this in its constructor).
 */
export function configureKTX2WithRenderer(renderer: THREE.WebGLRenderer): void {
  if (_ktx2DetectedFor === renderer) return;
  getKtx2().detectSupport(renderer);
  _ktx2DetectedFor = renderer;
}

/**
 * Build a GLTFLoader with DRACO mesh decompression, KTX2 (Basis Universal)
 * texture transcoding, and Meshopt geometry/animation decompression.
 *
 * Prefer `await createGLTFLoaderAsync()` at boot so decoder path probing
 * finishes before the first compressed GLB. Sync `createGLTFLoader()` still
 * works — it uses the last resolved path (local default until probe runs).
 */
export function createGLTFLoader(manager?: THREE.LoadingManager): GLTFLoader {
  const loader = manager ? new GLTFLoader(manager) : new GLTFLoader();
  loader.setDRACOLoader(getDraco());
  loader.setKTX2Loader(getKtx2());
  loader.setMeshoptDecoder(MeshoptDecoder);
  return loader;
}

/** Async factory — probes local vs CDN decoder paths before first load. */
export async function createGLTFLoaderAsync(
  manager?: THREE.LoadingManager,
): Promise<GLTFLoader> {
  await ensureDecoderPaths();
  // Apply resolved paths (local or CDN) onto existing loader singletons.
  if (_draco) {
    _draco.setDecoderPath(_dracoPath);
  } else {
    getDraco();
  }
  if (_ktx2) {
    _ktx2.setTranscoderPath(_basisPath);
  } else {
    getKtx2();
  }
  return createGLTFLoader(manager);
}

/** Warm decoder workers/wasm early (call during asset boot). */
export async function preloadCompressedDecoders(): Promise<void> {
  await ensureDecoderPaths();
  getDraco();
  getKtx2();
}

/** Free decoder workers/wasm. Call on hard teardown only. */
export function disposeCompressedDecoders(): void {
  _draco?.dispose();
  _draco = null;
  _ktx2?.dispose();
  _ktx2 = null;
  _ktx2DetectedFor = null;
  _probed = false;
  _dracoPath = LOCAL_DECODER_BASE + 'draco/gltf/';
  _basisPath = LOCAL_DECODER_BASE + 'basis/';
}
