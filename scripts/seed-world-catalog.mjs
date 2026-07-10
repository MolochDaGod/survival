#!/usr/bin/env node
/**
 * Manual D1 world catalog seed — runs against Cloudflare D1 REST API.
 * Requires: CF_ACCOUNT_ID, CLOUDFLARE_D1_OBJECTSTORE_ID, CF_D1_API (or CLOUDFLARE_USER_API)
 *
 * Usage: node scripts/seed-world-catalog.mjs
 * Or trigger via API: POST /api/world/reseed (admin token)
 */

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const apiServer = path.join(root, 'artifacts', 'api-server');

console.log('[seed-world-catalog] Building api-server…');
await new Promise((resolve, reject) => {
  const p = spawn('pnpm', ['run', 'build'], { cwd: apiServer, shell: true, stdio: 'inherit' });
  p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`build exit ${code}`))));
});

console.log('[seed-world-catalog] Triggering ensureWorldCatalog via one-shot node eval…');
const evalScript = `
import { ensureWorldCatalog } from './dist/lib/worldCatalog.mjs';
const state = await ensureWorldCatalog(console, true);
console.log(JSON.stringify(state, null, 2));
process.exit(state.available && state.seeded ? 0 : 1);
`;

await new Promise((resolve, reject) => {
  const p = spawn('node', ['--enable-source-maps', '-e', evalScript], {
    cwd: apiServer,
    shell: true,
    stdio: 'inherit',
    env: process.env,
  });
  p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`seed exit ${code}`))));
});

console.log('[seed-world-catalog] Done.');