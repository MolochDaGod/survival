/**
 * Export static catalog JSON for website perks / crafting / professions pages.
 * Reads arpg-game + game-systems sources — does not invent systems.
 *
 *   node scripts/export-grudges-systems.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'artifacts/website/public/data/grudges-systems.json');
/** Bundled into Railway API (`/api/systems*`) — keep in sync with website public data. */
const OUT_API = path.join(ROOT, 'artifacts/api-server/src/data/grudges-systems.json');

// ── Import live game-systems (TS via Node may fail — inline SSOT mirror) ──
// Prefer dynamic import of built JS; fall back to parsing TS source lightly.

const STAT_KEYS = ['bio', 'neu', 'kin', 'qnt', 'syn', 'chr', 'ent', 'gra'];
const STAT_META = [
  { key: 'bio', abbr: 'BIO', label: 'Biomass', color: '#4caf50', archetype: 'Survivor / Forager / Field Medic' },
  { key: 'neu', abbr: 'NEU', label: 'Neural Integrity', color: '#00bcd4', archetype: 'Hacker / Scout / Sniper' },
  { key: 'kin', abbr: 'KIN', label: 'Kinetic Efficiency', color: '#ff9800', archetype: 'Bladesman / Gunfighter / Sprinter' },
  { key: 'qnt', abbr: 'QNT', label: 'Quantum Aptitude', color: '#9c27b0', archetype: 'Salvager / Anomaly Hunter' },
  { key: 'syn', abbr: 'SYN', label: 'Synthetic Affinity', color: '#2196f3', archetype: 'Architect / Drone Master' },
  { key: 'chr', abbr: 'CHR', label: 'Chronal Stability', color: '#c9a000', archetype: 'Chrono-Operative' },
  { key: 'ent', abbr: 'ENT', label: 'Entropic Resistance', color: '#f44336', archetype: 'Reclaimer / Preserver' },
  { key: 'gra', abbr: 'GRA', label: 'Gravitic Harmony', color: '#009688', archetype: 'Orbital Specialist' },
];

function parseMilestonePerks(tsPath) {
  const src = fs.readFileSync(tsPath, 'utf8');
  const out = {};
  for (const key of STAT_KEYS) {
    const re = new RegExp(`${key}:\\s*\\[([\\s\\S]*?)\\],\\s*\\n\\s*(?:neu|kin|qnt|syn|chr|ent|gra|\\})`, 'm');
    const m = src.match(re);
    if (!m) {
      // last key gra
      const re2 = new RegExp(`${key}:\\s*\\[([\\s\\S]*?)\\],\\s*\\n\\};`, 'm');
      const m2 = src.match(re2);
      if (!m2) {
        out[key] = [];
        continue;
      }
      out[key] = extractPerks(m2[1], key);
      continue;
    }
    out[key] = extractPerks(m[1], key);
  }
  return out;
}

/**
 * Milestone perk art — existing on-disk packs (no invented assets).
 *  - tier badge: /icons/perks/stat-tiers/{stat}-t{n}.svg
 *  - flavor art: warrior / maker / smarts / hero packs (30 each)
 */
const STAT_ART_PACK = {
  bio: 'hero',
  neu: 'smarts',
  kin: 'warrior',
  qnt: 'smarts',
  syn: 'maker',
  chr: 'hero',
  ent: 'maker',
  gra: 'warrior',
};

function extractPerks(block, statKey) {
  const perks = [];
  const re = /perkName:\s*'([^']+)'[\s\S]*?perkDesc:\s*'([^']+)'[\s\S]*?icon:\s*'([^']+)'/g;
  let m;
  while ((m = re.exec(block))) {
    const tier = perks.length + 1;
    const pack = STAT_ART_PACK[statKey] || 'hero';
    // Packs are 1..30; map tier 1–6 into a distinct slot per stat
    const packIndex = ((STAT_KEYS.indexOf(statKey) * 6 + tier - 1) % 30) + 1;
    perks.push({
      name: m[1],
      desc: m[2],
      icon: m[3],
      tier,
      iconPath: `/icons/perks/${pack}/${packIndex}.png`,
      tierBadge: `/icons/perks/stat-tiers/${statKey}-t${tier}.svg`,
    });
  }
  return perks;
}

