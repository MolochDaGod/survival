#!/usr/bin/env node
/**
 * Bake a character GLB/GLTF to metre-scale at the mesh/matrix level so runtime
 * loaders can use scale 1 (or grudge-control WORLD_SCALE 0.01) without guessing.
 *
 *  - Measures raw bounding height from POSITION attributes
 *  - Applies uniform scale to scene-root children (skinned rigs included)
 *  - Writes a sidecar manifest with raw/applied scale + target height
 *  - Optional weld/dedup/prune for smaller files
 *
 * Run:
 *   node artifacts/arpg-game/scripts/process-character.mjs \
 *     --in attached_assets/raw/adventurer.glb \
 *     --out artifacts/arpg-game/public/models/characters/male/adventurer.glb \
 *     --height 1.8
 */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, weld, prune } from '@gltf-transform/functions';
import { mkdir, writeFile, stat } from 'node:fs/promises';
import { dirname, basename } from 'node:path';

function mat4Identity() {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}
function mat4Mul(a, b) {
  const o = new Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
      o[c * 4 + r] = s;
    }
  }
  return o;
}
function mat4Scale(s) {
  return [s, 0, 0, 0, 0, s, 0, 0, 0, 0, s, 0, 0, 0, 0, 1];
}

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0 || i + 1 >= process.argv.length) return fallback;
  return process.argv[i + 1];
}

const inputPath = arg('in');
const outputPath = arg('out');
const targetHeight = Number(arg('height', '1.8'));
const explicitScale = arg('scale', null);
const manifestPath = arg('manifest', outputPath?.replace(/\.glb$/i, '.manifest.json'));

if (!inputPath || !outputPath) {
  console.error('Usage: process-character.mjs --in <src.glb> --out <dst.glb> [--height 1.8] [--scale 0.01]');
  process.exit(1);
}

function measureHeight(root) {
  let minY = Infinity;
  let maxY = -Infinity;
  for (const mesh of root.listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION');
      if (!pos) continue;
      const arr = pos.getArray();
      for (let i = 1; i < arr.length; i += 3) {
        minY = Math.min(minY, arr[i]);
        maxY = Math.max(maxY, arr[i]);
      }
    }
  }
  if (!isFinite(minY) || !isFinite(maxY)) return 0;
  return maxY - minY;
}

console.log(`[process-character] in=${inputPath}`);
console.log(`[process-character] out=${outputPath}`);
console.log(`[process-character] targetHeight=${targetHeight}m`);

const t0 = Date.now();
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const inSize = (await stat(inputPath)).size;
console.log(`[process-character] reading ${(inSize / 1024 / 1024).toFixed(2)} MB ...`);

const doc = await io.read(inputPath);
const root = doc.getRoot();
const rawHeight = measureHeight(root);
console.log(`[process-character] rawHeight=${rawHeight.toFixed(4)} units`);

let appliedScale = explicitScale != null ? Number(explicitScale) : 1;
if (explicitScale == null && rawHeight > 0.001) {
  appliedScale = targetHeight / rawHeight;
}
console.log(`[process-character] appliedScale=${appliedScale.toFixed(6)}`);

if (appliedScale !== 1) {
  const S = mat4Scale(appliedScale);
  for (const scene of root.listScenes()) {
    for (const child of scene.listChildren()) {
      child.setMatrix(mat4Mul(S, child.getMatrix()));
    }
  }
}

console.log('[process-character] weld + dedup + prune ...');
await doc.transform(dedup(), weld({ tolerance: 0.0001 }), prune());

const bakedHeight = measureHeight(root);
await mkdir(dirname(outputPath), { recursive: true });
await io.write(outputPath, doc);

const manifest = {
  asset: basename(outputPath),
  unit: 'meters',
  targetHeight,
  rawHeight,
  bakedHeight,
  appliedScale,
  processedAt: new Date().toISOString(),
  notes: 'Bake scale at import; runtime grudge-control uses WORLD_SCALE 0.01 for cm bridge.',
};
await writeFile(manifestPath, JSON.stringify(manifest, null, 2));

const outSize = (await stat(outputPath)).size;
console.log(`[process-character] done in ${Date.now() - t0} ms`);
console.log(`[process-character] out ${(outSize / 1024 / 1024).toFixed(2)} MB, bakedHeight=${bakedHeight.toFixed(4)}m`);
console.log(`[process-character] manifest → ${manifestPath}`);