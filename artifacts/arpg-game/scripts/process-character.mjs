#!/usr/bin/env node
/**
 * Bake a character GLB/GLTF to metre-scale and re-root so the origin sits
 * on the ground midpoint between the feet (y=0, x/z centered).
 *
 * Uses **world-space** mesh bounds (node matrices applied) so armatures that
 * already carry large translations are handled correctly.
 *
 * Run:
 *   node artifacts/arpg-game/scripts/process-character.mjs \
 *     --in  path/to/raw.glb \
 *     --out artifacts/arpg-game/public/models/characters/player/arpg-player.glb \
 *     --height 1.85
 *
 * Flags:
 *   --height <m>   Target height metres (default 1.8)
 *   --scale <n>    Explicit uniform scale (skips height fit)
 *   --no-reroot    Scale only, leave origin alone
 *   --manifest <p> Sidecar JSON path
 */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, weld, prune } from '@gltf-transform/functions';
import { mkdir, writeFile, stat, readFile } from 'node:fs/promises';
import { dirname, basename, extname } from 'node:path';
import { writeFileSync, readFileSync } from 'node:fs';

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
function mat4Translate(x, y, z) {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];
}
function xformPoint(m, x, y, z) {
  const w = m[3] * x + m[7] * y + m[11] * z + m[15] || 1;
  return [
    (m[0] * x + m[4] * y + m[8] * z + m[12]) / w,
    (m[1] * x + m[5] * y + m[9] * z + m[13]) / w,
    (m[2] * x + m[6] * y + m[10] * z + m[14]) / w,
  ];
}

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0 || i + 1 >= process.argv.length) return fallback;
  return process.argv[i + 1];
}
function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

const inputPath = arg('in');
const outputPath = arg('out');
const targetHeight = Number(arg('height', '1.8'));
const explicitScale = arg('scale', null);
const doReroot = !hasFlag('no-reroot');
const manifestPath = arg('manifest', outputPath?.replace(/\.glb$/i, '.manifest.json'));

if (!inputPath || !outputPath) {
  console.error(
    'Usage: process-character.mjs --in <src.glb> --out <dst.glb> [--height 1.8] [--scale 0.01] [--no-reroot]',
  );
  process.exit(1);
}

/**
 * Some exports (toon soldiers) reference sampler:0 but omit `samplers[]`.
 * Patch the GLB JSON chunk so gltf-transform can read them.
 */
function ensureGlbSamplers(filePath) {
  if (!/\.glb$/i.test(filePath)) return filePath;
  const buf = readFileSync(filePath);
  if (buf.length < 20 || buf.readUInt32LE(0) !== 0x46546c67) return filePath;
  const chunkLen = buf.readUInt32LE(12);
  const jsonStart = 20;
  const jsonEnd = jsonStart + chunkLen;
  let jsonStr = buf.slice(jsonStart, jsonEnd).toString('utf8').replace(/\0+$/, '');
  let gltf;
  try {
    gltf = JSON.parse(jsonStr);
  } catch {
    return filePath;
  }
  if (gltf.samplers && gltf.samplers.length > 0) return filePath;

  gltf.samplers = [{ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 }];
  for (const t of gltf.textures || []) {
    if (t.sampler == null) t.sampler = 0;
  }
  const newJson = Buffer.from(JSON.stringify(gltf), 'utf8');
  const pad = (4 - (newJson.length % 4)) % 4;
  const paddedJson = Buffer.concat([newJson, Buffer.alloc(pad, 0x20)]);
  const rest = buf.slice(jsonEnd);
  const totalLen = 12 + 8 + paddedJson.length + rest.length;
  const out = Buffer.alloc(totalLen);
  out.writeUInt32LE(0x46546c67, 0);
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(totalLen, 8);
  out.writeUInt32LE(paddedJson.length, 12);
  out.writeUInt32LE(0x4e4f534a, 16);
  paddedJson.copy(out, 20);
  rest.copy(out, 20 + paddedJson.length);
  const fixedPath = filePath.replace(/\.glb$/i, '.sampler-fixed.glb');
  writeFileSync(fixedPath, out);
  console.log(`[process-character] patched missing samplers → ${fixedPath}`);
  return fixedPath;
}

/**
 * World-space AABB for character fitting.
 *
 * Multi-mesh toon packs often ship a body armature + a second floating mesh
 * (weapon, kit). Using the union AABB doubles height and wrecks scale.
 * Strategy: measure each mesh separately, pick the **primary body** as the
 * mesh with the most vertices whose minY is nearest the ground, then expand
 * slightly with other meshes that overlap that body's Y range.
 */
