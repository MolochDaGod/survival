#!/usr/bin/env node
/**
 * One-shot map processor: takes a raw Sketchfab GLB export and turns it
 * into a game-ready GLB sized for the browser.
 *
 *  - Extracts the named "player" marker node and writes its world-space
 *    position to a sidecar JSON (this is the in-engine spawn point).
 *  - Strips the marker node from the scene so it isn't drawn.
 *  - Applies a uniform scale to the root (Sketchfab maps usually arrive
 *    in centimeters or arbitrary units; we want metres).
 *  - Welds duplicate vertices, dedups duplicate accessors / materials.
 *  - Joins primitives that share a material into a single primitive,
 *    which collapses thousands of draw calls into a handful.
 *  - Compresses geometry with Draco.
 *
 * Run:
 *   node artifacts/arpg-game/scripts/process-map.mjs \
 *     --in 'attached_assets/scene_(14)_1777536208523.glb' \
 *     --out artifacts/arpg-game/public/locations/town3f2.glb \
 *     --scale 0.01
 */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import {
  dedup, weld, join, draco, prune, flatten,
  reorder, textureCompress,
} from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import { mkdir, writeFile, stat } from 'node:fs/promises';
import { dirname, basename } from 'node:path';

// --- minimal column-major mat4 helpers (no external dep) ---
function mat4Identity() {
  return [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
}
function mat4Mul(a, b) {
  // out = a * b (column-major)
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
  return [s,0,0,0, 0,s,0,0, 0,0,s,0, 0,0,0,1];
}

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0 || i + 1 >= process.argv.length) return fallback;
  return process.argv[i + 1];
}

const inputPath  = arg('in',  'attached_assets/scene_(14)_1777536208523.glb');
const outputPath = arg('out', 'artifacts/arpg-game/public/locations/town3f2.glb');
const scale      = Number(arg('scale', '0.01'));
const markerName = arg('marker', 'player');
const sidecarPath = outputPath.replace(/\.glb$/i, '.json');

console.log(`[process-map] in=${inputPath}`);
console.log(`[process-map] out=${outputPath}`);
console.log(`[process-map] scale=${scale}`);
console.log(`[process-map] marker node name="${markerName}"`);

const t0 = Date.now();

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    'draco3d.decoder': await draco3d.createDecoderModule(),
    'draco3d.encoder': await draco3d.createEncoderModule(),
  });

const inSize = (await stat(inputPath)).size;
console.log(`[process-map] reading ${(inSize / 1024 / 1024).toFixed(1)} MB ...`);
const doc = await io.read(inputPath);
const root = doc.getRoot();
console.log(`[process-map] loaded in ${Date.now() - t0} ms`);

// --- 1. Find the spawn marker by name and capture its world matrix.
let spawnLocal = null;          // raw matrix as exported (pre-scale)
let spawnNode  = null;
for (const node of root.listNodes()) {
  if (node.getName() === markerName) {
    spawnNode = node;
    break;
  }
}
if (!spawnNode) {
  console.warn(`[process-map] WARN: no node named "${markerName}" found — spawn defaulting to origin`);
} else {
  // Walk up the parent chain accumulating world matrix (root → leaf order).
  const stack = [];
  let cur = spawnNode;
  while (cur) {
    stack.push(cur);
    cur = cur.getParentNode?.() ?? null;
  }
  let worldMat = mat4Identity();
  for (let i = stack.length - 1; i >= 0; i--) {
    worldMat = mat4Mul(worldMat, stack[i].getMatrix());
  }
  spawnLocal = worldMat;
  // Final spawn position = world position * scale.
  const wx = worldMat[12] * scale;
  const wy = worldMat[13] * scale;
  const wz = worldMat[14] * scale;
  console.log(`[process-map] spawn world=(${worldMat[12].toFixed(2)}, ${worldMat[13].toFixed(2)}, ${worldMat[14].toFixed(2)})`);
  console.log(`[process-map] spawn scaled=(${wx.toFixed(2)}, ${wy.toFixed(2)}, ${wz.toFixed(2)})`);

  // Detach the marker so it doesn't draw or affect bounds.
  // dispose() removes from the document; we also detach mesh below if not shared.
  const markerMesh = spawnNode.getMesh();
  spawnNode.dispose();
  // Only dispose mesh if no other node still references it.
  if (markerMesh && markerMesh.listParents().filter((p) => p.propertyType === 'Node').length === 0) {
    markerMesh.dispose();
  }
}

// --- 2. Apply uniform scale by pre-multiplying each scene root child's matrix.
if (scale !== 1) {
  const S = mat4Scale(scale);
  for (const scene of root.listScenes()) {
    for (const child of scene.listChildren()) {
      child.setMatrix(mat4Mul(S, child.getMatrix()));
    }
  }
}

