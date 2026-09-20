# Spawn.co ↔ Grudges connection

**Product lock:** Grudges remains the voxel-era lead MMO on Grudge Studio hosts.  
Spawn is a **parallel multiplayer room / agent-edit / publish surface** — not a DNS swap for Vercel.

Canonical Grudges SSOT: `docs/PRODUCTION_SSOT.md` · `docs/FLEET_CONNECTIONS.md` · `docs/PRODUCT_ERA_VOXEL.md`

---

## 1. Live world (confirmed)

| Field | Value |
|-------|--------|
| **Play URL** | https://www.spawn.co/@survival/grudges |
| **Address** | `@survival/grudges` (agent docs also write `@@survival/grudges`) |
| **Code page** | https://www.spawn.co/@survival/grudges/code |
| **Git remote** | `https://git.spawn.co/@survival/grudges.git` |
| **appId** | `3e6fe5c4-3a5f-42ab-9e89-3e8fc230cc3d` |
| **worldId** | `e51b543f-7c9f-488f-9d48-9bcde5cd9ee0` |
| **Owner handle** | `survival` (human) |
| **App name** | Grudges |
| **Infra** | V4 |

Resolve (no auth):

```bash
curl -sS "https://www.spawn.co/api/resolve-adventure?address=@survival/grudges"
```

---

## 2. Who owns what

| Concern | Owner | Notes |
|---------|--------|--------|
| **Browser play (full ARPG)** | `grudges.grudge-studio.com` | Vercel project `survival` |
| **Player bag / characters / wallet** | Railway `survival-api-production.up.railway.app` | One bag SSOT — never invent a second |
| **SSO** | `id.grudge-studio.com` | Grudge ID |
| **Meshes / icons CDN** | `assets.grudge-studio.com` | R2; D1 = asset index only |
| **Systems catalog** | `/api/systems*` + `/data/*.json` | Recipes, perks, professions, craft |
| **Spawn room + agent edit** | Spawn world `@survival/grudges` | Git push to `git.spawn.co` is live in open rooms |
| **Spawn asset carry** | `PUT /api/sdk/v1/<worldId>/assets/…` | Bytes on Spawn CDN for the room tree |

**Hard split:** Spawn does **not** replace Railway player SSOT or Grudge ID.  
Pointing `grudges.grudge-studio.com` at Spawn is **out of scope** — bring-existing-Three.js means rewrite into Spawn’s tree grammar + PUT assets.

---

## 3. Grudges hosts (external SSOT for Spawn agents)

| Link | URL |
|------|-----|
| Site | https://grudges.grudge-studio.com |
| Play client | https://grudges.grudge-studio.com/arpg-game/ |
| Alias | https://survival.grudge-studio.com → 301 grudges |
| API | https://survival-api-production.up.railway.app |
| Systems overview | https://grudges.grudge-studio.com/api/systems/overview |
| Health | https://survival-api-production.up.railway.app/api/healthz |
| Auth | https://id.grudge-studio.com |
| Assets | https://assets.grudge-studio.com |

Smoke from any agent (no Spawn token required):

```bash
curl -sS https://grudges.grudge-studio.com/api/systems/overview
curl -sS https://survival-api-production.up.railway.app/api/healthz
```

---

## 4. Spawn agent API (platform)

Official contract: https://www.spawn.co/llms.txt · https://www.spawn.co/openapi.json · https://www.spawn.co/llms-full.txt

| Step | Call |
|------|------|
| Sign up | `POST https://www.spawn.co/api/agent/v1/signup` `{"username":"…","name":"…"}` → `sak_…` **once** |
| Who am I | `GET /api/agent/v1/me` + `Authorization: Bearer sak_…` |
| Worlds | `GET /api/agent/v1/worlds` |
| Access | `GET /api/agent/v1/access?world=<worldId>` |
| Create world | `POST /api/agent/v1/games` `{"name":"…","starter":"3d-voxels"}` (Grudges already exists — do not birth a duplicate) |
| Session grant | `POST /api/session/grant/agent` `{"world":"@survival/grudges"}` → `attachUrl` WebSocket |
| Join (CLI) | `bun add -g @spawnco/client` · `SPAWN_TOKEN=sak_…` · `spawn client join @survival/grudges` |
| Docs for this world | `GET /api/sdk/v1/e51b543f-7c9f-488f-9d48-9bcde5cd9ee0/agent/docs` |
| Rooms / logs | `GET …/agent/rooms` · `GET …/agent/logs` |
| Read-only exec | `POST …/agent/exec` `{"script":"…"}` (needs a live room) |
| Carry asset | `PUT …/assets/value.<sha256>.<ext>` + bytes body |
| Publish | `POST /api/games/3e6fe5c4-3a5f-42ab-9e89-3e8fc230cc3d/publish` |

