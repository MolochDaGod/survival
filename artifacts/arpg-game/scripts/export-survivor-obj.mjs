import { NodeIO } from '@gltf-transform/core';
import * as fs from 'node:fs';
import * as path from 'node:path';

const SRC = '/home/runner/workspace/artifacts/arpg-game/public/models/characters/male_survivor_1.glb';
const OUT_DIR = '/home/runner/workspace/attached_assets/exports';
fs.mkdirSync(OUT_DIR, { recursive: true });
const OUT = path.join(OUT_DIR, 'male_survivor_1_tpose.obj');

const ident = () => [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
function mul(a, b) {
  const o = new Array(16);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
    o[c*4+r] = a[0*4+r]*b[c*4+0] + a[1*4+r]*b[c*4+1] + a[2*4+r]*b[c*4+2] + a[3*4+r]*b[c*4+3];
  }
  return o;
}
function fromTRS(t, r, s) {
  const [tx,ty,tz] = t || [0,0,0];
  const [qx,qy,qz,qw] = r || [0,0,0,1];
  const [sx,sy,sz] = s || [1,1,1];
  const xx=qx*qx, yy=qy*qy, zz=qz*qz;
  const xy=qx*qy, xz=qx*qz, yz=qy*qz;
  const wx=qw*qx, wy=qw*qy, wz=qw*qz;
  return [
    (1-2*(yy+zz))*sx, (2*(xy+wz))*sx,   (2*(xz-wy))*sx,   0,
    (2*(xy-wz))*sy,   (1-2*(xx+zz))*sy, (2*(yz+wx))*sy,   0,
    (2*(xz+wy))*sz,   (2*(yz-wx))*sz,   (1-2*(xx+yy))*sz, 0,
    tx, ty, tz, 1,
  ];
}
function applyMat(m, x, y, z, w) {
  return [
    m[0]*x + m[4]*y + m[8]*z  + m[12]*w,
    m[1]*x + m[5]*y + m[9]*z  + m[13]*w,
    m[2]*x + m[6]*y + m[10]*z + m[14]*w,
  ];
}

const io = new NodeIO();
const doc = await io.read(SRC);
const root = doc.getRoot();

const scene = root.listScenes()[0];
const worldOf = new Map();
function visit(node, parentMat) {
  const local = fromTRS(node.getTranslation(), node.getRotation(), node.getScale());
  const world = mul(parentMat, local);
  worldOf.set(node, world);
  for (const child of node.listChildren()) visit(child, world);
}
for (const n of scene.listChildren()) visit(n, ident());

const verts = [], norms = [], uvs = [], faces = [];
let vBase = 0, nBase = 0, tBase = 0, primCount = 0;

for (const node of [...worldOf.keys()]) {
  const mesh = node.getMesh();
  if (!mesh) continue;
  const wm = worldOf.get(node);
  for (const prim of mesh.listPrimitives()) {
    primCount++;
    const posA = prim.getAttribute('POSITION');
    const nrmA = prim.getAttribute('NORMAL');
    const uvA  = prim.getAttribute('TEXCOORD_0');
    const idx  = prim.getIndices();
    if (!posA) continue;

    const pos = posA.getArray();
    const nrm = nrmA?.getArray();
    const uv  = uvA?.getArray();
    const numV = posA.getCount();

    for (let i = 0; i < numV; i++) {
      const [x,y,z] = applyMat(wm, pos[i*3], pos[i*3+1], pos[i*3+2], 1);
      verts.push([x,y,z]);
      if (nrm) {
        const [nx,ny,nz] = applyMat(wm, nrm[i*3], nrm[i*3+1], nrm[i*3+2], 0);
        norms.push([nx,ny,nz]);
      }
      if (uv) uvs.push([uv[i*2], 1 - uv[i*2+1]]);
    }

    const indices = idx ? idx.getArray() : null;
    const triCount = (indices ? indices.length : numV) / 3;
    for (let t = 0; t < triCount; t++) {
      const a = indices ? indices[t*3]   : t*3;
      const b = indices ? indices[t*3+1] : t*3+1;
      const c = indices ? indices[t*3+2] : t*3+2;
      faces.push([a,b,c].map((i) => ({
        v: i + vBase + 1,
        t: uv ? (i + tBase + 1) : null,
        n: nrm ? (i + nBase + 1) : null,
      })));
    }

    vBase += numV;
    if (nrm) nBase += numV;
    if (uv)  tBase += numV;
  }
}

let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity,minZ=Infinity,maxZ=-Infinity;
for (const [x,y,z] of verts) {
  if (x<minX)minX=x; if (x>maxX)maxX=x;
  if (y<minY)minY=y; if (y>maxY)maxY=y;
  if (z<minZ)minZ=z; if (z>maxZ)maxZ=z;
}
const w = maxX-minX, h = maxY-minY, d = maxZ-minZ;
const aspect = w / h;
console.log(`Primitives=${primCount}  Verts=${verts.length}  Tris=${faces.length}`);
console.log(`Bounds: X(${minX.toFixed(2)}..${maxX.toFixed(2)} w=${w.toFixed(2)}) Y(${minY.toFixed(2)}..${maxY.toFixed(2)} h=${h.toFixed(2)}) Z(${minZ.toFixed(2)}..${maxZ.toFixed(2)} d=${d.toFixed(2)})`);
console.log(`Width/Height ratio: ${aspect.toFixed(2)}  (T-pose ≈ 1.0+, A-pose ≈ 0.5–0.7, idle ≈ 0.3)`);

const lines = [];
lines.push('# male_survivor_1 — bind pose, no rig');
lines.push('# exported for Mixamo auto-rigger');
lines.push(`# verts=${verts.length} tris=${faces.length}`);
lines.push('o male_survivor_1');
for (const [x,y,z] of verts) lines.push(`v ${x.toFixed(6)} ${y.toFixed(6)} ${z.toFixed(6)}`);
for (const [u,v] of uvs)     lines.push(`vt ${u.toFixed(6)} ${v.toFixed(6)}`);
for (const [x,y,z] of norms) lines.push(`vn ${x.toFixed(6)} ${y.toFixed(6)} ${z.toFixed(6)}`);
for (const f of faces) {
  const seg = f.map((c) => {
    if (c.t && c.n) return `${c.v}/${c.t}/${c.n}`;
    if (c.t)        return `${c.v}/${c.t}`;
    if (c.n)        return `${c.v}//${c.n}`;
    return `${c.v}`;
  }).join(' ');
  lines.push(`f ${seg}`);
}
fs.writeFileSync(OUT, lines.join('\n') + '\n');
console.log(`Wrote ${OUT} (${(fs.statSync(OUT).size/1024).toFixed(0)} KB)`);
