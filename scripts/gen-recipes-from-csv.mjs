/**
 * Generate runtime Recipes + SurvivalItems stubs from docs/inventory/recipes.csv.
 *
 *   node scripts/gen-recipes-from-csv.mjs
 *
 * SSOT remains the CSV. Do not hand-edit the generated files.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CSV = path.join(ROOT, 'artifacts/arpg-game/docs/inventory/recipes.csv');
const OUT_RECIPES = path.join(ROOT, 'artifacts/arpg-game/src/game/survival/Recipes.generated.ts');
const OUT_ITEMS = path.join(ROOT, 'artifacts/arpg-game/src/game/survival/SurvivalItems.generated.ts');
const EXISTING_ITEMS = path.join(ROOT, 'artifacts/arpg-game/src/game/survival/SurvivalItems.ts');
/** Keep @workspace/game-systems (website /api/game) in lockstep with arpg CSV SSOT. */
const OUT_GS_RECIPES = path.join(ROOT, 'lib/game-systems/src/crafting/recipes.generated.ts');
const OUT_GS_ITEMS = path.join(ROOT, 'lib/game-systems/src/crafting/survivalItems.generated.ts');
const EXISTING_GS_ITEMS = path.join(ROOT, 'lib/game-systems/src/crafting/survivalItems.ts');
const WEBSITE_DATA = path.join(ROOT, 'artifacts/website/public/data');

/** Map CSV station names → CraftingStation union. */
const STATION_MAP = {
  none: 'none',
  campfire: 'campfire',
  cooking_rack: 'cooking_rack',
  workbench: 'workbench',
  drying_rack: 'drying_rack',
  anvil: 'anvil',
  hammer_tool: 'hammer_tool',
};

/** Prefer existing SurvivalItems ids when CSV uses alternate mat names. */
const ITEM_ALIASES = {
  wood_log: 'wood_chopped',
  wood: 'wood_chopped',
  stone: 'rock_2',
  rock: 'rock_5',
  flint: 'rock_5',
  coal: 'rock_6',
  ore: 'rock_7',
  iron_ore: 'iron_ore',
  copper_ore: 'copper_ore',
  meat: 'meat_raw',
  fish: 'fish_raw',
};

/** Category → SurvivalCategory + icon defaults. */
function classifyItem(id, recipeCategory, assetPath) {
  const cat = (recipeCategory || '').toLowerCase();
  const placeable =
    cat.startsWith('building') ||
    cat === 'decoration' ||
    cat === 'station' ||
    cat === 'container' ||
    id.startsWith('build_') ||
    [
      'campfire', 'tent_personal', 'storage_crate', 'claim_flag',
      'logging_camp', 'mining_outpost', 'field', 'caravan_cart',
      'grand_bazaar', 'watchtower', 'palisade', 'gate_iron',
      'turret_basic', 'turret_heavy', 'embassy', 'workbench', 'anvil',
      'keep_fortress', 'market_stall', 'market_complex', 'command_tent',
      'recruit_post', 'banner', 'banner_2', 'war_banner',
    ].includes(id);

  let category = 'misc';
  let icon = '📦';
  if (cat.includes('food') || id.startsWith('cook_')) { category = 'food'; icon = '🍖'; }
  else if (cat.includes('potion') || id.startsWith('brew_')) { category = 'medical'; icon = '🧪'; }
  else if (cat.includes('ammo')) { category = 'ammo'; icon = '🟫'; }
  else if (cat.includes('weapon-melee') || cat === 'weapon') { category = 'weapon_melee'; icon = '⚔️'; }
  else if (cat.includes('weapon-ranged')) { category = 'weapon_rifle'; icon = '🔫'; }
  else if (cat.includes('attachment')) { category = 'weapon_attachment'; icon = '🔧'; }
  else if (cat.includes('shield') || cat.includes('armour')) { category = 'clothing'; icon = '🛡️'; }
  else if (cat.includes('tool') || cat.includes('trap') || cat.includes('utility') || cat.includes('mission')) {
    category = 'tool'; icon = '🛠️';
  }
  else if (placeable) { category = 'structure'; icon = '🏕️'; }
  else if (cat.includes('material') || !cat) { category = 'material'; icon = '🪨'; }

  const modelPath =
    assetPath && assetPath !== '—'
      ? assetPath.replace(/^public\//, '/')
      : placeable
        ? '/models/props/fantasy_megakit/Exports/glTF/Chest_Wood.gltf'
        : '/assets/survival/items/DuckTape.fbx';

  return { category, icon, placeable, modelPath };
}

function parseCsv(text) {
  const rows = [];
  let i = 0;
  const len = text.length;
  let field = '';
  let row = [];
  let inQuotes = false;
  while (i < len) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"') { inQuotes = true; i++; continue; }
    if (c === ',') { row.push(field); field = ''; i++; continue; }
    if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((x) => x.trim())) rows.push(row);
      row = []; i++; continue;
    }
    field += c; i++;
  }
  if (field.length || row.length) {
    row.push(field);
    if (row.some((x) => x.trim())) rows.push(row);
  }
  return rows;
}

