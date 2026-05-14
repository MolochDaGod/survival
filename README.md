# GRUDGES — Bind a grudge. Bear it forward.

A sci-fi survival ARPG set a century after alien contact. Build, fight, trade, and explore a world that rewards preparation and punishes carelessness.

> *They left us behind. Twelve percent went to the stars. Sixty-eight percent rose to the stratocolonies. The rest of us stayed on the surface and learned how to bury our own.*

## The Game

**Grudges** is an open-world survival RPG featuring:

- **Open World Survival** — Hunger, thirst, radiation, and faction hostility are constant. Rest must be earned. Shelter must be built or found.
- **Township Building** — Claim land, build structures, hire NPCs, manage morale. Your township grows from a bedroll to a walled stronghold over 5 stages.
- **7 Professions, 35 Branches** — Gathering, Hunting, Crafting, Township, Survival, Chemistry, Combat. 265 skill points. Master skills require full commitment.
- **8 Core Attributes** — Biomass, Neural Integrity, Kinetic Efficiency, Quantum Aptitude, Synthetic Affinity, Chronal Stability, Entropic Resistance, Gravitic Harmony. 37 derived stats with diminishing returns.
- **Faction Warfare** — Five factions claw for the surface. Pledge to one and earn its gear, contracts, and territory bonuses — at the cost of every other crown.
- **Action Combat** — Vendetta melee and ranged loops against six classes of horror, each with unique movement archetypes and weaknesses.
- **Living NPCs** — Every NPC runs the same stats, perks, and XP system you do. They harvest, craft, and level up on their own.
- **Rift Exploration** — Procedurally configured anomaly fields. Protection, preparation, and a good extraction plan are essential.

## Architecture

Monorepo (`pnpm workspace`) with:

| Package | Purpose |
|---|---|
| `artifacts/website` | Marketing site (Vite + React + Tailwind) |
| `artifacts/arpg-game` | Game client (Three.js + React) |
| `artifacts/api-server` | API server (Express 5 + Drizzle + PostgreSQL) |
| `artifacts/admin` | Admin panel (React + Vite) |
| `artifacts/asset-studio` | Asset browser (React + Three.js) |
| `lib/db` | Database schema (Drizzle ORM) |
| `lib/api-zod` | Shared Zod schemas |
| `lib/api-client-react` | React Query API hooks |

## Stack

- **Frontend**: Vercel (auto-deploy from `main`)
- **Backend**: Docker (Railway or VPS) via `Dockerfile` + `docker-compose.yml`
- **Database**: PostgreSQL 17 (Drizzle ORM)
- **Assets**: Cloudflare R2 CDN (`assets.grudge-studio.com`)
- **Auth**: Puter.js (browser) → Grudge ID (server)
- **DNS/CDN**: Cloudflare

## Quick Start

```bash
# Install dependencies
pnpm install

# Start the website (dev)
pnpm --filter @workspace/website dev

# Start the game client (dev)
pnpm --filter @workspace/arpg-game dev

# Start the API server (requires DATABASE_URL)
cp .env.example .env  # fill in values
pnpm --filter @workspace/api-server dev
```

## Production Deployment

### Frontend (Vercel)
Connected to GitHub — pushes to `main` auto-deploy.

### Backend (Docker)
```bash
cp .env.example .env  # fill in production values
docker compose up -d --build
```

### Assets
Binary assets (~7 GB) are served from R2 CDN. They are gitignored.
Set `VITE_ASSET_CDN_URL` in Vercel env vars to point at your R2 bucket.

## Environment Variables

See [`.env.example`](.env.example) for the full list.

## Credits

Created by **Racalvin The Pirate King** · Grudge Studio
