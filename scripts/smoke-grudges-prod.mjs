/**
 * Production smoke for Grudges (website + client + API).
 *   node scripts/smoke-grudges-prod.mjs
 *   pnpm run smoke:prod
 */
const BASE = process.env.GRUDGES_SMOKE_BASE || 'https://grudges.grudge-studio.com';
const API = process.env.GRUDGES_SMOKE_API || 'https://survival-api-production.up.railway.app';

const PATHS = [
  '/',
  '/perks',
  '/perks.html',
  '/crafting',
  '/professions',
  '/main-panel',
  '/mapstarter',
  '/info.html',
  '/lore.html',
  '/icons/factions/banner_keepers.png',
  '/icons/factions/banners/keepers.png',
  '/icons/perks/stat-tiers/bio-t1.svg',
  '/icons/perks/warrior/1.png',
  '/data/grudges-systems.json',
  '/arpg-game/',
  '/arpg-game/index.html',
];

async function headOrGet(url) {
  try {
    let res = await fetch(url, { method: 'HEAD', redirect: 'follow' });
    if (res.status === 405 || res.status === 501) {
      res = await fetch(url, { method: 'GET', redirect: 'follow' });
    }
    return res;
  } catch (e) {
    return { ok: false, status: 0, error: e.message };
  }
}

async function main() {
  console.log('Smoke base:', BASE);
  let fail = 0;
  for (const p of PATHS) {
    const url = BASE + p;
    const res = await headOrGet(url);
    const ok = res.ok || res.status === 200;
    if (!ok) fail++;
    console.log(ok ? 'OK ' : 'FAIL', res.status || 'ERR', p, res.error || '');
  }

  // Catalog shape
  try {
    const cat = await (await fetch(BASE + '/data/grudges-systems.json')).json();
    const hasIcon =
      cat?.perks?.byStat?.bio?.[0]?.iconPath && cat?.perks?.byStat?.bio?.[0]?.tierBadge;
    console.log(hasIcon ? 'OK' : 'FAIL', 'catalog perk iconPath+tierBadge');
    if (!hasIcon) fail++;
    console.log('OK', 'productEra=', cat.productEra);
    if (cat.productEra !== 'voxel') {
      console.log('FAIL productEra expected voxel');
      fail++;
    }
  } catch (e) {
    console.log('FAIL catalog', e.message);
    fail++;
  }

  // API
  try {
    const h = await fetch(API + '/api/healthz');
    const body = await h.text();
    const ok = h.ok && /ok/i.test(body);
    console.log(ok ? 'OK' : 'FAIL', 'api health', h.status, body.slice(0, 80));
    if (!ok) fail++;
  } catch (e) {
    console.log('FAIL api', e.message);
    fail++;
  }

  // Same-origin systems API (static slices on Vercel; Railway may mirror later)
  for (const p of [
    '/api/systems',
    '/api/systems/overview',
    '/api/systems/perks',
    '/api/systems/professions',
    '/api/systems/crafting',
    '/api/systems/icons',
  ]) {
    try {
      const res = await fetch(BASE + p);
      const ok = res.ok;
      if (!ok) fail++;
      console.log(ok ? 'OK' : 'FAIL', res.status, 'website' + p);
      if (ok && p.endsWith('/overview')) {
        const j = await res.json();
        if (j?.canonicalHost !== 'https://grudges.grudge-studio.com') {
          fail++;
          console.log('FAIL overview canonicalHost', j?.canonicalHost);
        } else {
          console.log('OK overview canonicalHost');
        }
      }
    } catch (e) {
      fail++;
      console.log('FAIL website' + p, e.message);
    }
  }

  // Proxy via website (Railway health — accounts/characters still live there)
  try {
    const h = await fetch(BASE + '/api/healthz');
    console.log(h.ok ? 'OK' : 'FAIL', 'website /api/healthz proxy', h.status);
    if (!h.ok) fail++;
  } catch (e) {
    console.log('FAIL proxy', e.message);
    fail++;
  }

  // Optional: Railway may not have /api/systems until Docker redeploy
  try {
    const res = await fetch(API + '/api/systems/overview');
    console.log(
      res.ok ? 'OK' : 'WARN',
      res.status,
      'railway /api/systems/overview (optional until API redeploy)',
    );
  } catch (e) {
    console.log('WARN railway systems', e.message);
  }

  // survival → grudges 301
  try {
    const res = await fetch('https://survival.grudge-studio.com/perks', {
      redirect: 'manual',
    });
    const loc = res.headers.get('location') || '';
    const ok =
      (res.status === 301 || res.status === 308) &&
      loc.includes('grudges.grudge-studio.com');
    console.log(ok ? 'OK' : 'FAIL', 'survival→grudges redirect', res.status, loc);
    if (!ok) fail++;
  } catch (e) {
    fail++;
    console.log('FAIL survival redirect', e.message);
  }

  // R2 CDN (prefix path ≠ product era; locations at bucket root)
  const CDN = process.env.GRUDGES_SMOKE_CDN || 'https://assets.grudge-studio.com';
  for (const p of [
    '/locations/encampment.glb',
    '/grudge-nexus/models/characters/male/adventurer.gltf',
  ]) {
    try {
      const res = await headOrGet(CDN + p);
      const ok = res.ok || res.status === 200;
      if (!ok) fail++;
      console.log(ok ? 'OK' : 'FAIL', res.status || 'ERR', 'cdn' + p);
    } catch (e) {
      fail++;
      console.log('FAIL', 'cdn' + p, e.message);
    }
  }

  // Topology assets block should document R2 prefix
  try {
    const cat = await (await fetch(BASE + '/data/grudges-systems.json')).json();
    const prefix = cat?.topology?.assets?.r2KeyPrefix;
    const ok = prefix === 'grudge-nexus';
    console.log(ok ? 'OK' : 'FAIL', 'catalog r2KeyPrefix=', prefix);
    if (!ok) fail++;
  } catch (e) {
    console.log('FAIL catalog r2', e.message);
    fail++;
  }

  console.log(fail === 0 ? '\nSMOKE PASS' : `\nSMOKE FAIL (${fail})`);
  process.exit(fail === 0 ? 0 : 1);
}

main();