function parseQtyList(cell) {
  if (!cell || cell === '—') return [];
  const out = [];
  for (const part of cell.split(',')) {
    const m = part.trim().match(/^([a-zA-Z0-9_]+)\s*[×x]\s*(\d+)$/);
    if (m) out.push({ itemId: ITEM_ALIASES[m[1]] || m[1], qty: +m[2] });
  }
  return out;
}

function parseOutput(cell) {
  const list = parseQtyList(cell);
  return list[0] || null;
}

function titleCase(id) {
  return id.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function craftTimeFor(category, tier) {
  const t = Number(tier) || 0;
  if ((category || '').startsWith('building')) return 12 + t * 4;
  if ((category || '').includes('weapon')) return 10 + t * 3;
  if ((category || '').includes('food') || (category || '').includes('potion')) return 6 + t * 2;
  return 8 + t * 2;
}

const raw = fs.readFileSync(CSV, 'utf8');
const table = parseCsv(raw);
const header = table[0].map((h) => h.trim());
const idx = Object.fromEntries(header.map((h, i) => [h, i]));

const recipes = [];
const itemMeta = new Map(); // id → { name, category, ... }

function noteItem(id, name, recipeCategory, assetPath) {
  if (!id) return;
  const resolved = ITEM_ALIASES[id] || id;
  if (itemMeta.has(resolved)) return;
  itemMeta.set(resolved, { id: resolved, name: name || titleCase(resolved), recipeCategory, assetPath });
}

for (const row of table.slice(1)) {
  const id = (row[idx['Recipe ID']] || '').trim();
  if (!id) continue;
  const name = (row[idx['Recipe Name']] || id).trim();
  const category = (row[idx['Category']] || '').trim();
  const unlock = (row[idx['Unlocked By Skill']] || '(default)').trim();
  const stationRaw = (row[idx['Station']] || 'none').trim();
  const station = STATION_MAP[stationRaw] || 'workbench';
  const inputs = parseQtyList(row[idx['Inputs']] || '');
  const output = parseOutput(row[idx['Output']] || '');
  const asset = (row[idx['Output Asset Path']] || '—').trim();
  const tier = (row[idx['Tier']] || '0').trim();
  const notes = (row[idx['Notes']] || '').trim();

  if (!output) {
    console.warn('skip no output', id);
    continue;
  }

  for (const inp of inputs) noteItem(inp.itemId, null, 'material', null);
  noteItem(output.itemId, name, category, asset);

  recipes.push({
    id,
    name,
    iconItemId: output.itemId,
    station,
    craftTime: craftTimeFor(category, tier),
    inputs,
    outputs: [output],
    description: notes && notes !== '—' ? notes.slice(0, 160) : name,
    unlockedBySkill: unlock === '—' ? '(default)' : unlock,
  });
}

// Preserve handcraft helpers that CSV may omit or rename
const EXTRA = [
  {
    id: 'fillet_fish',
    name: 'Fillet Fish',
    iconItemId: 'fish_filet',
    station: 'none',
    craftTime: 4,
    inputs: [{ itemId: 'fish_raw', qty: 1 }, { itemId: 'knife', qty: 0 }],
    outputs: [{ itemId: 'fish_filet', qty: 1 }],
    description: 'Knife required (no consumption).',
    unlockedBySkill: '(default)',
  },
  {
    id: 'open_can',
    name: 'Open Can',
    iconItemId: 'food_can_open',
    station: 'none',
    craftTime: 2,
    inputs: [{ itemId: 'food_can', qty: 1 }, { itemId: 'knife', qty: 0 }],
    outputs: [{ itemId: 'food_can_open', qty: 1 }],
    description: 'Pry open with any blade.',
    unlockedBySkill: '(default)',
  },
  {
    id: 'boil_water',
    name: 'Boiled Water',
    iconItemId: 'bottle_full',
    station: 'campfire',
    craftTime: 8,
    inputs: [{ itemId: 'bottle_empty', qty: 1 }],
    outputs: [{ itemId: 'bottle_full', qty: 1 }],
    description: 'Sterilize collected water in a cup or bottle.',
    unlockedBySkill: '(default)',
  },
];
for (const e of EXTRA) {
  if (!recipes.some((r) => r.id === e.id)) recipes.push(e);
}

const existingSrc = fs.readFileSync(EXISTING_ITEMS, 'utf8');
const missingItems = [];
for (const [id, meta] of itemMeta) {
  const re = new RegExp(`\\b${id}\\s*:`);
  if (re.test(existingSrc)) continue;
  const cls = classifyItem(id, meta.recipeCategory, meta.assetPath);
  missingItems.push({ ...meta, ...cls });
}

// Core mats always ensure present in generated if missing
const CORE_MATS = [
  { id: 'iron_ore', name: 'Iron Ore', category: 'material', icon: '⛏️', weight: 1.0, stack: 40, modelPath: '/assets/survival/items/Rock007.fbx', description: 'Smelt / forge feedstock.' },
  { id: 'copper_ore', name: 'Copper Ore', category: 'material', icon: '🟠', weight: 0.9, stack: 40, modelPath: '/assets/survival/items/Rock007.fbx', description: 'Wiring and gunsmith feedstock.' },
  { id: 'wood_plank', name: 'Wood Plank', category: 'material', icon: '🪵', weight: 1.2, stack: 40, modelPath: '/assets/survival/items/ChopedWood.fbx', description: 'Milled lumber for building and crafting.' },
  { id: 'leather', name: 'Leather', category: 'material', icon: '🧴', weight: 0.4, stack: 30, modelPath: '/assets/survival/items/DuckTape.fbx', description: 'Hides for armour and grips.' },
  { id: 'silk', name: 'Silk / Cloth', category: 'material', icon: '🧵', weight: 0.2, stack: 40, modelPath: '/assets/survival/items/DuckTape.fbx', description: 'Cloth for tents, bandages, banners.' },
  { id: 'herb_common', name: 'Common Herb', category: 'material', icon: '🌿', weight: 0.1, stack: 40, modelPath: '/assets/survival/items/Mushroom001.fbx', description: 'Cooking and alchemy reagent.' },
  { id: 'herb_rare', name: 'Rare Herb', category: 'material', icon: '☘️', weight: 0.1, stack: 20, modelPath: '/assets/survival/items/Mushroom002.fbx', description: 'Potent alchemy reagent.' },
  { id: 'bone', name: 'Bone', category: 'material', icon: '🦴', weight: 0.3, stack: 30, modelPath: '/assets/survival/items/Rock001.fbx', description: 'Creature bone — trophies and tools.' },
  { id: 'fang', name: 'Fang', category: 'material', icon: '🦷', weight: 0.2, stack: 20, modelPath: '/assets/survival/items/Rock001.fbx', description: 'Beast fang.' },
  { id: 'gold', name: 'Gold Nugget', category: 'material', icon: '🥇', weight: 0.2, stack: 50, modelPath: '/assets/survival/items/Rock005.fbx', description: 'Currency and legendary crafts.' },
  { id: 'paper', name: 'Paper', category: 'material', icon: '📄', weight: 0.05, stack: 40, modelPath: '/assets/survival/items/DuckTape.fbx', description: 'Contracts and posters.' },
  { id: 'ink', name: 'Ink', category: 'material', icon: '🖋️', weight: 0.1, stack: 20, modelPath: '/assets/survival/items/DuckTape.fbx', description: 'Writing reagent.' },
  { id: 'dye_a', name: 'Dye', category: 'material', icon: '🎨', weight: 0.1, stack: 20, modelPath: '/assets/survival/items/DuckTape.fbx', description: 'Banner and cloth dye.' },
  { id: 'mineral_crystal', name: 'Mineral Crystal', category: 'material', icon: '💎', weight: 0.3, stack: 20, modelPath: '/assets/survival/items/Rock005.fbx', description: 'Crystal reagent.' },
  { id: 'crystal_of_x', name: 'Crystal of X', category: 'material', icon: '💠', weight: 0.5, stack: 5, modelPath: '/assets/survival/items/Rock005.fbx', description: 'Rift-endgame reagent.' },
  { id: 'meat_cooked', name: 'Cooked Meat', category: 'food', icon: '🍖', weight: 0.4, stack: 10, modelPath: '/assets/survival/items/Meat.fbx', description: 'Safe cooked meat.', consume: { hunger: 36, health: 3 } },
];
for (const m of CORE_MATS) {
  if (!new RegExp(`\\b${m.id}\\s*:`).test(existingSrc) && !missingItems.some((x) => x.id === m.id)) {
    missingItems.push({ ...m, placeable: false, description: m.description });
  }
}

function esc(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

const recipesTs = `/**
 * AUTO-GENERATED from docs/inventory/recipes.csv
 *   node scripts/gen-recipes-from-csv.mjs
 * Do not hand-edit — change the CSV and regenerate.
 */
import type { Recipe } from './Recipes';

export const GENERATED_RECIPES: Recipe[] = ${JSON.stringify(recipes, null, 2).replace(/"([^"]+)":/g, '$1:').replace(/"/g, "'")};
`;

// Fix JSON→TS: JSON.stringify with replace is fragile for nested. Use manual emit.
function emitRecipes(typeImportPath) {
  const lines = [];
  lines.push(`/**`);
  lines.push(` * AUTO-GENERATED from docs/inventory/recipes.csv`);
  lines.push(` *   node scripts/gen-recipes-from-csv.mjs`);
  lines.push(` * Do not hand-edit — change the CSV and regenerate.`);
  lines.push(` */`);
  lines.push(`import type { Recipe } from '${typeImportPath}';`);
  lines.push(``);
  lines.push(`export const GENERATED_RECIPES: Recipe[] = [`);
  for (const r of recipes) {
    lines.push(`  {`);
    lines.push(`    id: '${esc(r.id)}',`);
    lines.push(`    name: '${esc(r.name)}',`);
    lines.push(`    iconItemId: '${esc(r.iconItemId)}',`);
    lines.push(`    station: '${r.station}',`);
    lines.push(`    craftTime: ${r.craftTime},`);
    lines.push(`    inputs: [${r.inputs.map((i) => `{ itemId: '${esc(i.itemId)}', qty: ${i.qty} }`).join(', ')}],`);
    lines.push(`    outputs: [${r.outputs.map((o) => `{ itemId: '${esc(o.itemId)}', qty: ${o.qty} }`).join(', ')}],`);
    lines.push(`    description: '${esc(r.description)}',`);
    lines.push(`    unlockedBySkill: '${esc(r.unlockedBySkill)}',`);
    lines.push(`  },`);
  }
  lines.push(`];`);
  lines.push(``);
  return lines.join('\n');
}

function emitItems(typeImportPath, items) {
  const lines = [];
  lines.push(`/**`);
  lines.push(` * AUTO-GENERATED SurvivalItems stubs from recipes.csv`);
  lines.push(` *   node scripts/gen-recipes-from-csv.mjs`);
  lines.push(` */`);
  lines.push(`import type { SurvivalItemDef } from '${typeImportPath}';`);
  lines.push(``);
  lines.push(`export const GENERATED_SURVIVAL_ITEMS: Record<string, SurvivalItemDef> = {`);
  for (const it of items) {
    const place = it.placeable ? ', placeable: true' : '';
    let consumeStr = '';
    if (it.consume) {
      const parts = Object.entries(it.consume).map(([k, v]) => `${k}: ${v}`);
      consumeStr = `, consume: { ${parts.join(', ')} }`;
    }
    lines.push(
      `  ${it.id}: { id: '${it.id}', name: '${esc(it.name)}', category: '${it.category}', icon: '${it.icon || '📦'}', weight: ${it.weight ?? (it.placeable ? 5 : 0.3)}, stack: ${it.stack ?? (it.placeable ? 4 : 20)}, modelPath: '${esc(it.modelPath)}', description: '${esc(it.description || it.name)}'${place}${consumeStr} },`,
    );
  }
  lines.push(`};`);
  lines.push(``);
  return lines.join('\n');
}

function missingAgainst(existingPath) {
  const src = fs.existsSync(existingPath) ? fs.readFileSync(existingPath, 'utf8') : '';
  const out = [];
  for (const [id, meta] of itemMeta) {
    const re = new RegExp(`\\b${id}\\s*:`);
    if (re.test(src)) continue;
    const cls = classifyItem(id, meta.recipeCategory, meta.assetPath);
    out.push({ ...meta, ...cls });
  }
  for (const m of CORE_MATS) {
    if (!new RegExp(`\\b${m.id}\\s*:`).test(src) && !out.some((x) => x.id === m.id)) {
      out.push({ ...m, placeable: false, description: m.description });
    }
  }
  return out;
}

const STATION_META = [
  { id: 'none', name: 'Handcraft', icon: '✋', description: 'Craft anywhere — no station required.' },
  { id: 'campfire', name: 'Campfire', icon: '🔥', description: 'Cook food and boil water.' },
  { id: 'cooking_rack', name: 'Cooking Rack', icon: '🍖', description: 'Slow roast and smoke meats.' },
  { id: 'workbench', name: 'Workbench', icon: '🪚', description: 'Tools, furniture, and structures.' },
  { id: 'drying_rack', name: 'Drying Rack', icon: '🪵', description: 'Cure meat and fish for storage.' },
  { id: 'anvil', name: 'Anvil', icon: '⚒️', description: 'Forge weapons, armour, and metalwork.' },
  { id: 'hammer_tool', name: 'Build Hammer', icon: '🔨', description: 'Place camp buildings and defenses.' },
];

function emitGameCatalogJson(allItems) {
  const stationCounts = {};
  for (const r of recipes) stationCounts[r.station] = (stationCounts[r.station] ?? 0) + 1;
  const itemsObj = {};
  for (const it of allItems) itemsObj[it.id] = it;
  // Ensure every recipe input/output has at least a stub name in items
  for (const r of recipes) {
    for (const io of [...r.inputs, ...r.outputs]) {
      if (!itemsObj[io.itemId]) {
        const cls = classifyItem(io.itemId, 'material', null);
        itemsObj[io.itemId] = {
          id: io.itemId,
          name: titleCase(io.itemId),
          category: cls.category,
          icon: cls.icon,
          weight: 0.3,
          stack: 20,
          modelPath: cls.modelPath,
          description: titleCase(io.itemId),
        };
      }
    }
  }
  const categories = [...new Set(Object.values(itemsObj).map((i) => i.category))].sort();
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    source: 'recipes.csv',
    recipeCount: recipes.length,
    itemCount: Object.keys(itemsObj).length,
    stations: STATION_META.map((s) => ({ ...s, recipeCount: stationCounts[s.id] ?? 0 })),
    categories,
    recipes,
    items: itemsObj,
  };
}

const arpgMissing = missingItems; // already computed vs arpg SurvivalItems.ts
const gsMissing = missingAgainst(EXISTING_GS_ITEMS);

fs.writeFileSync(OUT_RECIPES, emitRecipes('./Recipes'));
fs.writeFileSync(OUT_ITEMS, emitItems('./SurvivalItems', arpgMissing));
fs.writeFileSync(OUT_GS_RECIPES, emitRecipes('./recipes'));
fs.writeFileSync(OUT_GS_ITEMS, emitItems('./survivalItems', gsMissing));

// Static website catalog (crafting.html) — full CSV set, not the old 33-recipe stub
fs.mkdirSync(WEBSITE_DATA, { recursive: true });
const catalogItems = [
  ...gsMissing,
  // Parse hand-authored game-systems items lightly via generated merge at runtime;
  // for static JSON, include stubs for every recipe-touched id (emitGameCatalogJson fills gaps).
];
const catalog = emitGameCatalogJson(catalogItems);
fs.writeFileSync(path.join(WEBSITE_DATA, 'game-catalog.json'), JSON.stringify(catalog));
fs.writeFileSync(
  path.join(WEBSITE_DATA, 'recipes.json'),
  JSON.stringify({ station: 'all', count: recipes.length, recipes }),
);
fs.writeFileSync(
  path.join(WEBSITE_DATA, 'items.json'),
  JSON.stringify({ category: 'all', count: catalog.itemCount, items: Object.values(catalog.items) }),
);
fs.writeFileSync(
  path.join(WEBSITE_DATA, 'stations.json'),
  JSON.stringify({ stations: catalog.stations }),
);
fs.writeFileSync(
  path.join(WEBSITE_DATA, 'game-index.json'),
  JSON.stringify({
    service: 'grudges-survival-game-data',
    version: 1,
    source: 'recipes.csv',
    endpoints: [
      'GET /api/game/catalog',
      'GET /api/game/recipes',
      'GET /api/game/items',
      'GET /api/game/stations',
    ],
    counts: {
      recipes: catalog.recipeCount,
      items: catalog.itemCount,
      stations: catalog.stations.length,
    },
  }),
);

console.log('Wrote', OUT_RECIPES, 'recipes=', recipes.length);
console.log('Wrote', OUT_ITEMS, 'newItems=', arpgMissing.length);
console.log('Wrote', OUT_GS_RECIPES, '+', OUT_GS_ITEMS, 'gsNewItems=', gsMissing.length);
console.log('Wrote', path.join(WEBSITE_DATA, 'game-catalog.json'), 'items=', catalog.itemCount);
console.log('stations', [...new Set(recipes.map((r) => r.station))].join(', '));
console.log('builds', recipes.filter((r) => r.id.startsWith('build_')).length);
console.log('crafts', recipes.filter((r) => r.id.startsWith('craft_') || r.id.startsWith('cook_') || r.id.startsWith('brew_')).length);
