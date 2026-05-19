# GRUDGES — Bind a grudge. Bear it forward.

A sci-fi survival ARPG set a century after alien contact. Build, fight, trade, and explore a 6.4 km² procedural world that rewards preparation and punishes carelessness.

> *They left us behind. Twelve percent went to the stars. Sixty-eight percent rose to the stratocolonies. The rest of us stayed on the surface and learned how to bury our own.*

## Live

| App | URL |
|---|---|
| Website | [grudges.grudge-studio.com](https://grudges.grudge-studio.com) |
| Game Client | [grudges.grudge-studio.com/arpg-game/](https://grudges.grudge-studio.com/arpg-game/) |
| Admin Panel | [grudges.grudge-studio.com/admin/](https://grudges.grudge-studio.com/admin/) |
| Asset Studio | [grudges.grudge-studio.com/asset-studio/](https://grudges.grudge-studio.com/asset-studio/) |
| API Server | `grudge-nexus-api-production.up.railway.app/api` |
| Asset CDN | `assets.grudge-studio.com` (Cloudflare R2) |

## The Game

**Grudges** is an open-world survival RPG featuring:

- **Open World** — 6,400 m × 6,400 m procedural terrain with 9 biomes, 8 towns, 4 camps, 4 caves, and 4 outposts. Hunger, thirst, temperature, and faction hostility are constant.
- **Township Building** — Modular building system (foundations, walls, doors, windows, stairs, roofs). Your settlement grows through 5 tiers: Camp → Tribe → Village → Town → Stronghold.
- **7 Professions, 35 Branches** — Gathering, Hunting, Crafting, Township, Survival, Chemistry, Combat. 147 learnable skills. Master skills require full branch completion.
- **8 Core Attributes** — Biomass, Neural Integrity, Kinetic Efficiency, Quantum Aptitude, Synthetic Affinity, Chronal Stability, Entropic Resistance, Gravitic Harmony. 37 derived stats with diminishing returns.
- **Diablo-Style Loot** — 73 affixes across 8 tiers (Scrap → Legendary). Slot-aware rolling: weapon-only affixes (damage, procs, elemental) never appear on armor; armor-exclusive affixes (reinforced, tenacity, block) never appear on weapons.
- **Modular Gear** — Visual equipment overlay system. Equipping armor replaces character mesh regions (head, body, legs, feet) with gear models. Per-drop colour tinting from tier-aware palettes.
- **Action Combat** — Weapon-stance locomotion, animation-synced hit windows, 3-step combo chains, projectile system with raycasted collision, dynamic crosshair with spread bloom and hit markers.
- **21 Weapon Types** — Swords, axes, daggers, maces, bows, staves, guns, shields, spears, crossbows, scythes, wands, and more. Each with unique attack clips, block stances, and combo chains.
- **30+ Creatures** — 6 hostile humanoids, 6 animated creatures, 3 sci-fi units, 4 endgame mechs, 7 farm animals, 7 fish. Biome-weighted spawn tables.
- **15 NPC Roles** — Woodcutter, Miner, Farmer, Stall Vendor, Caravan Master, Sentry, Captain, Diplomat, and more. Goal-stack AI with YUKA steering.
- **14 Deployable Entities** — Turrets, drones, mechs, and beacons tied to CHR/ENT/GRA stat milestones.
- **Living NPCs** — Every NPC runs the same stats, perks, and XP system you do. Sentiment-driven faction reactions.

## Architecture

Monorepo (`pnpm workspace`) with 7 packages:

| Package | Purpose |
|---|---|
| `artifacts/website` | Marketing site (Vite + React + Tailwind + Framer Motion) |
| `artifacts/arpg-game` | Game client (Three.js + Rapier physics + React) |
| `artifacts/api-server` | API server (Express + Drizzle + PostgreSQL) |
| `artifacts/admin` | Admin panel (React + Vite) |
| `artifacts/asset-studio` | Asset browser & pipeline (React + Three.js) |
| `lib/game-systems` | Shared game logic (attributes, loot, combat, deployables, tiers) |
| `lib/db` | Database schema (Drizzle ORM + PostgreSQL) |

## Stack

- **Frontend**: Vercel (auto-deploy from `main`)
- **Backend**: Railway (Docker) via `Dockerfile` + `railway.json`
- **Database**: PostgreSQL 17 (Drizzle ORM)
- **Assets**: Cloudflare R2 CDN — 4,264 files, 1.5 GB synced via `scripts/sync-assets-to-r2.mjs`
- **Auth**: Puter.js (browser) → Grudge ID → account upsert (server)
- **DNS/CDN**: Cloudflare (grudge-studio.com)
- **Tests**: Vitest — 303 tests (loot simulation, deployable alignment, gear visual, NPC recruit)

## Quick Start

```bash
pnpm install

# Website
pnpm dev:website      # http://localhost:5170

# Game client
pnpm dev:game         # http://localhost:5171/arpg-game/

# API server (requires DATABASE_URL)
cp .env.example .env  # fill in values
pnpm dev:api          # http://localhost:5000

# Admin panel
pnpm dev:admin        # http://localhost:5172/admin/

# Run tests
pnpm test

# Typecheck all packages
pnpm run typecheck
```

## Production Deployment

### Frontend (Vercel)
Pushes to `main` auto-deploy. Sub-apps (arpg-game, admin, asset-studio) are merged into the website output by `scripts/merge-outputs.mjs`.

### Backend (Railway)
```bash
railway login && railway link
railway up              # deploys via Dockerfile
```

Or via Docker Compose (self-hosted):
```bash
cp .env.example .env    # fill in production values
docker compose up -d --build
```

### Database Schema
```bash
# Push Drizzle schema to production DB
DATABASE_URL=<your-url> pnpm db:push
```

### Asset CDN Sync
```bash
# Requires R2 credentials in .env
node scripts/sync-assets-to-r2.mjs --dry-run   # preview
node scripts/sync-assets-to-r2.mjs              # full sync (~1.5 GB)
```

## Environment Variables

See [`.env.example`](.env.example) for the full list. Key variables:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `CF_ACCOUNT_ID` | Cloudflare account (R2 S3 endpoint) |
| `OBJECT_STORAGE_KEY/SECRET` | R2 access credentials |
| `R2_BUCKET_ASSETS` | R2 bucket name (default: `grudge-assets`) |
| `VITE_ASSET_CDN_URL` | CDN URL for game assets (set in Vercel) |
| `CORS_ORIGINS` | Allowed origins for API |

## Credits

Created by **Racalvin The Pirate King** · [Grudge Studio](https://grudge-studio.com)
