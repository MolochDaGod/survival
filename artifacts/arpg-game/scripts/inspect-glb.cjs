#!/usr/bin/env node
/**
 * Inspect a GLB by parsing its JSON chunk only (no binary decode).
 * Reports animations, skins, meshes, nodes, materials, textures,
 * approximate bounding box from POSITION accessor min/max, and the
 * total embedded buffer size.
 *
 * Usage: node scripts/inspect-glb.cjs path/to/file.glb [more.glb ...]
 */
const fs = require('fs');
const path = require('path');

function readGLB(filepath) {
  const buf = fs.readFileSync(filepath);
  if (buf.length < 12) throw new Error('too small');
  const magic = buf.toString('ascii', 0, 4);
  if (magic !== 'glTF') throw new Error('not a GLB (magic = ' + magic + ')');
  const version = buf.readUInt32LE(4);
  const total = buf.readUInt32LE(8);
  // chunk 0: JSON
  const jsonLen = buf.readUInt32LE(12);
  const jsonType = buf.toString('ascii', 16, 20);
  if (jsonType !== 'JSON') throw new Error('first chunk is not JSON');
  const jsonStr = buf.toString('utf8', 20, 20 + jsonLen);
  const json = JSON.parse(jsonStr);
  return { version, total, json, size: buf.length };
}

function fmtSize(n) {
  if (n < 1024) return n + 'B';
  if (n < 1024*1024) return (n/1024).toFixed(1) + 'KB';
  return (n/1024/1024).toFixed(1) + 'MB';
}

function summarize(filepath) {
  const name = path.basename(filepath);
  let report;
  try {
    report = readGLB(filepath);
  } catch (e) {
    console.log(`\n## ${name}\n  ERROR: ${e.message}`);
    return;
  }
  const { json, size } = report;
  const anims = json.animations || [];
  const skins = json.skins || [];
  const meshes = json.meshes || [];
  const nodes = json.nodes || [];
  const mats = json.materials || [];
  const texs = json.textures || [];
  const accessors = json.accessors || [];

  // Compute scene bounding box from POSITION accessors of all primitives.
  let bmin = [Infinity, Infinity, Infinity];
  let bmax = [-Infinity, -Infinity, -Infinity];
  let primCount = 0, vertCount = 0, triCount = 0;
  for (const m of meshes) {
    for (const p of (m.primitives || [])) {
      primCount++;
      const posIdx = p.attributes && p.attributes.POSITION;
      if (typeof posIdx === 'number' && accessors[posIdx]) {
        const acc = accessors[posIdx];
        vertCount += acc.count || 0;
        if (acc.min && acc.max) {
          for (let i = 0; i < 3; i++) {
            if (acc.min[i] < bmin[i]) bmin[i] = acc.min[i];
            if (acc.max[i] > bmax[i]) bmax[i] = acc.max[i];
          }
        }
      }
      const idxIdx = p.indices;
      if (typeof idxIdx === 'number' && accessors[idxIdx]) {
        triCount += Math.floor((accessors[idxIdx].count || 0) / 3);
      }
    }
  }
  const dims = bmin[0] === Infinity ? null : [
    (bmax[0]-bmin[0]).toFixed(2),
    (bmax[1]-bmin[1]).toFixed(2),
    (bmax[2]-bmin[2]).toFixed(2),
  ];

  // Bone count from first skin (if any).
  let boneCount = 0;
  if (skins[0]) boneCount = (skins[0].joints || []).length;

  const animLines = anims.map((a, i) => {
    const ch = (a.channels || []).length;
    const samp = (a.samplers || []);
    // Approx duration from sampler input accessor max time
    let dur = 0;
    for (const s of samp) {
      const acc = accessors[s.input];
      if (acc && acc.max && acc.max[0] > dur) dur = acc.max[0];
    }
    return `    ${String(i+1).padStart(2)}. ${(a.name || '<unnamed>').padEnd(40)} ${dur.toFixed(2)}s  ${ch} channels`;
  }).join('\n');

  console.log(`\n## ${name}  (${fmtSize(size)})`);
  console.log(`  meshes:     ${meshes.length}  (${primCount} primitives, ~${vertCount} verts, ~${triCount} tris)`);
  console.log(`  materials:  ${mats.length}    textures: ${texs.length}`);
  console.log(`  nodes:      ${nodes.length}`);
  console.log(`  skins:      ${skins.length}   bones (first skin): ${boneCount}`);
  console.log(`  animations: ${anims.length}`);
  if (anims.length) console.log(animLines);
  if (dims) console.log(`  bbox dims:  X=${dims[0]}  Y=${dims[1]}  Z=${dims[2]}`);
}

const argv = process.argv.slice(2);
if (!argv.length) { console.error('usage: inspect-glb.cjs <file.glb> [...]'); process.exit(1); }
for (const f of argv) summarize(f);
