#!/usr/bin/env node
/**
 * Walk attached_assets/_extracted/ and produce a unified inventory:
 * counts per bundle, useful 3D file counts, total size, top model files
 * by size. Output to stdout and to _extracted/_full_inventory.json.
 */
import { readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, extname } from 'node:path';

const ROOT = 'attached_assets/_extracted';
const USEFUL_3D = new Set(['.glb', '.fbx', '.gltf', '.obj', '.dae']);
const TEX = new Set(['.png', '.jpg', '.jpeg', '.webp']);

function walk(dir, acc) {
  let entries;
  try { entries = readdirSync(dir); } catch { return; }
  for (const n of entries) {
    const p = join(dir, n);
    let s; try { s = statSync(p); } catch { continue; }
    if (s.isDirectory()) walk(p, acc);
    else {
      const ext = extname(n).toLowerCase();
      acc.byExt[ext] = (acc.byExt[ext] || 0) + 1;
      acc.total++;
      acc.size += s.size;
      if (USEFUL_3D.has(ext)) {
        acc.useful++;
        acc.usefulFiles.push({ path: p.replace(/\\/g, '/'), size: s.size, ext });
      }
      if (TEX.has(ext)) acc.tex++;
    }
  }
}

const bundles = readdirSync(ROOT, { withFileTypes: true })
  .filter(d => d.isDirectory() && !d.name.startsWith('_'))
  .map(d => d.name);

const report = [];
for (const b of bundles) {
  const acc = { total: 0, useful: 0, tex: 0, size: 0, byExt: {}, usefulFiles: [] };
  walk(join(ROOT, b), acc);
  report.push({ bundle: b, ...acc });
}

report.sort((a, b) => b.useful - a.useful);
console.log('=== UNIFIED INVENTORY ===\n');
console.log(`Bundles: ${report.length}`);
const grandTotal = report.reduce((s, r) => s + r.total, 0);
const grandSize = report.reduce((s, r) => s + r.size, 0);
const grandUseful = report.reduce((s, r) => s + r.useful, 0);
console.log(`Files total: ${grandTotal} | useful 3D: ${grandUseful} | size: ${(grandSize/1024/1024).toFixed(0)} MB`);
console.log('');
console.log('BY USEFUL 3D COUNT:');
for (const r of report) {
  const b = r.byExt;
  const parts = ['glb','fbx','gltf','obj','dae','png'].map(k => b['.'+k] ? `${k}:${b['.'+k]}` : '').filter(Boolean).join(' ');
  console.log(`  ${r.bundle.padEnd(56)} useful=${String(r.useful).padStart(4)} ${(r.size/1024/1024).toFixed(1).padStart(7)}MB  ${parts}`);
}

writeFileSync(join(ROOT, '_full_inventory.json'), JSON.stringify(
  report.map(r => ({ ...r, usefulFiles: r.usefulFiles.slice(0, 50) })), // cap for size
  null, 2
));
console.log(`\nWrote: ${ROOT}/_full_inventory.json`);
