import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

const DECODER_BASE = (import.meta.env.BASE_URL || '/') + 'decoders/';

let _draco: DRACOLoader | null = null;
let _ktx2: KTX2Loader | null = null;
let _ktx2DetectedFor: THREE.WebGLRenderer | null = null;

function getDraco(): DRACOLoader {
  if (!_draco) {
    _draco = new DRACOLoader();
    _draco.setDecoderPath(DECODER_BASE + 'draco/gltf/');
    _draco.setDecoderConfig({ type: 'wasm' });
    _draco.preload();
  }
  return _draco;
}

function getKtx2(): KTX2Loader {
  if (!_ktx2) {
    _ktx2 = new KTX2Loader();
    _ktx2.setTranscoderPath(DECODER_BASE + 'basis/');
  }
  return _ktx2;
}

/**
 * KTX2Loader needs a WebGLRenderer to detect which transcoder targets
 * (ASTC / BC7 / ETC2 / etc.) the GPU supports. Call this once after the
 * renderer is created (AssetManager does this in its constructor).
 * Safe to call multiple times — it short-circuits if the renderer hasn't
 * changed.
 */
export function configureKTX2WithRenderer(renderer: THREE.WebGLRenderer): void {
  if (_ktx2DetectedFor === renderer) return;
  getKtx2().detectSupport(renderer);
  _ktx2DetectedFor = renderer;
}

/**
 * Build a GLTFLoader with DRACO mesh decompression, KTX2 (Basis Universal)
 * texture transcoding, and Meshopt geometry/animation decompression all
 * wired in. Decoders/transcoders are vendored under public/decoders/ so no
 * CDN is required.
 *
 * KTX2 textures will fall back to RGBA8 software transcoding if
 * configureKTX2WithRenderer() has not been called yet, so loaders created
 * before AssetManager still work — they just miss GPU-format detection.
 */
export function createGLTFLoader(manager?: THREE.LoadingManager): GLTFLoader {
  const loader = manager ? new GLTFLoader(manager) : new GLTFLoader();
  loader.setDRACOLoader(getDraco());
  loader.setKTX2Loader(getKtx2());
  loader.setMeshoptDecoder(MeshoptDecoder);
  return loader;
}

/** Free decoder workers/wasm. Call on hard teardown only. */
export function disposeCompressedDecoders(): void {
  _draco?.dispose();
  _draco = null;
  _ktx2?.dispose();
  _ktx2 = null;
  _ktx2DetectedFor = null;
}
