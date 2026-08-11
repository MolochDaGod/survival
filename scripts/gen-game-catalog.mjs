/**
 * Emit static game data catalogs for the website + Vercel /api/game routes.
 * Run before website build / prebuilt deploy:
 *   pnpm exec tsx scripts/gen-game-catalog.mjs
 */
import { writeFileSync, mkdirSync, copyFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import {
  buildGameCatalog,
  RECIPES,
  SURVIVAL_ITEMS,
  RECIPE_STATIONS,
} from "../lib/game-systems/src/crafting/index.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const c = buildGameCatalog();

const dirs = [
  resolve(root, "artifacts/website/public/data"),
  resolve(root, "artifacts/website/dist/public/data"),
  resolve(root, ".vercel/output/static/data"),
];

const files = {
  "game-catalog.json": JSON.stringify(c),
  "recipes.json": JSON.stringify({
    station: "all",
    count: RECIPES.length,
    recipes: RECIPES,
  }),
  "items.json": JSON.stringify({
    category: "all",
    count: Object.keys(SURVIVAL_ITEMS).length,
    items: Object.values(SURVIVAL_ITEMS),
  }),
  "stations.json": JSON.stringify({ stations: c.stations }),
  "game-index.json": JSON.stringify({
    service: "grudges-survival-game-data",
    version: 1,
    source: "static-vercel",
    endpoints: [
      "GET /api/game/catalog",
      "GET /api/game/recipes",
      "GET /api/game/items",
      "GET /api/game/stations",
    ],
    counts: {
      recipes: c.recipeCount,
      items: c.itemCount,
      stations: RECIPE_STATIONS.length,
    },
  }),
};

for (const d of dirs) {
  mkdirSync(d, { recursive: true });
  for (const [name, body] of Object.entries(files)) {
    writeFileSync(resolve(d, name), body);
  }
}

const craftSrc = resolve(root, "artifacts/website/crafting.html");
if (existsSync(craftSrc)) {
  for (const dest of [
    resolve(root, "artifacts/website/dist/public/crafting.html"),
    resolve(root, ".vercel/output/static/crafting.html"),
  ]) {
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(craftSrc, dest);
  }
}

console.log(
  `[gen-game-catalog] recipes=${c.recipeCount} items=${c.itemCount} stations=${RECIPE_STATIONS.length}`,
);
