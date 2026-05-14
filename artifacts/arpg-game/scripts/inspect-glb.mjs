import { NodeIO } from '@gltf-transform/core';
const io = new NodeIO();
const doc = await io.read(process.argv[2]);
const root = doc.getRoot();

const skins = root.listSkins();
const allNodes = root.listNodes();

console.log('=== SCENE ===');
console.log('Nodes:', allNodes.length);
console.log('Meshes:', root.listMeshes().length);
console.log('Skins:', skins.length);
console.log('Animations:', root.listAnimations().length);
console.log('Materials:', root.listMaterials().length);
console.log('Textures:', root.listTextures().length);

const boneNodes = allNodes.filter(n => /^mixamorig:/.test(n.getName()));
const fingerNodes = boneNodes.filter(n => /Hand(Thumb|Index|Middle|Ring|Pinky)/i.test(n.getName()));

console.log('\n=== SKELETON ===');
console.log('mixamorig: bones:', boneNodes.length);
console.log('Finger bones:', fingerNodes.length, '(0 = "no fingers" 41-bone skeleton)');

console.log('\nAll bones:');
boneNodes.forEach(n => console.log('  -', n.getName()));

console.log('\n=== MESHES ===');
for (const m of root.listMeshes()) {
  for (const p of m.listPrimitives()) {
    const pos = p.getAttribute('POSITION');
    const joints4 = p.getAttribute('JOINTS_0');
    const weights = p.getAttribute('WEIGHTS_0');
    console.log(`  prim: verts=${pos?.getCount() ?? 0} skinned=${!!joints4 && !!weights}`);
  }
}

console.log('\n=== ANIMATIONS ===');
for (const a of root.listAnimations()) {
  const channels = a.listChannels();
  const samplers = a.listSamplers();
  let dur = 0;
  for (const s of samplers) {
    const input = s.getInput();
    if (input) {
      const arr = input.getArray();
      if (arr && arr.length) dur = Math.max(dur, arr[arr.length - 1]);
    }
  }
  const targetedNodes = new Set();
  channels.forEach(c => { const n = c.getTargetNode(); if (n) targetedNodes.add(n.getName()); });
  console.log(`  "${a.getName()}" — duration: ${dur.toFixed(3)}s, channels: ${channels.length}, samplers: ${samplers.length}, target joints: ${targetedNodes.size}`);
  console.log(`  paths: ${[...new Set(channels.map(c => c.getTargetPath()))].join(', ')}`);
}