// --- 3. Optimisation pipeline.
//
// "Pro-level" map bake — order matters here:
//   flatten     — collapse node hierarchy so siblings can be joined
//   weld        — merge co-incident verts (reduces buffer size pre-quant)
//   dedup       — dedupe identical accessors / materials
//   join        — collapse primitives that share a material
//   prune       — drop now-orphaned accessors / nodes
//   reorder     — re-sort indices for GPU vertex-cache locality (try/catch
//                 so we degrade gracefully when meshoptimizer isn't installed)
//   draco       — geometry compression (last — must run on final layout)
console.log('[process-map] flatten + weld + dedup + join + prune + (reorder?) + draco ...');
const tOpt = Date.now();

const passes = [
  flatten(),
  weld({ tolerance: 0.0001 }),
  dedup(),
  join(),
  prune(),
];

// reorder() needs the meshoptimizer encoder; install it via
//   pnpm --filter @workspace/arpg-game add -D meshoptimizer
// Until then we skip the pass without failing the bake.
try {
  const { MeshoptEncoder } = await import('meshoptimizer');
  await MeshoptEncoder.ready;
  passes.push(reorder({ encoder: MeshoptEncoder, target: 'size' }));
  console.log('[process-map] meshoptimizer reorder enabled');
} catch {
  console.log('[process-map] meshoptimizer not installed — skipping reorder()');
}

// ao() vertex AO bake (pro-level map polish).
//
// Bakes ambient-occlusion darkening into a per-vertex COLOR_0 attribute,
// which gives noticeably more grounded shadows in crevices and corners
// without paying the runtime cost of a screen-space AO pass. Three.js
// reads vertex colors automatically when the material has
// `vertexColors: true`, but for COLOR_0 produced offline we also pin
// the colour-space to sRGB so the bake doesn't get gamma-multiplied
// twice at runtime.
//
// Backends: gltf-transform's ao() requires either a WebGL context
// (`gl` package) or `gltf-transform-cli`'s built-in CPU rasterizer.
// On a typical CI / sandbox node, the GL backend isn't installed —
// wrap in try/catch like reorder() so the bake degrades gracefully.
try {
  // Both helpers are imported dynamically so that older versions of
  // @gltf-transform/functions (which may not ship `ao` or
  // `vertexColorSpace`) don't break the static import at module-load
  // time.
  const fns = await import('@gltf-transform/functions');
  if (typeof fns.ao === 'function') {
    passes.push(fns.ao({ resolution: 512, samples: 256 }));
    if (typeof fns.vertexColorSpace === 'function') {
      passes.push(fns.vertexColorSpace({ inputColorSpace: 'srgb' }));
    }
    console.log('[process-map] vertex AO bake enabled (resolution=512, samples=256)');
  } else {
    console.log('[process-map] ao() not exported by gltf-transform — skipping');
  }
} catch (err) {
  console.log(`[process-map] AO bake skipped: ${err?.message ?? err}`);
}

// draco runs as part of the main transform pipeline.
passes.push(draco({ method: 'edgebreaker' }));

await doc.transform(...passes);

// Optional: shrink any embedded PNG/JPG textures. textureCompress() throws
// at execution-time (not creation-time) when its backend (`sharp`) isn't
// installed, so we wrap the actual `transform` call — not just the pass
// constructor — in try/catch. The bake's geometry compression has already
// run by this point, so a failed texture pass is a no-op rather than a
// hard failure of the whole bake.
try {
  await doc.transform(textureCompress({ targetFormat: 'webp', resize: [2048, 2048] }));
  console.log('[process-map] texture compression succeeded (webp, ≤2048²)');
} catch (err) {
  console.log(`[process-map] texture compression skipped: ${err?.message ?? err}`);
}
console.log(`[process-map] optimisation took ${Date.now() - tOpt} ms`);

// --- 4. Stats.
let prims = 0, verts = 0;
for (const m of root.listMeshes()) {
  for (const p of m.listPrimitives()) {
    prims++;
    const pos = p.getAttribute('POSITION');
    if (pos) verts += pos.getCount();
  }
}
console.log(`[process-map] post-optimise: ${root.listMeshes().length} meshes, ${prims} primitives, ${verts.toLocaleString()} verts`);

// --- 5. Write outputs.
await mkdir(dirname(outputPath), { recursive: true });
await io.write(outputPath, doc);
const outSize = (await stat(outputPath)).size;
console.log(`[process-map] wrote ${outputPath} (${(outSize / 1024 / 1024).toFixed(1)} MB, ${(outSize / inSize * 100).toFixed(1)}% of original)`);

// Spawn JSON sidecar — consumed by the in-game StaticMap loader.
const spawn = spawnLocal
  ? {
      worldRaw: { x: spawnLocal[12], y: spawnLocal[13], z: spawnLocal[14] },
      world:    { x: spawnLocal[12] * scale, y: spawnLocal[13] * scale, z: spawnLocal[14] * scale },
    }
  : { world: { x: 0, y: 0, z: 0 } };
const sidecar = {
  source: basename(inputPath),
  scale,
  generated: new Date().toISOString(),
  spawn,
};
await writeFile(sidecarPath, JSON.stringify(sidecar, null, 2));
console.log(`[process-map] wrote ${sidecarPath}`);
console.log(`[process-map] DONE in ${Date.now() - t0} ms`);
