# ─── Stage 1: deps ────────────────────────────────────────────────────────────
FROM node:22-alpine AS deps
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY apps/search/package.json ./apps/search/
COPY packages/types/package.json ./packages/types/
COPY packages/config/package.json ./packages/config/
COPY packages/db/package.json ./packages/db/

RUN pnpm install --frozen-lockfile --filter @wiki/search...

# ─── Stage 2: build ────────────────────────────────────────────────────────────
FROM deps AS builder
WORKDIR /app

COPY tsconfig.base.json ./
COPY packages/types ./packages/types
COPY packages/config ./packages/config
COPY packages/db ./packages/db
COPY apps/search ./apps/search

RUN pnpm --filter @wiki/types build && \
    pnpm --filter @wiki/config build && \
    pnpm --filter @wiki/db build && \
    pnpm --filter @wiki/search build

# ─── Stage 3: production image ────────────────────────────────────────────────
FROM node:22-alpine AS runner
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 wikisearch

COPY --from=builder --chown=wikisearch:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=wikisearch:nodejs /app/apps/search/dist ./apps/search/dist
COPY --from=builder --chown=wikisearch:nodejs /app/apps/search/package.json ./apps/search/
COPY --from=builder --chown=wikisearch:nodejs /app/packages ./packages

USER wikisearch

ENV NODE_ENV=production
EXPOSE 3002

CMD ["node", "apps/search/dist/server.js"]
