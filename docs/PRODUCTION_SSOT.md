# Grudges voxel MMO — Production SSOT

**Product lock:** Grudges is **voxel-era only** and the **lead** voxel MMO.  
See `PRODUCT_ERA_VOXEL.md`. Nexus product era = later. BIO…GRA stay as attribute names.

Machine catalog: `artifacts/website/public/data/grudges-systems.json`  
Regen: `pnpm run export:systems`

---

## 1. System map (do not invent parallel stacks)

| Domain | SSOT location | Runtime |
|--------|---------------|---------|
| **Product era** | `docs/PRODUCT_ERA_VOXEL.md` | `era=voxel` characters |
| **Attributes / derived** | `@workspace/game-systems` (`nexusDerived`, `VOXEL_ERA_STARTER_STATS`) | MainPanel, CharacterConfig |
| **Milestone perks** | `CharacterConfig.ts` STAT_MILESTONES | MainPanel skills; website `/perks` |
| **Professions / recipes** | `docs/inventory/professions.csv` → `Professions.ts`; `recipes.csv` → `pnpm gen:recipes` → `Recipes.generated.ts` + `SurvivalItems.generated.ts` | Full craft/build catalog (~170 recipes). Camp/NPC buildings placeable via ModularBuilding. Unlock via `unlockedBySkill`. |
| **SWG-style bridge (Grudges content)** | `GrudgeProgressionBridge.ts` | Pattern only (profession XP → unlocks). Maps Grudges skills → Grudges ABILITIES / recipes / weapon passives. **Not** SWG IP or SWG skill names. |
| **Factions** | `data/factions.ts` + banners | Map, claim poles, lore |
| **World / settlements** | `WorldGen.ts`, `FeaturePlacer.ts`, `FactionBannerFlag.ts` | Open world identity |
| **Terrain lessons** | `docs/SNAKEY_TERRAIN_LESSONS.md` | One height SSOT + stream |
| **Production world** | `docs/PRODUCTION_WORLD_VOXEL.md` | Sectors, safe hub, entry, assets |
| **HUD** | `HUD.tsx` CraftPix unit-frames, `SurvivalHUD.tsx` | In-play |
| **Character hub** | `MainPanel.tsx` (C) | Stats, gear, perks, craft |
| **Combat power** | `docs/COMBAT_POWER_SSOT.md` + `combatPower` catalog | Weapons · mobility · effects · procs · defensives · fighter allies |
| **Linear skillshots** | `docs/VOXEL_LINEAR_CAST_SSOT.md` + `linearAbilityCatalog.ts` | Keys 6–0 · pinata debris · breakable walls |
| **Combat** | fleet combat + weapon skills in-repo | Not a second controller; craft ≠ ally filter |
| **Physics** | Rapier + mesh-bvh ground | SI 1 unit = 1 m |
| **Auth / bag** | Grudge ID + Railway via `/api/*` | One bag SSOT |

**Banned:** second inventory authority, second era default for Grudges, Meshy heroes as production, OrbitControls writing combat camera.

---

## 2. Deployment topology

| Layer | Host | How to ship |
|-------|------|-------------|
| **Website + client** | **`grudges.grudge-studio.com`** (canonical). `survival.grudge-studio.com` **301 → grudges**. Preview: `survival-grudgenexus.vercel.app` | Vercel project `survival` |
| **API / WS** | `survival-api-production.up.railway.app` | Railway; Vercel rewrites `/api/*`. Systems: `/api/systems*` |
| **SSO** | `id.grudge-studio.com` | Shared Grudge ID |
| **Assets CDN** | `assets.grudge-studio.com` | R2; local `public/` for UI icons during migrate |
| **Voxel tools** | Mine-Loader / GRUDOX | Support era — **not** a second main MMO |

### Client + website ship (canonical)

```bash
cd F:/GitHub/survival
pnpm run export:systems
pnpm run build:website
pnpm run build:game
node scripts/vercel-prebuilt.mjs
vercel deploy --prebuilt --prod --yes
node scripts/smoke-grudges-prod.mjs
```

Or: `pnpm run deploy:prod` (includes game build).

### Smoke checklist

- [ ] `/` home  
- [ ] `/perks` · `/crafting` · `/professions` · `/main-panel`  
- [ ] `/mapstarter`  
- [ ] `/icons/factions/banner_keepers.png`  
- [ ] `/arpg-game/` client shell  
- [ ] `/api/healthz` → Railway ok  

---

## 3. Art & UI inventory (use existing packs)

