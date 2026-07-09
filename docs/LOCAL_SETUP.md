# Local Development Setup

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Node.js | 20+ | https://nodejs.org or `nvm install 20` |
| pnpm | 9.x | `npm install -g pnpm@9` |
| Docker Desktop | latest | https://www.docker.com/products/docker-desktop |

---

## First-time setup

### 1. Clone and install dependencies

```bash
git clone <repo-url>
cd fissiondocs
pnpm install
```

The `postinstall` script in `apps/web` automatically copies the HeroUI stylesheet into `src/styles/heroui.css`.

### 2. Configure environment variables

```bash
cp .env.example .env
```

Open `.env` and fill in the required values. For local development the defaults work as-is — set `JWT_SECRET` to any string of 32+ characters.

Key variables to check:

| Variable | Default / Notes |
|----------|----------------|
| `DATABASE_URL` | `postgresql://wiki:wiki@localhost:5434/wiki` |
| `REDIS_URL` | `redis://localhost:6380` |
| `OPENSEARCH_URL` | `http://localhost:9200` |
| `JWT_SECRET` | Set to any 32+ char string (same auth model in dev and production) |
| `BASE_DOMAIN` | `localhost` |
| `S3_ENDPOINT` | `http://localhost:4566` (LocalStack) |
| `SQS_ENDPOINT` | `http://localhost:4566` (LocalStack) |
| `SES_ENDPOINT` | `http://localhost:4566` (LocalStack) |
| `S3_QUARANTINE_BUCKET` | `wiki-quarantine` |
| `S3_SERVED_BUCKET` | `wiki-served` |
| `SQS_PDF_QUEUE_URL` | `http://localhost:4566/000000000000/wiki-pdf-processing` |
| `SQS_INDEX_QUEUE_URL` | `http://localhost:4566/000000000000/wiki-search-indexing` |
| `SES_FROM_ADDRESS` | `noreply@localhost` |

### 3. Start infrastructure

```bash
docker compose up -d
```

This starts:

| Service | Local port |
|---------|-----------|
| PostgreSQL 16 | 5434 |
| Redis 7 | 6380 |
| OpenSearch 2.17 | 9200 |
| LocalStack (S3 + SQS + SES) | 4566 |

LocalStack automatically creates the S3 buckets and SQS queues on startup via `scripts/localstack-init.sh`.

Wait for all containers to be healthy before continuing:

```bash
docker compose ps
```

All services should show `(healthy)`.

### 4. Run database migrations

```bash
pnpm db:generate && pnpm db:migrate
```

This generates the SQL from the Drizzle schema and applies it to Postgres, including all Row Level Security policies.

Only needed once (or whenever the schema changes).

---

## Running the full stack

```bash
pnpm dev
```

Turborepo starts all services in parallel:

| Service | URL |
|---------|-----|
| Web (Next.js 15) | http://localhost:3000 |
| API (Express) | http://localhost:3001 |
| Search service | http://localhost:3002 |
| Worker (SQS consumer) | — (background process, no HTTP) |

---

## Stopping everything

```bash
# Stop Node services
Ctrl+C   # in the terminal running pnpm dev

# Stop infrastructure
docker compose down
```

To also wipe all persisted data (Postgres, Redis, OpenSearch):

```bash
docker compose down -v
```

---

## Optional dev tools

Start OpenSearch Dashboards and MailHog (email UI) with the `tools` profile:

```bash
docker compose --profile tools up -d
```

| Tool | URL | Purpose |
|------|-----|---------|
| OpenSearch Dashboards | http://localhost:5601 | Browse/query the search index |
| MailHog | http://localhost:8025 | Inspect outgoing emails |

---

## Running individual services

If you only want to work on one part of the stack:

```bash
# Frontend only
pnpm --filter @wiki/web dev

# API only
pnpm --filter @wiki/api dev

# Search service only
pnpm --filter @wiki/search dev

# Worker only
pnpm --filter @wiki/worker dev
```

---

## Common commands

| Command | What it does |
|---------|-------------|
| `pnpm dev` | Start all services |
| `pnpm build` | Production build of all apps |
| `pnpm type-check` | TypeScript check across all packages |
| `pnpm lint` | ESLint across all packages |
| `pnpm db:generate` | Generate SQL migrations from Drizzle schema |
| `pnpm db:migrate` | Apply pending migrations to Postgres |
| `docker compose up -d` | Start all infrastructure containers |
| `docker compose down` | Stop infrastructure (data preserved) |
| `docker compose down -v` | Stop infrastructure and wipe all data |

---

## Troubleshooting

**Ports already in use**

Check what's occupying a port:
```bash
lsof -i :3000   # or 3001, 3002, 5434, 6380, 9200, 4566
```

**LocalStack buckets/queues not created**

The init script runs automatically on container start. Force it to re-run:
```bash
docker compose restart localstack
```

**Database migration errors**

If migrations fail due to stale state, reset and re-apply:
```bash
docker compose down -v   # wipes Postgres volume
docker compose up -d
pnpm db:generate && pnpm db:migrate
```

**HeroUI styles not appearing**

The stylesheet is copied from `node_modules` at install time. Re-run:
```bash
pnpm install
# or directly:
cp apps/web/node_modules/@heroui/styles/dist/heroui.min.css apps/web/src/styles/heroui.css
```

**Worker not processing messages**

Check LocalStack is healthy and the queues exist:
```bash
docker compose ps localstack
awslocal sqs list-queues   # run inside the LocalStack container
```
