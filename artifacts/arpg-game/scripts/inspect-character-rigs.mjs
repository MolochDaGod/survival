import { NodeIO } from '@gltf-transform/core';
import { resolve } from 'node:path';

const files = process.argv.slice(2);
const io = new NodeIO();

for (const file of files) {
  console.log('\n' + '='.repeat(60));
  console.log('FILE:', file);
  console.log('='.repeat(60));

  const doc = await io.read(resolve(file));
  const root = doc.getRoot();
  const allNodes = root.listNodes();
  const skins = root.listSkins();
  const meshes = root.listMeshes();

  console.log(`Nodes: ${allNodes.length} | Meshes: ${meshes.length} | Skins: ${skins.length} | Anims: ${root.listAnimations().length}`);

  for (const skin of skins) {
    const joints = skin.listJoints();
    const fingerBones = joints.filter(j => /Finger|Thumb|Index|Middle|Ring|Pinky|Pink|f_index|f_middle|f_ring|f_pinky|f_thumb|hand_t|hand_i|hand_m|hand_r|hand_p/i.test(j.getName()));
    const conventions = {};
    for (const j of joints) {
      const n = j.getName();
      let conv = '(other)';
      if (/^mixamorig:/.test(n)) conv = 'mixamorig:';
      else if (/^DEF[-_]/.test(n)) conv = 'DEF- (Rigify deform)';
      else if (/^MCH[-_]/.test(n)) conv = 'MCH- (Rigify mechanism)';
      else if (/\.[LR]$/.test(n)) conv = '*.L/.R (Blender)';
      else if (/^(mixamo|spine|hips|hand|head)/i.test(n)) conv = 'lowercase';
      conventions[conv] = (conventions[conv] || 0) + 1;
    }
    console.log(`  Skin: ${joints.length} joints, ${fingerBones.length} finger-related`);
    console.log(`  Naming:`, conventions);
    console.log(`  Sample joints:`, joints.slice(0, 6).map(j => j.getName()).join(', '));
    if (fingerBones.length) {
      console.log(`  Finger bone names (first 8):`, fingerBones.slice(0, 8).map(j => j.getName()).join(', '));
    } else {
      console.log(`  → NO finger bones — mitten/no-fingers rig`);
    }
  }

  let totalVerts = 0;
  const primInfo = [];
  for (const m of meshes) {
    for (const p of m.listPrimitives()) {
      const v = p.getAttribute('POSITION')?.getCount() ?? 0;
      totalVerts += v;
      primInfo.push({ mesh: m.getName() || '(unnamed)', verts: v });
    }
  }
  console.log(`  Total verts: ${totalVerts} across ${primInfo.length} primitives`);
  primInfo.sort((a, b) => b.verts - a.verts).slice(0, 8).forEach(p => {
    console.log(`    ${p.verts.toString().padStart(5)}v  ${p.mesh}`);
  });
}