| Need | Path | Notes |
|------|------|-------|
| **Faction banners** | `/icons/factions/banners/{id}.png` | BG-removed Imgur; map + poles |
| **Map icons** | `/icons/factions/banner_{id}.png` | WorldMapOverlay / mapstarter |
| **Perk tier badges** | `/icons/perks/stat-tiers/{stat}-t{1-6}.svg` | 8 stats × 6 tiers |
| **Perk flavor** | `/icons/perks/{hero\|warrior\|smarts\|maker}/{1-30}.png` | Export maps milestones → pack |
| **Choice perks (in-game)** | genetics / cyberpunk packs under arpg `public/icons/` | `StatPerkChoices` + replace script |
| **HUD chrome** | `/textures/ui/unit-frames/*` | CraftPix — `HUD.tsx` |
| **RPG GUI** | `/icons/rpg-gui/*` | Panels / slots |
| **Camp reference** | `/images/camp-ref-itch.png` | Marketing only |

**Generate art only when a pack slot is empty.** Prefer mapping existing numbered icons. Re-run Imgur banner process: `scripts/process-faction-banners.py`.

### Website perk cards

Export writes per perk:

- `iconPath` — pack PNG  
- `tierBadge` — stat-tier SVG  
- `icon` — legacy emoji fallback  

`/perks` renders `iconPath` + `tierBadge` when present.

---

## 4. Client systems (production-ready wiring)

| System | Entry | Production rule |
|--------|-------|-----------------|
| Boot | `GameEngine` | Hub + open world layers (no exclusive void mode) |
| Character | SI 1.8 m feet ground | Voxel starter stats |
| Map | `WorldMapOverlay` (M) | Faction banners on claimed settlements |
| Claim | `FactionBannerFlag` | Pole + transparent cloth |
| Main panel | C key → `MainPanel` | One bag + BIO…GRA allocate |
| Craft | Recipes + stations | Same catalog as `/crafting` |
| Township | Settlement tiers | `info.html#camp` |
| **Harvest (RMB)** | `PlayerHarvest` + `ResourceSystem` | RMB on node → walk → `Farm_Harvest` / chop → loot |
| **Focus (RMB)** | sticky toggle (short click) | Mouse look · body faces cam · **no ADS FOV/action-angle** |
| **Casting lab focus** | `CombatFocus` + `CameraRig` | Editor closed · actionFov/auto-yaw-pitch **purged** |

---

## 5. API / server

| Concern | Rule |
|---------|------|
| Health | `GET /api/healthz` must be ok before client launch claims |
| Characters | Stamp + filter `config.era=voxel` for Grudges play |
| CORS | `*.grudge-studio.com`, Vercel previews |
| Mapstarter | **Website** `/mapstarter` (not Railway-only) |
| API proxy | Prebuilt routes **all** `/api/*` → Railway survival-api (not api.grudge-studio.com HTML) |

Redeploy API only when `artifacts/api-server` changes — separate from Vercel static ship.

---

## 5b. D1 / R2 / CDN (assets only)

| Layer | Role | Grudges rule |
|-------|------|--------------|
| **R2 `grudge-assets`** | Binary GLB/tex/audio | CDN `assets.grudge-studio.com` |
| **Key prefix `grudge-nexus/`** | Historical path under bucket | **Not product era** — keep until full migration |
| **`locations/*`** | Hub/map GLBs | Bucket **root** (no prefix) — `assetUrl.ts` |
| **`VITE_ASSET_CDN_URL`** | Client CDN base | `https://assets.grudge-studio.com/grudge-nexus` |
| **D1** | Asset search/index | Never player bag/characters |
| **Railway Postgres** | Player accounts, characters, bag, wallet | `era=voxel` in character `config` |
| **Sync** | `node scripts/sync-assets-to-r2.mjs` | Incremental ETag skip |

Verify: `HEAD https://assets.grudge-studio.com/locations/encampment.glb` → 200;  
`HEAD https://assets.grudge-studio.com/grudge-nexus/models/characters/male/adventurer.gltf` → 200.

---

## 6. Agent / worker rules

1. Load `PRODUCT_ERA_VOXEL` + this doc before changing systems.  
2. Extend SSOT files above — never create `*2` / `v2` packages.  
3. After perk/recipe/profession edits → `export:systems` → deploy.  
4. After UI icon work → ensure `vercel-prebuilt` includes `icons/perks` fully.  
5. Smoke live host names, not localhost, when claiming production.

---

## Related

- `docs/AI_WORKER_DEPLOY_GRUDGES.md`  
- `docs/FLEET_ARPG_STACK.md` (Three/package gate)  
- `docs/FACTION_BANNERS.md`  
- Skills: `grudge-studio` → `grudge-3d-game-packages` → `craftpix-rpg-mmo-ui` → `voxel-explorer-combat-hud`
