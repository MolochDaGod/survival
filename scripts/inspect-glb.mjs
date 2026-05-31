#!/usr/bin/env node
// Inspect a .glb file: print animation clip names, mesh names, node count,
// skin/bone counts. Reads only the JSON chunk — no three.js dependency.
//
// Usage: node scripts/inspect-glb.mjs <path1> [path2 ...]
import { readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';

function inspect(filePath) {
  const buf = readFileSync(filePath);
  let gltf, version = 2, totalLen = buf.length;
  if (filePath.toLowerCase().endsWith('.gltf')) {
    gltf = JSON.parse(buf.toString('utf8'));
  } else {
    if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error('Not a GLB');
    version = buf.readUInt32LE(4);
    totalLen = buf.readUInt32LE(8);
    const jsonLen = buf.readUInt32LE(12);
    const jsonType = buf.readUInt32LE(16);
    if (jsonType !== 0x4e4f534a) throw new Error('Expected JSON chunk');
    const jsonStr = buf.subarray(20, 20 + jsonLen).toString('utf8');
    gltf = JSON.parse(jsonStr);
  }

  const animations = (gltf.animations ?? []).map((a, i) => a.name || `anim_${i}`);
  const meshes     = (gltf.meshes ?? []).map((m, i) => m.name || `mesh_${i}`);
  const skins      = gltf.skins ?? [];
  const boneCount  = skins.reduce((acc, s) => acc + (s.joints?.length ?? 0), 0);
  const nodes      = (gltf.nodes ?? []).length;
  const textures   = (gltf.textures ?? []).length;
  const materials  = (gltf.materials ?? []).map((m, i) => m.name || `mat_${i}`);

  console.log('────────────────────────────────────────────────────────────');
  console.log(`FILE: ${basename(filePath)}`);
  console.log(`Size: ${(buf.length / 1024 / 1024).toFixed(2)} MB | glTF v${version} | total ${totalLen}`);
  console.log(`Nodes: ${nodes} | Skins: ${skins.length} | Bones: ${boneCount} | Textures: ${textures}`);
  console.log(`Animations (${animations.length}):`);
  animations.forEach(n => console.log(`  - ${n}`));
  console.log(`Meshes (${meshes.length}):`);
  meshes.forEach(n => console.log(`  - ${n}`));
  console.log(`Materials (${materials.length}):`);
  materials.slice(0, 12).forEach(n => console.log(`  - ${n}`));
  if (materials.length > 12) console.log(`  ... (+${materials.length - 12} more)`);
  return { animations, meshes, boneCount, nodes, materials };
}

const files = process.argv.slice(2);
if (!files.length) {
  console.error('usage: node scripts/inspect-glb.mjs <file.glb> [...]');
  process.exit(1);
}
for (const f of files) inspect(resolve(f));
