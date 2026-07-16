# KnowHub — High-Level System Design

## Overview

KnowHub is a **multi-tenant organizational wiki** — teams get isolated knowledge bases (Spaces + Documents) with rich-text editing, PDF processing, full-text search, and role-based access control. Each tenant is isolated at both the application layer (JWT claims) and database layer (PostgreSQL Row-Level Security).

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT (Browser)                        │
│                     Next.js 15 App Router :3000                 │
│   Login │ Spaces │ Doc Editor (Tiptap) │ PDF Viewer │ Admin     │
└────────────────────────────┬────────────────────────────────────┘
                             │ HTTP (cookie auth)
              ┌──────────────┴──────────────┐
              │  Next.js Middleware          │
              │  (auth guard → /login)       │
              │  Rewrites:                   │
              │   /api/*   → :3001           │
              │   /search/* → :3002          │
              └──────────────┬──────────────┘
                             │
            ┌────────────────┼────────────────┐
            ▼                                 ▼
┌───────────────────┐             ┌───────────────────┐
│   API Service     │             │  Search Service   │
│   Express :3001   │             │  Express :3002    │
│                   │             │                   │
│ Middleware stack: │             │ OpenSearch bool   │
│  JWT verify       │             │ query + ACL filter│
│  RLS SET LOCAL    │             │ Fuzzy match,      │
│  Redis ACL cache  │             │ highlights,       │
│                   │             │ autocomplete      │
│ Routers:          │             └────────┬──────────┘
│  /auth            │                      │
│  /users           │             ┌────────▼──────────┐
│  /groups          │             │  OpenSearch 2.17  │
│  /spaces          │◄────────────│  wiki-documents   │
│  /documents       │  (S3        │  (knn_vector field│
│  /attachments     │   presigned │   reserved for AI)│
│  /admin           │   URLs)     └───────────────────┘
└─────┬──────┬──────┘
      │      │
      │      └──────────────────────────────┐
      │  DB queries                         │ SQS enqueue
      ▼                                     ▼
┌─────────────┐                  ┌─────────────────────┐
│ PostgreSQL  │                  │   Worker Service    │
│     16      │                  │                     │
│             │◄─────────────────│ Polls 2 SQS queues: │
│ RLS per org │  (ACL lookups)   │                     │
│ 13 tables:  │                  │ 1. PDF Processing:  │
│  orgs,      │                  │    S3 quarantine    │
│  users,     │                  │    → validate PDF   │
│  spaces,    │                  │    → extract text   │
│  documents, │                  │    → S3 served      │
│  versions,  │                  │    → OS index       │
│  attachments│                  │                     │
│  audit_log  │                  │ 2. Search Indexing: │
│  ...        │                  │    doc upsert/delete│
└─────────────┘                  │    → OpenSearch     │
                                 └──────────┬──────────┘
                                            │
              ┌─────────────────────────────┼──────────────┐
              ▼                             ▼              ▼
     ┌──────────────┐            ┌────────────────┐  ┌──────────┐
     │    Redis 7   │            │   AWS S3 /     │  │ AWS SQS  │
     │              │            │   LocalStack   │  │          │
     │ ACL group    │            │                │  │ wiki-pdf │
     │ cache 30s TTL│            │ quarantine     │  │ wiki-idx │
     │              │            │ bucket (upload)│  │ + DLQs   │
     └──────────────┘            │ served bucket  │  └──────────┘
                                 │ (clean files)  │
                                 └────────────────┘
```

---

## Services

| Service | Tech | Port | Role |
|---|---|---|---|
| `apps/web` | Next.js 15, React 19, Tiptap, HeroUI | 3000 | Frontend — editor, viewer, admin UI |
| `apps/api` | Express.js, Drizzle ORM, jose | 3001 | REST API — auth, content, ACL, storage |
| `apps/search` | Express.js, OpenSearch client | 3002 | Dedicated query service with ACL filtering |
| `apps/worker` | AWS SDK, pdf-parse | — | Async background processor (PDF + indexing) |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15 (App Router), React 19, HeroUI, Tailwind CSS 4, Tiptap, SWR |
| API Backend | Express.js 4, Drizzle ORM, jose (JWT), Zod, Winston |
| Search Service | Express.js, OpenSearch client |
| Worker | AWS SDK v3 (SQS, S3, SES), pdf-parse, OpenSearch client |
| Database | PostgreSQL 16, Drizzle ORM (postgres.js driver) |
| Cache | Redis 7 (ioredis) |
| Search Index | OpenSearch 2.17 |
| Object Storage | AWS S3 / LocalStack (dev) |
| Message Queue | AWS SQS / LocalStack (dev) |
| Email | AWS SES / MailHog (dev) |
| Auth | HS256 JWT (httpOnly cookies) |
| Monorepo | pnpm workspaces + Turborepo |
| Language | TypeScript 5.6 (all services) |

---

## Database Schema

PostgreSQL 16 via Drizzle ORM. Row-Level Security enforced on every tenant table.

| Table | Purpose |
|---|---|
| `organizations` | Top-level tenant — subdomain, branding (JSONB), file size limits |
| `users` | Per-org users — roles: `admin / member / viewer`, statuses: `active / invited / deactivated` |
| `groups` | Named permission groups within an org |
| `group_memberships` | User ↔ Group many-to-many |
| `spaces` | Containers for documents within an org |
| `space_permissions` | Group → Space access grants (`view` or `edit`) |
| `documents` | Wiki pages or PDFs — `parentId` for tree hierarchy, versioned |
| `document_permissions` | Per-document ACL overrides (group or user level) |
| `document_versions` | Content snapshots on every edit |
| `attachments` | File uploads — tracks quarantine/served S3 keys and scan status |
| `audit_log` | Immutable event log with action, target (JSONB), IP address |
| `invite_tokens` | One-time invitation tokens (7-day TTL) |

---

## Core Design Decisions

### 1. Multi-tenancy via PostgreSQL RLS

Every table carries `org_id`. The API sets `SET LOCAL app.current_org_id = ?` at the start of every request. PostgreSQL RLS policies enforce tenant isolation at the DB level — a second safety net even if application code omits a filter.

### 2. Two-Queue Async Pipeline

File uploads land in S3 quarantine immediately, then an SQS message triggers the worker to:
- Validate PDF magic bytes
- Extract text via `pdf-parse`
- Move the file to the served S3 bucket (KMS-encrypted)
- Index content in OpenSearch

Document edits enqueue a `wiki-search-indexing` message so search stays eventually consistent without blocking the write path. Each queue has a DLQ with `maxReceiveCount = 3`.

### 3. ACL Denormalization in OpenSearch

Search documents store `acl_group_ids[]` and `acl_user_ids[]` directly in the index. Every query adds a `terms` filter using the requesting user's resolved group memberships — enforcement happens at query time, so unauthorized results are never returned.

### 4. Redis for Hot ACL Cache

Group membership lookups (needed on every request) are cached in Redis with a 30-second TTL. Cache is invalidated immediately when group membership changes.

### 5. Reserved Vector Field for AI Search (Phase 2)

The OpenSearch index already has a `knn_vector(1536)` field mapped with HNSW / cosine similarity — sized for OpenAI `text-embedding-3-small`. No schema migration will be needed when semantic search is added.

---

## Data Flow Summary

| Flow | Path |
|---|---|
| **Auth** | Login → API validates password → issues HS256 JWT in httpOnly cookie → Next.js middleware verifies on every request |
| **Document edit** | Tiptap editor → 3s debounce → `PATCH /api/documents/:id` → DB write + RLS → SQS `search-indexing` enqueue |
| **File upload** | Browser → `POST /api/attachments` multipart → API streams to S3 quarantine → SQS `pdf-processing` enqueue → worker processes async |
| **Search** | Browser → `/search?q=...` rewritten to search service → OpenSearch bool query with ACL filter → highlighted results |
| **Invite** | Admin creates token → DB record (7-day TTL) → (SES email planned) → user accepts at `/invite/:token` |

---

## Permission Resolution

1. Check document-level ACL overrides (group or user)
2. Fall back to space-level ACL (group → space permission)
3. `admin` role bypasses all group checks (but not cross-tenant RLS)

---

## Infrastructure (Local Dev via Docker Compose)

| Service | Image | Port |
|---|---|---|
| PostgreSQL 16 | `postgres:16-alpine` | 5434 |
| Redis 7 | `redis:7-alpine` | 6380 |
| OpenSearch 2.17 | `opensearchproject/opensearch:2.17.0` | 9200 |
| LocalStack 3.8 | `localstack/localstack:3.8` | 4566 |
| OpenSearch Dashboards | `opensearchproject/opensearch-dashboards:2.17.0` | 5601 |
| MailHog | `mailhog/mailhog` | 8025 (UI), 1025 (SMTP) |

---

## Planned but Not Yet Built

| Feature | Status |
|---|---|
| `apps/collab` — real-time collaboration (Yjs / Hocuspocus) | Stub directory, no source |
| Document tree navigation | `parentId` in schema; no UI or API |
| Trash / restore UI | Soft-delete works; no restore endpoint |
| Invite emails | SES client wired; send not called |
| AI semantic search | Vector field reserved; no embedding generation |
| Cognito auth migration | `cognito_sub` column reserved in `users` |