**Token hygiene:** keep `SPAWN_TOKEN` / `sak_…` in env only — never commit, log, or paste into docs.

Git clone (password = token; username = Spawn username from `me`):

```bash
git clone https://git.spawn.co/@survival/grudges.git
# HTTPS basic: user = your Spawn username, password = sak_…
```

Every push to `main` is live in open rooms within ~1s (no Vercel build).

---

## 5. Connection matrix (recommended wiring)

| Flow | Spawn side | Grudges side |
|------|------------|--------------|
| **Play full MMO** | Optional deep-link / marketing out to grudges | `grudges.grudge-studio.com/arpg-game/` |
| **Play Spawn room** | `@survival/grudges` bodies + engine tree | Catalog/read APIs only if scripts fetch them |
| **Agent edit** | Clone `git.spawn.co/@survival/grudges.git`, edit, push | Source of truth for *Spawn tree* only |
| **Recipes / perks / professions** | Fetch JSON for UI/rules hints | `/api/systems*` or `/data/grudges-systems.json` |
| **Bag / character save** | Do not store player bag on Spawn | Railway via Grudge ID + `/api/*` |
| **Meshes** | PUT bytes to Spawn CDN for room | Prefer CDN URLs from `assets.grudge-studio.com` when CORS allows; else carry |
| **Auth** | Spawn account / session grant | Grudge ID for fleet bag |

Suggested starter for a voxel-shaped Spawn skeleton if recreating: `"starter": "3d-voxels"`. Existing world already uses infra V4 — read `AGENTS.md` + `tomeApi` from agent/docs before rewriting.

---

## 6. Bring-existing path (Three.js → Spawn)

Spawn does **not** mount the Vercel SPA as-is. Official road (from Spawn llms.txt):

1. Inventory render loop, physics, camera, HUD, inputs, assets, win rules.  
2. Agent account + editor standing on `@survival/grudges`.  
3. Map into Spawn tree: `update` / `tick` / `physics:` kinds / `ui.js` / seeded `ctx.random()`.  
4. `PUT` art bytes → `/cdn/value.<sha256>.<ext>`.  
5. Replace clone tree, push `main`, `spawn client join @survival/grudges --ttl 600`, read agent/logs.  
6. Share play URL; `POST …/publish` for feed.

Keep **Railway + Grudge ID** as player SSOT even after a Spawn rewrite. Spawn room state ≠ account bag.

---

## 7. Env checklist (local agent)

```bash
# Spawn (never commit)
export SPAWN_TOKEN=sak_…          # from signup or reconnect

# Grudges (public / fleet)
export GRUDGES_SITE=https://grudges.grudge-studio.com
export GRUDGES_API=https://survival-api-production.up.railway.app
export GRUDGES_CDN=https://assets.grudge-studio.com
export GRUDGE_ID_HOST=https://id.grudge-studio.com

# This Spawn world
export SPAWN_WORLD_ADDRESS=@survival/grudges
export SPAWN_WORLD_ID=e51b543f-7c9f-488f-9d48-9bcde5cd9ee0
export SPAWN_APP_ID=3e6fe5c4-3a5f-42ab-9e89-3e8fc230cc3d
```

---

## 8. Quick prove script

```bash
# Spawn world exists
curl -sS "https://www.spawn.co/api/resolve-adventure?address=@survival/grudges"

# Grudges API alive
curl -sS "$GRUDGES_SITE/api/systems/overview" | head
curl -sS "$GRUDGES_API/api/healthz"

# With token: standing + docs
curl -sS -H "authorization: Bearer $SPAWN_TOKEN" \
  "https://www.spawn.co/api/agent/v1/access?world=$SPAWN_WORLD_ID"
curl -sS -H "authorization: Bearer $SPAWN_TOKEN" \
  "https://www.spawn.co/api/sdk/v1/$SPAWN_WORLD_ID/agent/docs" | head
```

---

## 9. Related docs

| Doc | Role |
|-----|------|
| `PRODUCTION_SSOT.md` | Grudges deploy + systems map |
| `FLEET_CONNECTIONS.md` | Fleet URL table |
| `PRODUCT_ERA_VOXEL.md` | Voxel-era product lock |
| `AI_WORKER_DEPLOY_GRUDGES.md` | Worker deploy checklist |
| https://www.spawn.co/llms.txt | Spawn agent contract |

Updated: 2026-09-20 — world `@survival/grudges` verified via resolve-adventure (`ok: true`).
