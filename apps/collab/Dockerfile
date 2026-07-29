# ─── Stage 1: deps ────────────────────────────────────────────────────────────
FROM node:22-alpine AS deps
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY apps/collab/package.json ./apps/collab/
COPY packages/types/package.json ./packages/types/
COPY packages/config/package.json ./packages/config/
COPY packages/db/package.json ./packages/db/
COPY packages/doc-collab/package.json ./packages/doc-collab/

# --ignore-scripts: the root postinstall/prepare scripts run turbo builds,
# which need turbo.json and sources that aren't copied at this stage.
RUN pnpm install --frozen-lockfile --ignore-scripts --filter @wiki/collab...

# ─── Stage 2: build ────────────────────────────────────────────────────────────
FROM deps AS builder
WORKDIR /app

COPY tsconfig.base.json ./
COPY packages/types ./packages/types
COPY packages/config ./packages/config
COPY packages/db ./packages/db
COPY packages/doc-collab ./packages/doc-collab
COPY apps/collab ./apps/collab

RUN pnpm --filter @wiki/types build && \
    pnpm --filter @wiki/config build && \
    pnpm --filter @wiki/doc-collab build && \
    pnpm --filter @wiki/db build && \
    pnpm --filter @wiki/collab build

# ─── Stage 3: production image ────────────────────────────────────────────────
FROM node:22-alpine AS runner
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 wikicollab

COPY --from=builder --chown=wikicollab:nodejs /app/node_modules ./node_modules
# pnpm symlinks each package's direct deps under its own node_modules
COPY --from=builder --chown=wikicollab:nodejs /app/apps/collab/node_modules ./apps/collab/node_modules
COPY --from=builder --chown=wikicollab:nodejs /app/apps/collab/dist ./apps/collab/dist
COPY --from=builder --chown=wikicollab:nodejs /app/apps/collab/package.json ./apps/collab/
COPY --from=builder --chown=wikicollab:nodejs /app/packages ./packages

USER wikicollab

ENV NODE_ENV=production
EXPOSE 3003

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3003/health || exit 1

CMD ["node", "apps/collab/dist/index.js"]
