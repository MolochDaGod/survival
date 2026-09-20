# AI worker — Grudges (voxel-era lead) deploy & best practices

Machine-readable companion: `artifacts/website/public/data/grudges-systems.json`  
Regenerate: `node scripts/export-grudges-systems.mjs`  
**Product era lock:** `docs/PRODUCT_ERA_VOXEL.md`

## Products (do not collapse brands; Grudges owns voxel play)

| Product | Era | Hosts | Role |
|---------|-----|-------|------|
| **Grudges** | **`voxel`** | grudges.grudge-studio.com | **Lead / main voxel-era MMO** — marketing + `/arpg-game/` client |
| **Mine-Loader** | `voxel` | mineloader.grudge-studio.com | Worlds, codex, prefabs, harvest tools |
| **GRUDOX** | `voxel` | grudox.grudge-studio.com | Launcher / cabinets (not a second main MMO) |

**Deferred:** separate **nexus** product era / `era=nexus` roster — do not default Grudges characters there.

**Hard rules:** warlords heroes ≠ Grudges; do not invent parallel bags; BIO…GRA stay as the **stat system** name (“Nexus attributes”).

## Deploy (website + client)

**Full SSOT:** `docs/PRODUCTION_SSOT.md`

```bash
cd F:/GitHub/survival
pnpm run deploy:prod
# = export:systems + build:website + build:game + vercel-prebuilt + vercel --prebuilt --prod + smoke:prod
```

Aliases: `grudges.grudge-studio.com`, `survival.grudge-studio.com`, `survival-grudgenexus.vercel.app`.

**API (Railway)** is separate: only redeploy `artifacts/api-server` when server code changes.  
Health: `https://survival-api-production.up.railway.app/api/healthz`

### Smoke

```bash
pnpm run smoke:prod
```

- [ ] `/` Grudges home  
- [ ] `/info.html#camp`  
- [ ] `/perks` · `/combat` · `/crafting` · `/professions` (combat power ≠ craft-for-allies)  
- [ ] `/main-panel` · `/mapstarter`  
- [ ] `/icons/factions/banner_keepers.png` · `/icons/perks/stat-tiers/bio-t1.svg`  
- [ ] `/arpg-game/` play client  
- [ ] `/api/healthz` via site proxy

## Best practices (agents)

1. **Characters:** create / load with **`era=voxel`** (config + POST body) for Grudges.
2. **No parallel inventory** — MainPanel bag / content SSOT.
3. **Stats:** `@workspace/game-systems` `nexusDerived` (BIO…GRA) + `VOXEL_ERA_STARTER_STATS`.
4. **Perks / professions / craft** — website pages + engine SSOT; export catalog for AI.
5. **Camp** — `info.html#camp` settlement tiers + township profession.
6. **Owl Form** — `leathern_drake` land mount (not bird).
7. **Mine-Loader / GRUDOX** — support voxel stack; **Grudges is the main play MMO**.
8. **Deploy honesty** — name live URL smoked; single-intent deploys.
9. **D1/R2:** R2 `grudge-assets` + prefix `grudge-nexus/` for models; `locations/*` at root. D1 = asset index only. Railway = player SSOT.
10. **API proxy:** Vercel prebuilt → `survival-api-production.up.railway.app` for all `/api/*` (do not send characters to `api.grudge-studio.com` HTML).

## AI worker prompt skeleton

```
You are the Grudges deploy worker.
Product: Grudges = voxel-era LEAD game (era=voxel). Nexus product era = later.
Repo: F:/GitHub/survival
SSOT: docs/PRODUCTION_SSOT.md
1. pnpm run export:systems
2. pnpm run build:website && pnpm run build:game
3. node scripts/vercel-prebuilt.mjs && vercel deploy --prebuilt --prod --yes
4. pnpm run smoke:prod
Never invent hosts. Never put Grudges on era=warlords or invent era=nexus for Grudges without owner decision.
```
