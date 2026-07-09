# KnowHub

KnowHub is a multi-tenant organizational wiki platform. It is built as a **pnpm monorepo** managed by Turborepo, with a modular monolith API, a dedicated search service, async workers, and a Next.js frontend.

## Architecture

```
Browser
  │
  ├─── Next.js frontend (apps/web)       :3000
  │         │
  │         ├── REST  ──►  API server (apps/api)        :3001
  │         │                    │
  │         └── REST  ──►  Search service (apps/search) :3002
  │
  └──── (async)
             │
             └── SQS  ──►  Worker (apps/worker)
                                 │
                                 ├── S3 (quarantine → served)
                                 └── OpenSearch index writes
```

| Service | Package | Description |
|---------|---------|-------------|
| Web | `@wiki/web` | Next.js 15 App Router frontend |
| API | `@wiki/api` | Express.js modular monolith |
| Search | `@wiki/search` | OpenSearch query service |
| Worker | `@wiki/worker` | SQS consumer for PDF processing and search indexing |

Shared packages live under `packages/` (`@wiki/db`, `@wiki/types`, `@wiki/config`).

For deeper design notes, see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [docs/IMPLEMENTATION.md](docs/IMPLEMENTATION.md).

---

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Node.js | 20+ | [nodejs.org](https://nodejs.org) or `nvm install 20` |
| pnpm | 9.x | `npm install -g pnpm@9` |
| Docker Desktop | latest | [docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop) |

---

## First-time setup

### 1. Clone and install dependencies

```bash
git clone https://github.com/FissionHQ/KnowHub.git
cd KnowHub
pnpm install
```

The `postinstall` script in `apps/web` copies the HeroUI stylesheet into `src/styles/heroui.css`.

### 2. Configure environment variables

```bash
cp .env.example .env
```

For local development with Docker Compose, use these values (they match the port mappings in `docker-compose.yml`):

| Variable | Local value |
|----------|-------------|
| `DATABASE_URL` | `postgresql://wiki:wiki@localhost:5434/wiki` |
| `DATABASE_URL_READER` | `postgresql://wiki:wiki@localhost:5434/wiki` |
| `REDIS_URL` | `redis://localhost:6380` |
| `OPENSEARCH_URL` | `http://localhost:9200` |
| `S3_ENDPOINT` | `http://localhost:4566` |
| `SQS_ENDPOINT` | `http://localhost:4566` |
| `SQS_PDF_QUEUE_URL` | `http://localhost:4566/000000000000/wiki-pdf-processing` |
| `SQS_INDEX_QUEUE_URL` | `http://localhost:4566/000000000000/wiki-search-indexing` |
| `SES_ENDPOINT` | `http://localhost:1025` |
| `SES_FROM_ADDRESS` | `noreply@localhost` |
| `JWT_SECRET` | Any string of 32+ characters |
| `BASE_DOMAIN` | `localhost` |

> **Note:** `.env.example` uses default Postgres/Redis ports (`5432`, `6379`). When running infrastructure via Docker Compose, update those to `5434` and `6380` as shown above.

### 3. Start infrastructure

```bash
docker compose up -d
```

This starts:

| Service | Host port |
|---------|-----------|
| PostgreSQL 16 | 5434 |
| Redis 7 | 6380 |
| OpenSearch 2.17 | 9200 |
| LocalStack (S3, SQS, SES) | 4566 |

LocalStack automatically creates S3 buckets and SQS queues on startup via `scripts/localstack-init.sh`.

Wait for all containers to become healthy:

```bash
docker compose ps
```

### 4. Run database migrations

```bash
pnpm db:generate && pnpm db:migrate
```

Run this once on first setup, and again whenever the Drizzle schema changes.

### 5. (Optional) Seed development data

```bash
pnpm db:seed
```

This creates a sample organization, users, spaces, and documents. After seeding, sign in at [http://localhost:3000/login](http://localhost:3000/login) with:

| Field | Value |
|-------|-------|
| Admin email | `admin@localhost` |
| Member email | `member@localhost` |
| Password (both users) | `password123` |

---

## Running the application

Start all services in parallel:

```bash
pnpm dev
```

| Service | URL |
|---------|-----|
| Web (Next.js) | http://localhost:3000 |
| API (Express) | http://localhost:3001 |
| Search service | http://localhost:3002 |
| Worker | Background process (no HTTP port) |

### Run individual services

```bash
pnpm --filter @wiki/web dev
pnpm --filter @wiki/api dev
pnpm --filter @wiki/search dev
pnpm --filter @wiki/worker dev
```

### Stop everything

```bash
# Stop Node services
Ctrl+C   # in the terminal running pnpm dev

# Stop infrastructure (data preserved)
docker compose down
```

To wipe all persisted data (Postgres, Redis, OpenSearch):

```bash
docker compose down -v
```

---

## Optional dev tools

Start OpenSearch Dashboards and MailHog with the `tools` profile:

```bash
docker compose --profile tools up -d
```

| Tool | URL | Purpose |
|------|-----|---------|
| OpenSearch Dashboards | http://localhost:5601 | Browse and query the search index |
| MailHog | http://localhost:8025 | Inspect outgoing emails |

---

## Project structure

```
KnowHub/
├── apps/
│   ├── api/          Express API (modular monolith)
│   ├── search/       OpenSearch query service
│   ├── web/          Next.js 15 frontend
│   └── worker/       SQS consumer (PDF + search indexing)
├── packages/
│   ├── config/       Zod-validated environment schemas
│   ├── db/           Drizzle ORM schema, migrations, RLS
│   └── types/        Shared TypeScript types
├── scripts/
│   └── localstack-init.sh
├── docs/             Architecture and implementation notes
└── docker-compose.yml
```

---

## Common commands

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start all services |
| `pnpm build` | Production build of all apps |
| `pnpm type-check` | TypeScript check across all packages |
| `pnpm lint` | ESLint across all packages |
| `pnpm test` | Run tests across all packages |
| `pnpm db:generate` | Generate SQL migrations from Drizzle schema |
| `pnpm db:migrate` | Apply pending migrations to Postgres |
| `pnpm db:seed` | Seed local development data |
| `docker compose up -d` | Start infrastructure containers |
| `docker compose down` | Stop infrastructure (data preserved) |
| `docker compose down -v` | Stop infrastructure and wipe all data |

---

## Troubleshooting

**Ports already in use**

```bash
lsof -i :3000   # or 3001, 3002, 5434, 6380, 9200, 4566
```

**LocalStack buckets or queues not created**

The init script runs on container start. Force it to re-run:

```bash
docker compose restart localstack
```

**Database migration errors**

Reset Postgres and re-apply migrations:

```bash
docker compose down -v
docker compose up -d
pnpm db:generate && pnpm db:migrate
```

**HeroUI styles not appearing**

Re-run the postinstall copy step:

```bash
pnpm install
# or directly:
cp apps/web/node_modules/@heroui/styles/dist/heroui.min.css apps/web/src/styles/heroui.css
```

**Worker not processing messages**

Check LocalStack health and queue creation:

```bash
docker compose ps localstack
docker compose exec localstack awslocal sqs list-queues
```

---

## Further reading

- [docs/LOCAL_SETUP.md](docs/LOCAL_SETUP.md) — Extended local development guide
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — System design and data flow
- [docs/IMPLEMENTATION.md](docs/IMPLEMENTATION.md) — Feature and package inventory