function measureWorldBounds(root) {
  /** @type {{ verts: number, minX:number,minY:number,minZ:number,maxX:number,maxY:number,maxZ:number }[]} */
  const meshes = [];

  function walk(node, parentM) {
    const local = node.getMatrix();
    const M = parentM ? mat4Mul(parentM, local) : local;
    const mesh = node.getMesh();
    if (mesh) {
      let minX = Infinity, minY = Infinity, minZ = Infinity;
      let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
      let verts = 0;
      for (const prim of mesh.listPrimitives()) {
        const pos = prim.getAttribute('POSITION');
        if (!pos) continue;
        const arr = pos.getArray();
        verts += arr.length / 3;
        for (let i = 0; i < arr.length; i += 3) {
          const [x, y, z] = xformPoint(M, arr[i], arr[i + 1], arr[i + 2]);
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
          if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
        }
      }
      if (verts > 0 && isFinite(minY)) {
        meshes.push({ verts, minX, minY, minZ, maxX, maxY, maxZ });
      }
    }
    for (const child of node.listChildren()) walk(child, M);
  }

  for (const scene of root.listScenes()) {
    for (const child of scene.listChildren()) walk(child, null);
  }

  if (!meshes.length) {
    return {
      minX: 0, minY: 0, minZ: 0, maxX: 0, maxY: 0, maxZ: 0,
      height: 0, centerX: 0, centerZ: 0,
    };
  }

  // Primary = most verts; break ties by lowest minY (feet-on-ground body).
  meshes.sort((a, b) => b.verts - a.verts || a.minY - b.minY);
  const primary = meshes[0];
  let minX = primary.minX, minY = primary.minY, minZ = primary.minZ;
  let maxX = primary.maxX, maxY = primary.maxY, maxZ = primary.maxZ;

  // Merge other meshes that sit mostly inside the primary vertical span
  // (gear on hips/hands) — skip floating second armatures far above.
  const pH = primary.maxY - primary.minY || 1;
  for (let i = 1; i < meshes.length; i++) {
    const m = meshes[i];
    const mid = (m.minY + m.maxY) / 2;
    if (mid < primary.minY - 0.1 * pH || mid > primary.maxY + 0.15 * pH) continue;
    minX = Math.min(minX, m.minX); maxX = Math.max(maxX, m.maxX);
    minY = Math.min(minY, m.minY); maxY = Math.max(maxY, m.maxY);
    minZ = Math.min(minZ, m.minZ); maxZ = Math.max(maxZ, m.maxZ);
  }

  return {
    minX, minY, minZ, maxX, maxY, maxZ,
    height: maxY - minY,
    centerX: (minX + maxX) / 2,
    centerZ: (minZ + maxZ) / 2,
    meshCount: meshes.length,
    primaryVerts: primary.verts,
  };
}

/**
 * Prefer L/R foot node world positions for XZ midpoint.
 * Falls back to mesh AABB center when no foot nodes exist.
 */
function measureFeetWorldMidpoint(root) {
  const feet = [];
  function walk(node, parentM) {
    const local = node.getMatrix();
    const M = parentM ? mat4Mul(parentM, local) : local;
    const name = node.getName() || '';
    if (/foot|toe|ankle/i.test(name)) {
      const [x, y, z] = xformPoint(M, 0, 0, 0);
      feet.push({ name, x, y, z });
    }
    for (const child of node.listChildren()) walk(child, M);
  }
  for (const scene of root.listScenes()) {
    for (const child of scene.listChildren()) walk(child, null);
  }
  if (!feet.length) return null;

  const left = feet.filter((f) => /\b(l|left)\b|l[_ ]|left/i.test(f.name));
  const right = feet.filter((f) => /\b(r|right)\b|r[_ ]|right/i.test(f.name));
  const pool =
    left.length && right.length
      ? [left[0], right[0]]
      : feet;

  let sx = 0, sy = 0, sz = 0;
  for (const f of pool) {
    sx += f.x; sy += f.y; sz += f.z;
  }
  const n = pool.length;
  return { x: sx / n, y: sy / n, z: sz / n, source: pool.map((f) => f.name).join('+') };
}

const resolvedIn = ensureGlbSamplers(inputPath);

console.log(`[process-character] in=${resolvedIn}`);
console.log(`[process-character] out=${outputPath}`);
console.log(`[process-character] targetHeight=${targetHeight}m reroot=${doReroot}`);

const t0 = Date.now();
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const inSize = (await stat(resolvedIn)).size;
console.log(`[process-character] reading ${(inSize / 1024 / 1024).toFixed(2)} MB ...`);