function parseRecipes(tsPath) {
  if (!fs.existsSync(tsPath)) return [];
  const src = fs.readFileSync(tsPath, 'utf8');
  // RECIPES array entries: { id: '...', name: '...', station: '...', ...
  const recipes = [];
  const re =
    /\{\s*id:\s*'([^']+)'\s*,\s*name:\s*'([^']+)'[\s\S]*?station:\s*'([^']+)'([\s\S]*?)(?=\n\s*\{|\n\s*\];)/g;
  let m;
  while ((m = re.exec(src))) {
    const id = m[1];
    const name = m[2];
    const station = m[3];
    const body = m[4] || '';
    const inputs = [];
    // Recipes.ts uses qty; some packs use count
    const inRe = /\{\s*itemId:\s*'([^']+)'\s*,\s*(?:qty|count):\s*(\d+)/g;
    let im;
    while ((im = inRe.exec(body))) inputs.push({ itemId: im[1], count: +im[2] });
    const outM =
      body.match(/outputs?:\s*\[\s*\{\s*itemId:\s*'([^']+)'\s*,\s*(?:qty|count):\s*(\d+)/) ||
      body.match(/output:\s*\{\s*itemId:\s*'([^']+)'\s*,\s*(?:qty|count):\s*(\d+)/);
    recipes.push({
      id,
      name,
      station,
      inputs,
      output: outM ? { itemId: outM[1], count: +outM[2] } : null,
    });
  }
  // fallback simpler
  if (!recipes.length) {
    const simple = [...src.matchAll(/id:\s*'([^']+)'\s*,\s*name:\s*'([^']+)'/g)];
    for (const s of simple.slice(0, 200)) {
      recipes.push({ id: s[1], name: s[2], station: 'workbench', inputs: [], output: null });
    }
  }
  return recipes;
}

function parseProfessionMeta(tsPath) {
  const src = fs.readFileSync(tsPath, 'utf8');
  const meta = [];
  const re =
    /(\w+):\s*\{\s*id:\s*"(\w+)"\s*,\s*label:\s*"([^"]+)"\s*,\s*blurb:\s*"([^"]+)"\s*,\s*color:\s*"([^"]+)"\s*,\s*icon:\s*"([^"]+)"/g;
  let m;
  while ((m = re.exec(src))) {
    meta.push({
      id: m[2],
      label: m[3],
      blurb: m[4],
      color: m[5],
      icon: m[6],
    });
  }
  return meta;
}

function parseBranches(tsPath) {
  const src = fs.readFileSync(tsPath, 'utf8');
  // PROFESSION_BRANCHES structure
  const branches = {};
  const profIds = ['gathering', 'hunting', 'crafting', 'township', 'survival', 'chemistry', 'combat'];
  for (const pid of profIds) {
    const re = new RegExp(`${pid}:\\s*\\[([\\s\\S]*?)\\],\\s*\\n\\s*(?:hunting|crafting|township|survival|chemistry|combat|\\})`, 'm');
    let m = src.match(re);
    if (!m && pid === 'combat') {
      m = src.match(/combat:\s*\[([\s\S]*?)\],\s*\n\s*\};/);
    }
    branches[pid] = [];
    if (!m) continue;
    const block = m[1];
    const bre = /id:\s*"([^"]+)"\s*,\s*label:\s*"([^"]+)"/g;
    let bm;
    while ((bm = bre.exec(block))) {
      branches[pid].push({ id: bm[1], label: bm[2] });
    }
  }
  return branches;
}

const perksPath = path.join(ROOT, 'artifacts/arpg-game/src/game/CharacterConfig.ts');
const recipesPath = path.join(ROOT, 'artifacts/arpg-game/src/game/survival/Recipes.generated.ts');
const profPath = path.join(ROOT, 'artifacts/arpg-game/src/game/progression/Professions.ts');

const milestonePerks = parseMilestonePerks(perksPath);
const recipes = parseRecipes(recipesPath);
const professions = parseProfessionMeta(profPath);
const branches = parseBranches(profPath);

