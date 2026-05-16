# ── Grudge Nexus API Server ─────────────────────────────────────────────────
# Multi-stage build: install + bundle → slim runtime image.
#
# Build:  docker build -t grudge-nexus-api .
# Run:    docker run -p 5000:5000 --env-file .env grudge-nexus-api
# ────────────────────────────────────────────────────────────────────────────

# ── Stage 1: Install & build ────────────────────────────────────────────────
FROM node:24-slim AS builder

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app
ENV DOCKER=1
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json tsconfig.json ./
COPY lib/ lib/
COPY artifacts/api-server/ artifacts/api-server/

RUN pnpm config set onlyBuiltDependencies '[]' --location project && \
    pnpm install --filter @workspace/api-server...

# Build the esbuild bundle
RUN pnpm --filter @workspace/api-server run build

# ── Stage 2: Production runtime ────────────────────────────────────────────
FROM node:24-slim AS runtime

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app
ENV DOCKER=1
COPY --from=builder /app/pnpm-lock.yaml /app/pnpm-workspace.yaml /app/package.json ./
COPY --from=builder /app/artifacts/api-server/package.json artifacts/api-server/package.json
COPY --from=builder /app/lib/db/package.json lib/db/package.json
COPY --from=builder /app/lib/api-zod/package.json lib/api-zod/package.json

# Install only production dependencies (externals that esbuild doesn't bundle)
RUN pnpm config set onlyBuiltDependencies '[]' --location project && \
    pnpm install --prod --filter @workspace/api-server...

COPY --from=builder /app/artifacts/api-server/dist/ artifacts/api-server/dist/

ENV NODE_ENV=production
ENV PORT=5000

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:5000/api/healthz').then(r=>{if(!r.ok)throw r.status}).catch(()=>process.exit(1))"

CMD ["node", "--enable-source-maps", "artifacts/api-server/dist/index.mjs"]
