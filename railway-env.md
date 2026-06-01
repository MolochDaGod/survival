# Railway Production Environment Variables

Set these in the Railway service dashboard → Variables tab.  
The API server (`@workspace/api-server`) reads them at boot via `process.env`.

## Required

| Variable | Example | Notes |
|---|---|---|
| `DATABASE_URL` | `postgres://grudge:xxx@containers-us.railway.app:5432/railway` | Railway auto-sets this when you link a Postgres addon |
| `PORT` | `5000` | Railway sets this automatically — do NOT override |
| `NODE_ENV` | `production` | Set in Dockerfile; Railway inherits |

## CORS (critical)

| Variable | Value |
|---|---|
| `CORS_ORIGINS` | `https://grudgewarlords.com,https://grudge-studio.com,https://*.grudge-studio.com,https://*.vercel.app,https://*.puter.site,http://localhost:5173` |

The server now supports wildcards (`*`). Every Vercel preview deploy and every `*.grudge-studio.com` subdomain is covered without listing each one.

## Auth & Security

| Variable | Notes |
|---|---|
| `ADMIN_TOKEN` | Hex string (48+ chars). Used by `/admin/*` routes. Auto-generated in dev if missing. **Must** be set in prod. |
| `JWT_SECRET` | Shared secret for signing Grudge ID JWTs (same value as Cloudflare Workers). |
| `INTERNAL_API_KEY` | Server-to-server API key for cross-service calls. |

## Cloudflare R2 (object storage)

| Variable | Example |
|---|---|
| `CF_ACCOUNT_ID` | `ee475864561b02d4588180b8b9acf694` |
| `OBJECT_STORAGE_KEY` | R2 access key ID |
| `OBJECT_STORAGE_SECRET` | R2 secret access key |
| `OBJECT_STORAGE_REGION` | `auto` |
| `OBJECT_STORAGE_PUBLIC_URL` | `https://assets.grudge-studio.com` |
| `R2_BUCKET_ASSETS` | `grudge-assets` |
| `R2_BUCKET_OBJECTSTORE` | `objectstore-assets` |

## Vercel Frontend Env Vars

Set these in the **Vercel** project settings (not Railway):

| Variable | Value |
|---|---|
| `VITE_WS_URL` | `wss://survival-api-production.up.railway.app` |
| `VITE_GRUDGE_API_BASE` | `https://survival-api-production.up.railway.app` |
| `VITE_ASSET_CDN_URL` | `https://assets.grudge-studio.com/grudge-nexus` |

## Deployment Checklist

1. **Railway**: Only `@workspace/api-server` + Postgres live here. Phantom services have been deleted (done 2026-05-24). If Railway's monorepo scanner re-creates them, delete immediately.
2. **Push schema**: Use the public proxy URL (not the internal one):
   ```powershell
   $env:DATABASE_URL="postgresql://postgres:<password>@zephyr.proxy.rlwy.net:41964/railway"
   pnpm db:push
   ```
3. **Verify health**: `curl https://survival-api-production.up.railway.app/api/healthz` → `{"status":"ok"}`
4. **WebSocket test**: `new WebSocket('wss://survival-api-production.up.railway.app/api/realtime')` — should connect and receive `welcome` message.
5. **CORS test**: From any `*.vercel.app` preview, `fetch('/api/healthz')` should return 200 (wildcard CORS is active).
6. **Graceful shutdown**: The server drains connections on SIGTERM (15s timeout). Railway zero-downtime deploys work automatically.

## Server Features

- **CORS**: Regex-based wildcard matching (`*.vercel.app`, `*.grudge-studio.com`). Shared between HTTP and WebSocket.
- **WebSocket origin validation**: WS upgrade requests are checked against the same CORS allowlist.
- **Graceful shutdown**: SIGTERM → stop accepting connections → close WebSockets (1012) → drain DB pool → exit.
- **Rate limiting**: 600 req/min global, 60 write/min. Health checks exempt.
- **Structured logging**: Pino with request/response serialization.