const stations = [
  { id: 'forge', name: 'Forge', profession: 'crafting', desc: 'Weapons & heavy armor. Ore + fuel.', icon: 'forge' },
  { id: 'workbench', name: 'Workbench', profession: 'crafting', desc: 'Wood items, bows, tools.', icon: 'bench' },
  { id: 'alchemy', name: 'Alchemy Table', profession: 'chemistry', desc: 'Potions, elixirs, poisons, oils.', icon: 'alchemy' },
  { id: 'loom', name: 'Loom', profession: 'crafting', desc: 'Cloth armor, capes, bags.', icon: 'loom' },
  { id: 'tannery', name: 'Tannery', profession: 'hunting', desc: 'Leather from hides.', icon: 'tannery' },
  { id: 'enchanting', name: 'Enchanting Altar', profession: 'chemistry', desc: 'Enchantments, runes, enhancements.', icon: 'enchant' },
  { id: 'campfire', name: 'Campfire', profession: 'survival', desc: 'Cooking, basic survival crafts.', icon: 'fire' },
  { id: 'build', name: 'Build Hammer', profession: 'township', desc: 'Camp structures & defenses.', icon: 'build' },
];

const buildables = [
  { id: 'foundation', name: 'Foundation', tier: 'Camp', station: 'build', desc: '1 m modular floor slab' },
  { id: 'wall', name: 'Wall', tier: 'Camp', station: 'build', desc: 'Palisade / wall section' },
  { id: 'door', name: 'Door', tier: 'Camp', station: 'build', desc: 'Entry with latch' },
  { id: 'window', name: 'Window', tier: 'Camp', station: 'build', desc: 'Open wall module' },
  { id: 'stairs', name: 'Stairs', tier: 'Camp', station: 'build', desc: 'Vertical access' },
  { id: 'roof', name: 'Roof', tier: 'Camp', station: 'build', desc: 'Weather cover' },
  { id: 'workbench_place', name: 'Workbench', tier: 'Camp', station: 'build', desc: 'Crafting station placeable' },
  { id: 'chest', name: 'Storage Chest', tier: 'Camp', station: 'build', desc: 'Camp inventory' },
  { id: 'bed', name: 'Bed', tier: 'Camp', station: 'build', desc: 'Respawn anchor' },
  { id: 'banner', name: 'Banner', tier: 'Tribe', station: 'build', desc: 'Morale aura' },
  { id: 'recruit_post', name: 'Recruit Post', tier: 'Tribe', station: 'build', desc: 'Hire NPCs' },
  { id: 'cooking_pot', name: 'Shared Cooking Pot', tier: 'Tribe', station: 'build', desc: 'Passive food regen' },
  { id: 'trade_post', name: 'Trade Post', tier: 'Village', station: 'build', desc: 'Caravan gold / day' },
  { id: 'embassy', name: 'Embassy', tier: 'Village', station: 'build', desc: 'Faction diplomacy' },
  { id: 'palisade', name: 'Palisade', tier: 'Village', station: 'build', desc: 'Tier-2 wall' },
  { id: 'watchtower', name: 'Watchtower', tier: 'Village', station: 'build', desc: 'Defense + vision' },
  { id: 'bazaar', name: 'Bazaar', tier: 'Town', station: 'build', desc: '3 rare vendor slots' },
  { id: 'keep', name: 'Fortress Keep', tier: 'Town', station: 'build', desc: 'Tier-3 core' },
  { id: 'auto_turret', name: 'Auto-Turret', tier: 'Town', station: 'build', desc: 'Deployed defense' },
  { id: 'gate', name: 'Gate', tier: 'Town', station: 'build', desc: 'Controlled entry' },
];

const settlementTiers = [
  { id: 'camp', name: 'Camp', allies: '1–4', unlocks: 'Workbench, chest, bed. Manual harvest.' },
  { id: 'tribe', name: 'Tribe', allies: '5+', unlocks: 'Cooking pot, morale aura, +50 township XP.' },
  { id: 'village', name: 'Village', allies: '10+', unlocks: 'Trade Post, tier-2 schematics, +80 XP.' },
  { id: 'town', name: 'Town', allies: '20+', unlocks: 'Bazaar, keep, turret, gate, Town Banner, +120 XP.' },
  { id: 'stronghold', name: 'Stronghold', allies: '30+', unlocks: 'Full fortress kit, multi-banner claim.' },
];

