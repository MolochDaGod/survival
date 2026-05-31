#!/usr/bin/env node
/**
 * Triage attached_assets/ ZIPs: dedupe by base name, skip junk categories,
 * extract the keepers to attached_assets/_extracted/<bundle>/, then write a
 * JSON report at attached_assets/_extracted/_inventory.json.
 *
 * Usage:
 *   node scripts/triage-attached-assets.mjs           # dry-run (default)
 *   node scripts/triage-attached-assets.mjs --extract # actually extract
 */
import { readdirSync, statSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, join, basename, extname } from 'node:path';

const SRC = resolve('attached_assets');
const OUT = join(SRC, '_extracted');
const DO_EXTRACT = process.argv.includes('--extract');

// Bundles to hard-skip: useless for our web/three.js engine.
const SKIP_PATTERNS = [
  /^ARPG_.*WebGL/i,         // compiled Unity WebGL build
  /^Blend_Files/i,           // .blend source, not web-loadable
  /^MDA_Hatchery/i,          // Unity package
  /^TestingOverhead/i,       // Unity package
  /^toonshading/i,           // 0 bytes
  /^horror-game-floor-generator/i, // Unity-only tool
  /^craftpix-896711-rpg-game-ui/i, // UI icon mega-pack, we have catalog
  /-achievement-rpg-icon/i,  // achievement icon packs (5 dupes, ~500 MB total)
];

// Strip the trailing _1234567890.zip timestamp suffix to find duplicates.
function baseName(zipName) {
  return zipName
    .replace(/\.zip$/i, '')
    .replace(/_\d{10,}$/i, '')                // _1776382336084
    .replace(/-\d{8}T\d{6}Z-\d-\d{3}$/i, '')  // -20260501T061446Z-3-001
    .replace(/_\(\d+\)$/i, '');                // _(2)
}

const zips = readdirSync(SRC)
  .filter(n => n.toLowerCase().endsWith('.zip'))
  .map(n => ({ name: n, path: join(SRC, n), size: statSync(join(SRC, n)).size }));

// Group by base name, keep largest copy (or newest if sizes equal).
const groups = new Map();
for (const z of zips) {
  const key = baseName(z.name);
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(z);
}

const keepers = [];
const skipped = [];
const dupes = [];
for (const [key, list] of groups) {
  list.sort((a, b) => b.size - a.size);
  const winner = list[0];
  const isJunk = SKIP_PATTERNS.some(rx => rx.test(key));
  if (isJunk) {
    skipped.push({ key, reason: 'junk-category', count: list.length, size: winner.size });
    continue;
  }
  keepers.push({ key, name: winner.name, path: winner.path, size: winner.size });
  for (const loser of list.slice(1)) dupes.push({ kept: winner.name, dropped: loser.name, sizeDelta: 0 });
}

keepers.sort((a, b) => a.key.localeCompare(b.key));
const totalKeepMB = keepers.reduce((s, k) => s + k.size, 0) / 1024 / 1024;
const totalSkipMB = skipped.reduce((s, k) => s + k.size, 0) / 1024 / 1024;

console.log(`Found ${zips.length} ZIPs / ${groups.size} unique bundles`);
console.log(`  Keepers: ${keepers.length} (~${totalKeepMB.toFixed(0)} MB)`);
console.log(`  Skipped junk: ${skipped.length} (~${totalSkipMB.toFixed(0)} MB)`);
console.log(`  Dupes auto-dropped: ${dupes.length}`);
console.log('');
console.log('KEEPERS (' + (DO_EXTRACT ? 'WILL EXTRACT' : 'dry-run') + '):');
keepers.forEach(k => console.log(`  [${(k.size/1024/1024).toFixed(1).padStart(7)} MB]  ${k.key}`));
console.log('');
console.log('SKIPPED JUNK:');
skipped.forEach(s => console.log(`  ${s.key.padEnd(60)} (${s.count}× copies, ${(s.size/1024/1024).toFixed(0)} MB each, reason: ${s.reason})`));

if (!DO_EXTRACT) {
  console.log('\nDry-run only. Re-run with --extract to actually unzip.');
  process.exit(0);
}

if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

const report = { extracted: [], failed: [] };
for (const k of keepers) {
  const destDir = join(OUT, k.key);
  if (existsSync(destDir)) {
    console.log(`SKIP (exists): ${k.key}`);
    report.extracted.push({ key: k.key, dest: destDir, status: 'already-extracted' });
    continue;
  }
  mkdirSync(destDir, { recursive: true });
  console.log(`EXTRACT: ${k.name} -> ${destDir}`);
  try {
    execFileSync('powershell.exe', ['-NoProfile', '-Command', `Expand-Archive -LiteralPath '${k.path}' -DestinationPath '${destDir}' -Force`], { stdio: 'inherit' });
    // Tally extracted contents
    const counts = walkCount(destDir);
    report.extracted.push({ key: k.key, dest: destDir, status: 'ok', counts });
  } catch (err) {
    console.error(`  ! failed: ${err.message}`);
    report.failed.push({ key: k.key, error: String(err.message).slice(0, 200) });
  }
}

writeFileSync(join(OUT, '_inventory.json'), JSON.stringify(report, null, 2));
console.log(`\nReport: ${join(OUT, '_inventory.json')}`);

function walkCount(dir) {
  const counts = {};
  let total = 0;
  function walk(d) {
    let entries; try { entries = readdirSync(d); } catch { return; }
    for (const n of entries) {
      const p = join(d, n);
      let s; try { s = statSync(p); } catch { continue; }
      if (s.isDirectory()) walk(p);
      else { const ext = (extname(n) || '<none>').toLowerCase(); counts[ext] = (counts[ext] || 0) + 1; total++; }
    }
  }
  walk(dir);
  return { total, byExt: counts };
}
