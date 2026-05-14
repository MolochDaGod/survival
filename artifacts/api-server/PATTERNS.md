# API Server — Architecture Patterns

This document is the authoritative reference for how new HTTP
endpoints should be structured in `@workspace/api-server`. The
`characters` route is the canonical example; this file explains the
shape and lists the routes that still need to be migrated.

## The three layers

```
src/routes/         ← thin HTTP adapter; parse req, call service,
                      map ServiceError → HTTP status
src/services/       ← business rules; Zod input/output validation;
                      throws ServiceError on domain failures
src/repositories/   ← the only place that imports @workspace/db
                      and writes Drizzle queries
```

### Why these layers

- **Repositories** keep all SQL in one place per aggregate. If the
  schema changes, the blast radius is one file. They never import
  from Express, never throw HTTP errors, never validate input.
- **Services** are framework-agnostic. They orchestrate one or more
  repository calls, enforce invariants, and validate inputs/outputs
  with Zod schemas (the same schemas used by `@workspace/api-spec`
  for client codegen). They throw `ServiceError(code, message,
  status?)` for any domain failure — never `res.status(...).send`.
- **Routes** are thin: parse `req.params`/`req.body`, call the
  service, map `ServiceError → res.status(err.status).json(...)`,
  let express-async-errors propagate everything else to the global
  error handler. No business logic, no SQL.

## Reference implementation

Read these three files together — they are the smallest realistic
example of the pattern:

- `src/routes/characters.ts` — thin route handlers with the
  `ServiceError` → HTTP mapping
- `src/services/charactersService.ts` — Zod schemas + business
  rules + `ServiceError` class
- `src/repositories/charactersRepository.ts` — Drizzle queries
  only, no validation, no HTTP knowledge

`charactersService.ts` is also the canonical place to look at how
`ServiceError` is constructed and what status codes map to which
domain failures (`'not_found'` → 404, `'forbidden'` → 403,
`'conflict'` → 409, `'invalid_input'` → 400, default → 500).

## Logging

**Never use `console.log` in server code** (this is a workspace-
wide rule, not specific to this artifact). Inside route handlers
use `req.log` (request-scoped pino child logger with `requestId`).
Outside request scope — services called from background jobs,
startup, scheduled tasks — import the singleton `logger` from
`src/logger.ts`.

Services are framework-agnostic, so they take an optional logger
argument from the caller; routes pass `req.log`, background callers
pass the singleton `logger`.

## Validation contract with the client

The Zod schemas declared in services are the same shape the client
expects via the OpenAPI codegen pipeline (see the workspace-level
`pnpm-workspace` skill, `references/openapi.md`). When you add a new
endpoint:

1. Add the path + schemas to `lib/api-spec` first.
2. Run `pnpm --filter @workspace/api-spec run codegen`.
3. Mirror the request/response Zod schemas in your service so
   server-side validation matches the generated client types.
4. Use the generated React Query hooks in clients — do not hand-
   write `fetch` calls against this API.

## Migration backlog

These routes currently mix concerns (route file directly imports
`@workspace/db` and writes Drizzle queries inline) and should be
migrated to the three-layer pattern as their domains evolve. The
refactor is **not** required to ship new features on these routes —
it pays off when the route grows past ~150 lines or when the same
query starts being needed in two places.

| Route | Touches DB directly | Notes |
|---|---|---|
| `accounts.ts` | yes | Auth boundary; high churn — migrate first |
| `assets.ts` | yes (heavy) | 32k+ row catalog; query reuse imminent |
| `assetStudio.ts` | yes | Shares schema with `assets`; consider one shared `assetsRepository` |
| `prefabs.ts` | yes | Small — easy migration |
| `savegame.ts` | minimal | Mostly object storage; thin layer is fine for now |
| `spawnRules.ts` | yes | Cross-references `creatures.csv` registry |
| `admin.ts` | yes | Privileged; migrate once auth boundary is settled |
| `health.ts` | no | Trivial probe — leave as-is |

Routes already on the pattern: **`characters.ts`** (reference).

## When to break the pattern

The pattern is the default, not a religion. Skip the service layer
when:

- The route is a trivial passthrough (e.g. `/healthz`).
- A migration script reads from one repository and writes to
  another with no business rules between — services can be a single
  helper instead of a class.

Skip the repository layer when:

- The route doesn't touch the database at all (e.g. proxies,
  static config endpoints).

Always keep the route file thin. If you find yourself writing more
than ~10 lines of logic inside a route handler, that logic belongs
in a service.