const catalog = {
  version: '1.0.0',
  generatedAt: new Date().toISOString(),
  product: 'Grudges · Voxel-era lead survival MMO',
  productEra: 'voxel',
  productNote:
    'Hard decision: Grudges is voxel-era only (main/lead voxel game). Nexus product era deferred. BIO…GRA remain the attribute system name.',
  links: {
    info: '/info.html',
    camp: '/info.html#camp',
    lore: '/lore.html',
    stats: '/stats-guide.html',
    mainPanel: '/main-panel',
    perks: '/perks',
    crafting: '/crafting',
    professions: '/professions',
    mapstarter: '/mapstarter',
    play: '/arpg-game/',
    factions: '/icons/factions/banners/',
    eraDoc: 'docs/PRODUCT_ERA_VOXEL.md',
    productionSsot: 'docs/PRODUCTION_SSOT.md',
  },
  topology: {
    product: 'Grudges',
    productEra: 'voxel',
    client: {
      host: 'grudges.grudge-studio.com',
      path: '/arpg-game/',
      repo: 'artifacts/arpg-game',
      hud: ['HUD.tsx (CraftPix unit frames)', 'MainPanel.tsx (C hub)', 'SurvivalHUD.tsx', 'WorldMapOverlay.tsx'],
    },
    website: {
      host: 'grudges.grudge-studio.com',
      repo: 'artifacts/website',
      pages: ['/', '/perks', '/crafting', '/professions', '/main-panel', '/mapstarter', '/info.html', '/lore.html'],
    },
    api: {
      host: 'survival-api-production.up.railway.app',
      proxy: '/api/* → Railway (also via grudges.grudge-studio.com/api/*)',
      health: '/api/healthz',
      systems: '/api/systems',
      systemsOverview: '/api/systems/overview',
      systemsPerks: '/api/systems/perks',
      systemsProfessions: '/api/systems/professions',
      systemsCrafting: '/api/systems/crafting',
      systemsIcons: '/api/systems/icons',
      canonicalWeb: 'https://grudges.grudge-studio.com',
      survivalRedirect: 'https://survival.grudge-studio.com → 301 → grudges.grudge-studio.com',
    },
    identity: {
      sso: 'id.grudge-studio.com',
      characters: 'era=voxel for Grudges roster',
      foundry: 'character.grudge-studio.com create era=voxel',
    },
    assets: {
      cdn: 'assets.grudge-studio.com',
      r2Bucket: 'grudge-assets',
      /** Historical R2 key prefix — NOT product era (product era = voxel). */
      r2KeyPrefix: 'grudge-nexus',
      viteCdnEnv: 'VITE_ASSET_CDN_URL=https://assets.grudge-studio.com/grudge-nexus',
      locationsAtBucketRoot: true,
      d1: 'asset index only (skill grudge-d1-r2) — never player roster',
      playerSsot: 'Railway Postgres via survival-api-production',
      syncScript: 'node scripts/sync-assets-to-r2.mjs',
      localPublic: 'artifacts/arpg-game/public + website/public',
      factionBanners: '/icons/factions/banners/{id}.png',
      perkArt: '/icons/perks/{hero|warrior|smarts|maker}/{1-30}.png',
      perkTiers: '/icons/perks/stat-tiers/{stat}-t{1-6}.svg',
      hudUi: '/textures/ui/unit-frames/* (CraftPix)',
      hubMap: 'locations/encampment.glb',
      worldHeightSsot: 'world/WorldGen.worldHeight + GroundSampler.groundY',
    },
    world: {
      sizeKm: 20,
      halfM: 10000,
      arenaPadM: 50,
      hubNoCampM: 220,
      enemySpawnSafeM: 80,
      sectors: 9,
      safeZoneId: 'grid_convergence',
      safeZoneName: 'Convergence Hub',
      heightSsot: 'worldHeight',
      terrainLessons: 'docs/SNAKEY_TERRAIN_LESSONS.md',
      productionWorld: 'docs/PRODUCTION_WORLD_VOXEL.md',
      bootLayers: [
        'hub encampment GLB',
        'procedural chunks',
        'sector terrain patches',
        'island docks',
        'deploy gate',
        'resources / camps outside hub',
      ],
    },
  },
  stats: STAT_META,
  perks: {
    description: '6 milestone perks per Nexus attribute (BIO…GRA). Unlocks as you allocate ranks 1–6.',
    byStat: milestonePerks,
    art: {
      note: 'iconPath + tierBadge resolved at export from on-disk packs — do not invent new folders.',
      packs: STAT_ART_PACK,
      tierBadgePattern: '/icons/perks/stat-tiers/{stat}-t{tier}.svg',
    },
    tracks: [
      { id: 'hero', label: 'Hero', color: '#ff7d87' },
      { id: 'warrior', label: 'Warrior', color: '#ffb16d' },
      { id: 'smarts', label: 'Smarts', color: '#bb95ff' },
      { id: 'maker', label: 'Maker', color: '#49de95' },
    ],
  },
  crafting: {
    stations,
    recipes,
    tiers: [
      { tier: 1, label: 'Scrap', color: '#8b7355' },
      { tier: 2, label: 'Salvaged', color: '#a8a8a8' },
      { tier: 3, label: 'Refined', color: '#4a9eff' },
      { tier: 4, label: 'Forged', color: '#9d4dff' },
      { tier: 5, label: 'Relic', color: '#ff4d4d' },
      { tier: 6, label: 'Ascendant', color: '#ffaa00' },
      { tier: 7, label: 'Ancient', color: '#d4a84b' },
      { tier: 8, label: 'Legendary', color: '#f0d890' },
    ],
    enhancements: [
      { id: 'enchant_oil', name: 'Enchanting Oil', station: 'alchemy', desc: 'Temporary weapon enchant' },
      { id: 'rune_socket', name: 'Rune Socket', station: 'enchanting', desc: 'Permanent gear socket' },
      { id: 'repair_kit', name: 'Repair Kit', station: 'workbench', desc: 'Restore durability (ENT affinity)' },
      { id: 'quality_up', name: 'Quality Hone', station: 'forge', desc: 'Craft quality bonus (SYN)' },
    ],
  },
  professions: {
    list: professions,
    branches,
    note: '7 professions × 5 branches × ranks + Master = 147 skills. XP per profession, independent of level skillPoints.',
  },
  township: {
    tiers: settlementTiers,
    buildables,
    campDoc: '/info.html#camp',
    note:
      'Settlement “allies” = recruit population, not a crafting filter. Fighters = combat allies.',
  },
  /**
   * Combat power — primary MMO power fantasy (not craft-for-allies).
   * @see docs/COMBAT_POWER_SSOT.md
   */
  combatPower: {
    note: 'Crafting feeds weapons/armor into this loop. Allies that fight use fighter roles, not craft stations.',
    pillars: [
      {
        id: 'weapons',
        label: 'Weapons',
        systems: ['WEAPONS catalog', 'weapon combos', 'WeaponAttachment sockets', 'SlashWave residual'],
        files: ['constants.ts WEAPONS', 'AnimationRegistry combos', 'WeaponAttachment.ts', 'SlashWaveField'],
      },
      {
        id: 'upgrades',
        label: 'Upgrades',
        systems: ['BIO…GRA milestones', 'hero/warrior/smarts/maker tracks', 'gear tiers T1–T8'],
        files: ['CharacterConfig milestones', 'StatPerkChoices', 'crafting tiers'],
      },
      {
        id: 'mobility',
        label: 'Mobility',
        systems: ['roll/dodge', 'slide', 'sprint', 'climb', 'swim', 'focus strafe'],
        files: ['PlayerController', 'ClimbController', 'SwimController'],
      },
      {
        id: 'effects',
        label: 'Effects / VFX',
        systems: ['AbilitySystem projectiles', 'CombatVfxBridge', 'noise spheres', 'ice/fire flares'],
        files: ['AbilitySystem.ts', 'CombatVfxBridge.ts'],
      },
      {
        id: 'procs',
        label: 'Procs',
        systems: ['profession passives (crit, damage, gadget crit)', 'milestone effect bags'],
        files: ['ProfessionsService', '@workspace/game-systems perks'],
      },
      {
        id: 'defensives',
        label: 'Defensives',
        systems: ['block/parry by weapon', 'roll i-frames', 'BIO/ENT survivability', 'armor crafts'],
        files: ['PlayerController block', 'AnimationRegistry block clips'],
      },
      {
        id: 'allies_combat',
        label: 'Allies (combat)',
        systems: ['mercenary', 'captain', 'sentry', 'gate_guard', 'gunner'],
        files: ['TownshipSystem NPC_ROLES family fighter', 'CitySpawner.assignRole'],
      },
    ],
    allyFamilies: {
      fighter: ['sentry', 'gate_guard', 'gunner', 'captain', 'mercenary'],
      harvester: ['woodcutter', 'miner', 'farmer', 'forager', 'trapper'],
      vendor: ['stall', 'caravan_master', 'fence', 'bazaar_merchant'],
      diplomacy: ['diplomat'],
    },
    abilitiesHotkeys: [
      '1–5 classic AbilitySystem',
      '6–0 linear skillshots (frost/storm/cinder/nova/snare)',
      '[ ] cycle linear variant',
      'LMB attack combo',
      'RMB focus toggle',
      'block key',
      'roll/slide',
    ],
    linearCasts: {
      source: 'https://github.com/MolochDaGod/LinearAbiltyCastingThreeJS',
      doc: 'docs/VOXEL_LINEAR_CAST_SSOT.md',
      ids: ['frost_lance', 'storm_lance', 'cinder_fall', 'nova_beam', 'voltaic_snare'],
      destruction: 'PinataDebrisField + BreakableWallSystem',
    },
    doc: 'docs/COMBAT_POWER_SSOT.md',
  },
  aiWorker: {
    deploy: {
      project: 'survival (grudgenexus)',
      urls: [
        'grudges.grudge-studio.com (canonical)',
        'survival.grudge-studio.com (301 → grudges)',
        'survival-grudgenexus.vercel.app (preview alias)',
      ],
      command:
        'pnpm run export:systems && pnpm run build:website && pnpm run build:game && node scripts/vercel-prebuilt.mjs && vercel deploy --prebuilt --prod --yes',
      smoke: 'node scripts/smoke-grudges-prod.mjs',
      output: '.vercel/output/static (website + /arpg-game)',
      api: 'Railway survival-api-production (not redeployed by Vercel client ship)',
      eras: {
        voxel:
          'Grudges = LEAD voxel-era MMO (era=voxel characters). Mine-Loader/GRUDOX support the same era — tools/launcher, not a competing main title.',
        nexus_deferred: 'Separate nexus product/era — undecided; do not default Grudges here',
        warlords: 'Separate brand — never mix into Grudges play roster',
      },
    },
    bestPractices: [
      'Grudges product era is voxel only (docs/PRODUCT_ERA_VOXEL.md + docs/PRODUCTION_SSOT.md)',
      'Characters: era=voxel in config — not warlords; not era=nexus until owner reopens it',
      'R2 prefix grudge-nexus = CDN path only; do not invent grudge-voxel/ parallel keys',
      'D1 = asset index; Railway Postgres = player accounts/characters/bag',
      'Never invent parallel inventory — createInventoryItem / MainPanel bag',
      'Attribute SSOT: @workspace/game-systems nexusDerived (BIO…GRA names stay)',
      'Perks art: use /icons/perks packs + stat-tiers — export writes iconPath',
      'HUD: CraftPix unit-frames + MainPanel C — skill craftpix-rpg-mmo-ui',
      'Faction identity: /icons/factions/banners + FactionBannerFlag',
      'Camp/build: info.html#camp settlement tiers + township profession',
      'Deploy: always build:website + build:game before prebuilt; API is Railway separate',
      'Owl Form = leathern_drake land mount, not bird mesh',
    ],
  },
};

