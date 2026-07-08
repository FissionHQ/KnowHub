# ─── Stage 1: deps ────────────────────────────────────────────────────────────
FROM node:22-alpine AS deps
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY apps/worker/package.json ./apps/worker/
COPY packages/types/package.json ./packages/types/
COPY packages/config/package.json ./packages/config/
COPY packages/db/package.json ./packages/db/

RUN pnpm install --frozen-lockfile --filter @wiki/worker...

# ─── Stage 2: build ────────────────────────────────────────────────────────────
FROM deps AS builder
WORKDIR /app

COPY tsconfig.base.json ./
COPY packages/types ./packages/types
COPY packages/config ./packages/config
COPY packages/db ./packages/db
COPY apps/worker ./apps/worker

RUN pnpm --filter @wiki/types build && \
    pnpm --filter @wiki/config build && \
    pnpm --filter @wiki/db build && \
    pnpm --filter @wiki/worker build

# ─── Stage 3: production image ────────────────────────────────────────────────
FROM node:22-alpine AS runner
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 wikiworker

COPY --from=builder --chown=wikiworker:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=wikiworker:nodejs /app/apps/worker/dist ./apps/worker/dist
COPY --from=builder --chown=wikiworker:nodejs /app/apps/worker/package.json ./apps/worker/
COPY --from=builder --chown=wikiworker:nodejs /app/packages ./packages

USER wikiworker

ENV NODE_ENV=production

CMD ["node", "apps/worker/dist/index.js"]