const doc = await io.read(resolvedIn);
const root = doc.getRoot();
const rawBounds = measureWorldBounds(root);
const rawHeight = rawBounds.height;
console.log(
  `[process-character] rawHeight=${rawHeight.toFixed(4)} m (world) ` +
  `y=[${rawBounds.minY.toFixed(3)}, ${rawBounds.maxY.toFixed(3)}] ` +
  `xz center=(${rawBounds.centerX.toFixed(3)}, ${rawBounds.centerZ.toFixed(3)})`,
);

let appliedScale = explicitScale != null ? Number(explicitScale) : 1;
if (explicitScale == null && rawHeight > 0.001) {
  appliedScale = targetHeight / rawHeight;
}
console.log(`[process-character] appliedScale=${appliedScale.toFixed(6)}`);

// Re-root offsets in **pre-scale** world units, then bake T*S so:
//   world' = S * (world + offset)  with offset chosen so after scale:
//   minY'≈0 and centerXZ'≈0
let reroot = { x: 0, y: 0, z: 0, source: 'none' };
if (doReroot && rawHeight > 0.001) {
  const feet = measureFeetWorldMidpoint(root);
  const cx = feet ? feet.x : rawBounds.centerX;
  const cz = feet ? feet.z : rawBounds.centerZ;
  // Plant mesh soles (minY), not bone pivots.
  const plantY = rawBounds.minY;
  // Translation applied AFTER scale in M = T * S * child, so offsets must
  // be in post-scale units: -center * scale, -minY * scale.
  reroot = {
    x: -cx * appliedScale,
    y: -plantY * appliedScale,
    z: -cz * appliedScale,
    source: feet ? `feet:${feet.source}` : 'mesh-aabb-world',
  };
  console.log(
    `[process-character] reroot source=${reroot.source} ` +
    `Δ=(${reroot.x.toFixed(4)}, ${reroot.y.toFixed(4)}, ${reroot.z.toFixed(4)})`,
  );
}

const needTransform = appliedScale !== 1 || reroot.x !== 0 || reroot.y !== 0 || reroot.z !== 0;
if (needTransform) {
  const S = mat4Scale(appliedScale);
  const T = mat4Translate(reroot.x, reroot.y, reroot.z);
  const M = mat4Mul(T, S);
  for (const scene of root.listScenes()) {
    for (const child of scene.listChildren()) {
      child.setMatrix(mat4Mul(M, child.getMatrix()));
    }
  }
}

console.log('[process-character] weld + dedup + prune ...');
await doc.transform(dedup(), weld({ tolerance: 0.0001 }), prune());

const bakedBounds = measureWorldBounds(root);
await mkdir(dirname(outputPath), { recursive: true });
await io.write(outputPath, doc);

const manifest = {
  asset: basename(outputPath),
  unit: 'meters',
  targetHeight,
  rawHeight,
  bakedHeight: bakedBounds.height,
  bakedMinY: bakedBounds.minY,
  bakedCenterXZ: [bakedBounds.centerX, bakedBounds.centerZ],
  appliedScale,
  reroot,
  origin: 'feet-midpoint',
  processedAt: new Date().toISOString(),
  notes:
    'World-space scale + re-root baked at import. Origin = ground midpoint between feet (y=0). ' +
    'Runtime: SkeletonUtils.clone + AnimationMixer per instance; plant only if bakedMinY drifts.',
};
await writeFile(manifestPath, JSON.stringify(manifest, null, 2));

const outSize = (await stat(outputPath)).size;
console.log(`[process-character] done in ${Date.now() - t0} ms`);
console.log(
  `[process-character] out ${(outSize / 1024 / 1024).toFixed(2)} MB, ` +
  `bakedHeight=${bakedBounds.height.toFixed(4)}m minY=${bakedBounds.minY.toFixed(4)} ` +
  `centerXZ=(${bakedBounds.centerX.toFixed(4)}, ${bakedBounds.centerZ.toFixed(4)})`,
);
console.log(`[process-character] manifest → ${manifestPath}`);

// Soft verify
if (Math.abs(bakedBounds.minY) > 0.05) {
  console.warn(`[process-character] WARN: minY=${bakedBounds.minY.toFixed(4)} not near 0`);
}
if (Math.abs(bakedBounds.centerX) > 0.1 || Math.abs(bakedBounds.centerZ) > 0.1) {
  console.warn(
    `[process-character] WARN: centerXZ not near origin ` +
    `(${bakedBounds.centerX.toFixed(4)}, ${bakedBounds.centerZ.toFixed(4)})`,
  );
}
if (Math.abs(bakedBounds.height - targetHeight) > 0.15) {
  console.warn(
    `[process-character] WARN: height ${bakedBounds.height.toFixed(3)} vs target ${targetHeight}`,
  );
}