const body = JSON.stringify(catalog, null, 2);
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, body);
fs.mkdirSync(path.dirname(OUT_API), { recursive: true });
fs.writeFileSync(OUT_API, body);

/** Same-origin /api/systems* slices (Vercel static until Railway ships systems router). */
const DATA_DIR = path.dirname(OUT);
const EXPLAIN = {
  product:
    'Grudges is the voxel-era lead survival MMO. Canonical host: grudges.grudge-studio.com. survival.grudge-studio.com 301-redirects here.',
  perks:
    'Eight Nexus attributes (BIO…GRA), six milestone perks each. Flavor art from /icons/perks/{hero|warrior|smarts|maker}/1-30.png; tier badges from /icons/perks/stat-tiers/{stat}-t{1-6}.svg.',
  professions:
    'Seven professions (gathering, hunting, crafting, township, survival, chemistry, combat). Five branches each plus Master — 147 skills. Profession XP is independent of level skillPoints / PerksBook.',
  crafting:
    'Stations gate recipes. Recipe inputs/outputs use SurvivalItems ids. Crafting feeds weapons/armor into combat power — it is not a second ally filter.',
  icons:
    'Website serves /icons/* from the Grudges deploy. Faction banners: /icons/factions/banners/{id}.png. Prefer existing pack slots; do not invent new icon folders.',
  township:
    'Settlement tiers Camp → Tribe → Village → Town → Stronghold scale with recruit population. Buildables unlock by tier.',
  api:
    'This catalog is read-only definitions. Player bag/XP/characters stay on Railway Postgres via /api/accounts|/api/characters|/api/savegame.',
};

