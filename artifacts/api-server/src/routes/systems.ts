/**
 * /api/systems — Grudges game-systems catalog (read-only).
 *
 * SSOT: scripts/export-grudges-systems.mjs → grudges-systems.json
 * (milestone perks, professions, crafting stations/recipes, icons, topology).
 * Do not invent parallel catalogs here.
 *
 *   GET /api/systems              full catalog
 *   GET /api/systems/overview     product + links + topology + explanations
 *   GET /api/systems/perks        milestone perks + icon paths
 *   GET /api/systems/professions  7 professions + branches
 *   GET /api/systems/crafting     stations, recipes, tiers, enhancements
 *   GET /api/systems/recipes      full recipe list (craft + cook + brew + build)
 *   GET /api/systems/buildables   build_* recipes only (camp / NPC hire buildings)
 *   GET /api/systems/icons        icon path conventions + faction/perk packs
 *   GET /api/systems/township     settlement tiers + buildables
 *   GET /api/systems/combat       combat power pillars
 */
import { Router, type IRouter } from "express";
import catalog from "../data/grudges-systems.json" with { type: "json" };

const router: IRouter = Router();

type SystemsCatalog = typeof catalog & {
  product?: string;
  productEra?: string;
  productNote?: string;
  links?: Record<string, string>;
  topology?: Record<string, unknown>;
  stats?: unknown[];
  perks?: Record<string, unknown>;
  professions?: Record<string, unknown>;
  crafting?: Record<string, unknown>;
  township?: Record<string, unknown>;
  combatPower?: Record<string, unknown>;
  aiWorker?: Record<string, unknown>;
};

const cat = catalog as SystemsCatalog;

const EXPLAIN = {
  product:
    "Grudges is the voxel-era lead survival MMO. Canonical host: grudges.grudge-studio.com. survival.grudge-studio.com 301-redirects here.",
  perks:
    "Eight Nexus attributes (BIO…GRA), six milestone perks each. Flavor art from /icons/perks/{hero|warrior|smarts|maker}/1-30.png; tier badges from /icons/perks/stat-tiers/{stat}-t{1-6}.svg.",
  professions:
    "Seven professions (gathering, hunting, crafting, township, survival, chemistry, combat). Five branches each plus Master — 147 skills. Profession XP is independent of level skillPoints / PerksBook.",
  crafting:
    "CSV SSOT docs/inventory/recipes.csv → gen:recipes → ~170 recipes. Stations gate craft. unlockedBySkill is SWG-style profession unlock. Feeds weapons/armor into combat — not a second ally filter.",
  recipes:
    "Full craft/cook/brew/build recipe array from Recipes.generated.ts. Filter by station or unlockedBySkill client-side.",
  buildables:
    "build_* recipes for camp + NPC hire buildings (tent, storage, logging camp, watchtower, turrets, embassy, …). Place via ModularBuilding when placeable.",
  icons:
    "Website serves /icons/* from the Grudges deploy. Faction banners: /icons/factions/banners/{id}.png. Prefer existing pack slots; do not invent new icon folders.",
  township:
    "Settlement tiers Camp → Tribe → Village → Town → Stronghold scale with recruit population. Buildables unlock by tier.",
  api:
    "This catalog is read-only definitions. Player bag/XP/characters stay on Railway Postgres via /api/accounts|/api/characters|/api/savegame.",
} as const;

type RecipeRow = {
  id?: string;
  name?: string;
  station?: string;
  unlockedBySkill?: string;
  inputs?: unknown;
  outputs?: unknown;
  description?: string;
};

function allRecipes(): RecipeRow[] {
  const crafting = cat.crafting as { recipes?: RecipeRow[] } | undefined;
  return Array.isArray(crafting?.recipes) ? crafting!.recipes! : [];
}

router.get("/", (_req, res) => {
  res.json(cat);
});

router.get("/overview", (_req, res) => {
  res.json({
    product: cat.product,
    productEra: cat.productEra,
    productNote: cat.productNote,
    generatedAt: (cat as { generatedAt?: string }).generatedAt,
    version: (cat as { version?: string }).version,
    canonicalHost: "https://grudges.grudge-studio.com",
    aliasRedirect: {
      from: "https://survival.grudge-studio.com",
      to: "https://grudges.grudge-studio.com",
      status: 301,
    },
    links: cat.links,
    topology: cat.topology,
    stats: cat.stats,
    explain: EXPLAIN,
    endpoints: {
      full: "/api/systems",
      overview: "/api/systems/overview",
      perks: "/api/systems/perks",
      professions: "/api/systems/professions",
      crafting: "/api/systems/crafting",
      recipes: "/api/systems/recipes",
      buildables: "/api/systems/buildables",
      icons: "/api/systems/icons",
      township: "/api/systems/township",
      combat: "/api/systems/combat",
      statsCatalog: "/api/stats/catalog",
      engineManifest: "/api/engine/manifest",
    },
  });
});

router.get("/perks", (_req, res) => {
  res.json({
    explain: EXPLAIN.perks,
    docs: { page: "/perks", guide: "/stats-guide.html" },
    ...(cat.perks ?? {}),
  });
});

router.get("/professions", (_req, res) => {
  res.json({
    explain: EXPLAIN.professions,
    docs: { page: "/professions" },
    ...(cat.professions ?? {}),
  });
});

router.get("/crafting", (_req, res) => {
  res.json({
    explain: EXPLAIN.crafting,
    docs: { page: "/crafting", csv: "docs/inventory/recipes.csv" },
    ...(cat.crafting ?? {}),
  });
});

router.get("/recipes", (_req, res) => {
  const recipes = allRecipes();
  res.json({
    explain: EXPLAIN.recipes,
    count: recipes.length,
    recipes,
  });
});

router.get("/buildables", (_req, res) => {
  const recipes = allRecipes().filter(
    (r) => typeof r.id === "string" && (r.id.startsWith("build_") || r.station === "hammer_tool"),
  );
  res.json({
    explain: EXPLAIN.buildables,
    docs: { page: "/professions", npcHires: "docs/inventory/npc-hires.csv" },
    count: recipes.length,
    recipes,
  });
});

router.get("/icons", (_req, res) => {
  const assets = (cat.topology as { assets?: Record<string, unknown> } | undefined)?.assets ?? {};
  res.json({
    explain: EXPLAIN.icons,
    base: "https://grudges.grudge-studio.com",
    packs: {
      perkFlavor: ["/icons/perks/hero/", "/icons/perks/warrior/", "/icons/perks/smarts/", "/icons/perks/maker/"],
      perkTiers: "/icons/perks/stat-tiers/",
      factions: "/icons/factions/",
      factionBanners: "/icons/factions/banners/",
    },
    fromCatalog: {
      factionBanners: assets.factionBanners,
      perkArt: assets.perkArt,
      perkTiers: assets.perkTiers,
      hudUi: assets.hudUi,
    },
    perkTracks: cat.perks?.tracks ?? [],
    professionIcons: (cat.professions as { list?: Array<{ id: string; icon: string }> } | undefined)?.list?.map(
      (p) => ({ id: p.id, icon: p.icon }),
    ) ?? [],
  });
});

router.get("/township", (_req, res) => {
  res.json({
    explain: EXPLAIN.township,
    docs: { page: "/info.html#camp" },
    ...(cat.township ?? {}),
  });
});

router.get("/combat", (_req, res) => {
  res.json({
    docs: { page: "/combat.html", ssot: "docs/COMBAT_POWER_SSOT.md" },
    ...(cat.combatPower ?? {}),
  });
});

export default router;
