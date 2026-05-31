#!/usr/bin/env node
/**
 * gen-asset-manifest — scans public/ and writes src/game/asset-manifest.json
 *
 * Mirrors the inline `gen:asset-manifest` script in package.json so it can
 * be invoked from any shell (Windows PowerShell included) without relying
 * on heredoc / inline-script syntax. Always run from artifacts/arpg-game.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const NS = '6ba7b810-9dad-11d1-80b4-00c04fd430c8'.replace(/-/g, '');

function v5(name) {
  const buf = Buffer.from(NS, 'hex');
  const hash = crypto.createHash('sha1');
  hash.update(buf);
  hash.update(Buffer.from(name));
  const d = hash.digest();
  d[6] = (d[6] & 0x0f) | 0x50;
  d[8] = (d[8] & 0x3f) | 0x80;
  const x = d.toString('hex');
  return [
    x.slice(0, 8), x.slice(8, 12), x.slice(12, 16),
    x.slice(16, 20), x.slice(20, 32),
  ].join('-');
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]
  );
}

const types = {
  gltf: 'model_gltf', glb: 'model_gltf',
  fbx:  'model_fbx',
  png:  'texture_png', jpg: 'texture_jpg',
  bin:  'bin',
};

const all = walk('public').filter((p) => {
  const e = p.split('.').pop().toLowerCase();
  return types[e];
});

const m = {};
for (const f of all) {
  const rel = f.replace(/\\/g, '/').replace(/^\/*/, '');
  const ext = rel.split('.').pop().toLowerCase();
  const id = v5(rel);
  m[id] = {
    id,
    name:     path.basename(rel, '.' + ext),
    path:     '/' + rel,
    type:     types[ext] ?? 'unknown',
    category: rel.split('/').slice(1, -1).join('/'),
  };
}

fs.writeFileSync('src/game/asset-manifest.json', JSON.stringify(m, null, 2));
console.log('Manifest: ' + Object.keys(m).length + ' assets');