const slices = {
  'systems-overview.json': {
    product: catalog.product,
    productEra: catalog.productEra,
    productNote: catalog.productNote,
    generatedAt: catalog.generatedAt,
    version: catalog.version,
    canonicalHost: 'https://grudges.grudge-studio.com',
    aliasRedirect: {
      from: 'https://survival.grudge-studio.com',
      to: 'https://grudges.grudge-studio.com',
      status: 301,
    },
    links: catalog.links,
    topology: catalog.topology,
    stats: catalog.stats,
    explain: EXPLAIN,
    endpoints: {
      full: '/api/systems',
      overview: '/api/systems/overview',
      perks: '/api/systems/perks',
      professions: '/api/systems/professions',
      crafting: '/api/systems/crafting',
      icons: '/api/systems/icons',
      township: '/api/systems/township',
      combat: '/api/systems/combat',
      statsCatalog: '/api/stats/catalog',
      engineManifest: '/api/engine/manifest',
      staticCatalog: '/data/grudges-systems.json',
    },
  },
  'systems-perks.json': { explain: EXPLAIN.perks, docs: { page: '/perks', guide: '/stats-guide.html' }, ...catalog.perks },
  'systems-professions.json': { explain: EXPLAIN.professions, docs: { page: '/professions' }, ...catalog.professions },
  'systems-crafting.json': { explain: EXPLAIN.crafting, docs: { page: '/crafting' }, ...catalog.crafting },
  'systems-recipes.json': {
    explain: EXPLAIN.crafting,
    count: (catalog.crafting?.recipes ?? []).length,
    recipes: catalog.crafting?.recipes ?? [],
  },
  'systems-buildables.json': {
    explain:
      'build_* recipes for camp + NPC hire buildings. Place via ModularBuilding when placeable.',
    docs: { page: '/professions', npcHires: 'docs/inventory/npc-hires.csv' },
    count: (catalog.crafting?.recipes ?? []).filter(
      (r) => r.id?.startsWith('build_') || r.station === 'hammer_tool',
    ).length,
    recipes: (catalog.crafting?.recipes ?? []).filter(
      (r) => r.id?.startsWith('build_') || r.station === 'hammer_tool',
    ),
  },
  'systems-icons.json': {
    explain: EXPLAIN.icons,
    base: 'https://grudges.grudge-studio.com',
    packs: {
      perkFlavor: ['/icons/perks/hero/', '/icons/perks/warrior/', '/icons/perks/smarts/', '/icons/perks/maker/'],
      perkTiers: '/icons/perks/stat-tiers/',
      factions: '/icons/factions/',
      factionBanners: '/icons/factions/banners/',
    },
    fromCatalog: {
      factionBanners: catalog.topology?.assets?.factionBanners,
      perkArt: catalog.topology?.assets?.perkArt,
      perkTiers: catalog.topology?.assets?.perkTiers,
      hudUi: catalog.topology?.assets?.hudUi,
    },
    perkTracks: catalog.perks?.tracks ?? [],
    professionIcons: (catalog.professions?.list ?? []).map((p) => ({ id: p.id, icon: p.icon })),
  },
  'systems-township.json': { explain: EXPLAIN.township, docs: { page: '/info.html#camp' }, ...catalog.township },
  'systems-combat.json': { docs: { page: '/combat.html', ssot: 'docs/COMBAT_POWER_SSOT.md' }, ...catalog.combatPower },
};

for (const [name, payload] of Object.entries(slices)) {
  const p = path.join(DATA_DIR, name);
  fs.writeFileSync(p, JSON.stringify(payload, null, 2));
  console.log('Wrote', p);
}

console.log('Wrote', OUT);
console.log('Wrote', OUT_API);
console.log('perks stats', Object.keys(milestonePerks).length);
console.log('recipes', recipes.length);
console.log('professions', professions.length);
console.log('buildables', buildables.length);
