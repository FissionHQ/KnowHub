# Architecture

## Overview

Fissiondocs is a multi-tenant organizational wiki platform built as a **pnpm monorepo** managed by Turborepo. It follows a modular monolith pattern for the API with a clear upgrade path to microservices.

```
Browser
  │
  ├─── Next.js frontend (apps/web)  :3000
  │         │
  │         ├── REST  ──►  API server (apps/api)      :3001
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

---

## Services

### apps/api — Modular monolith

The primary backend. Every feature domain lives in `src/domains/<domain>/router.ts` and is composed in `src/app.ts`. All routers share the same PostgreSQL connection, Redis connection, S3 client, and SQS client — injected via constructor, not globals.

**Middleware pipeline:**

```
Request
  ↓ helmet (security headers)
  ↓ cors (*.BASE_DOMAIN + credentials)
  ↓ cookieParser
  ↓ express.json (2 MB limit)
  ↓ requestId (x-request-id header)
  ↓ morgan → Winston logger
  ↓ auth middleware  ← verifies JWT, populates req.tenant (partial)
  ↓ tenantContext middleware  ← sets Postgres RLS context; fills req.tenant.groupIds
  ↓ domain router
  ↓ errorHandler
```

**Domains:**

| Domain | Prefix | Responsibility |
|--------|--------|----------------|
| identity | `/users` | User invite, role change, deactivation |
| access | `/groups` | Group CRUD, membership management |
| navigation | `/spaces` | Space CRUD, space-level permissions |
| content | `/documents` | Document CRUD, version history, search queue |
| storage | `/documents/:id/attachments`, `/attachments/:id` | File upload, scan status, presigned view URL |
| admin | `/admin` | Audit log, org settings |

### apps/search — Search service

Separated from the API to allow independent horizontal scaling. Accepts the same JWTs as the API; resolves group membership by querying the DB directly (no Redis cache in this service currently).

Talks only to OpenSearch — no writes to PostgreSQL.

### apps/worker — Async processor

Polls two SQS queues concurrently (long-polling, 5 messages at a time):

| Queue | Message type | Handler |
|-------|-------------|---------|
| `wiki-pdf-processing` | `PDF_PROCESSING` | `PdfProcessor` |
| `wiki-search-indexing` | `SEARCH_INDEX` | `Indexer` |

Failed messages retry up to 3 times, then land in the DLQ.

### apps/web — Frontend

Next.js 15 App Router. Client components use SWR for data fetching. The API client (`lib/api.ts`) is a typed fetch wrapper — no SDK, no GraphQL.

---

## Multi-tenancy

Every tenant (organization) is identified by a UUID `org_id`. Isolation is enforced at two levels:

### 1. Application layer

The JWT carries `custom:org_id`. The auth middleware extracts it and the subdomain cross-check confirms the JWT was issued for the org that owns the subdomain being accessed:

```
host: acme.wiki.example.com  →  subdomain = "acme"
JWT: custom:org_slug = "acme"  ✓ match allowed
JWT: custom:org_slug = "corp"  ✗ rejected → 401
```

The `tenantContext` middleware then sets `req.tenant.orgId` and calls `setTenantContext(db, orgId)` which executes:

```sql
SELECT set_config('app.current_org_id', '<uuid>', true)
```

### 2. Database layer (PostgreSQL RLS)

Every tenant table has a row-level security policy:

```sql
CREATE POLICY tenant_isolation_<table> ON <table>
  USING (org_id = current_setting('app.current_org_id', true)::uuid);
```

`SET LOCAL` scope means the setting is cleared at transaction end — a connection pool cannot leak a tenant context across requests.

Tables that don't have a direct `org_id` column (e.g. `group_memberships`, `document_permissions`) use subquery policies that join back to a parent table that does.

The result: even if application code accidentally omits an `orgId` filter, the database returns no rows for the wrong tenant.

---

## Permission model

Permissions resolve in order: **document-level override → space-level ACL → deny**.

```
User → belongs to → Groups (many-to-many)
                        ↓
                  SpacePermissions (groupId, spaceId, accessLevel)
                        ↓ fallback if no document override
                  DocumentPermissions (groupId|userId, documentId, accessLevel)
```

Access levels: `view` (read-only) and `edit` (read + write). `edit` satisfies a `view` requirement.

Admins (`role = admin`) bypass group checks entirely — they can access all spaces and documents within their org. Cross-tenant access is still blocked by RLS regardless of role.

### Permission cache

Group membership (`userId → [groupId, ...]`) is cached in Redis with a 30 s TTL:

```
Key: acl:groups:<orgId>:<userId>
```

On any group membership change (add/remove member), the cache key is deleted **and** a pub/sub message is published to `acl-invalidate:<orgId>` so other API instances can drop their local state if applicable. The 30 s TTL acts as the backstop if the pub/sub message is lost.

---

## File upload pipeline

```
Browser
  │ multipart POST /documents/:id/attachments
  ↓
API server (multer, in-memory, 200 MB hard cap)
  │ writes to S3
  ↓
S3 quarantine bucket  (wiki-quarantine)
  │ INSERT INTO attachments (scanStatus = 'pending')
  │ SQS: PDF_PROCESSING message
  ↓
Worker: PdfProcessor
  ├── Fetch from quarantine
  ├── Validate %PDF magic bytes
  ├── pdf-parse → extract text
  ├── CopyObject → wiki-served (AES256 encrypted)
  ├── DeleteObject from quarantine
  ├── UPDATE attachments SET scanStatus = 'clean', s3Key = '...'
  └── Index in OpenSearch
  ↓
Browser polls GET /attachments/:id/status until ready
  ↓
Browser requests GET /attachments/:id/view
  ↓
API generates presigned S3 URL (5-min TTL, ACL-checked) → browser
```

Infected or unparseable files are marked `scanStatus = 'error'` and remain in quarantine.

> The current "scan" is a magic-byte check only. Production would add ClamAV (e.g. as a Lambda triggered by S3 event) writing the result back to the attachment record before the worker promotes the file.

---

## Search architecture

### Indexing

Documents are indexed asynchronously. Every write operation (create/update/delete) enqueues a `SEARCH_INDEX` message. The worker's `Indexer` class processes these and writes to OpenSearch.

At index time, the ACL is denormalized into the document:

```json
{
  "acl_group_ids": ["<groupId1>", "<groupId2>"],
  "acl_user_ids": ["<userId1>"]
}
```

This is a union of space-level group permissions + document-level group/user overrides.

### Querying

The search service enforces ACL at query time using OpenSearch filters:

```json
{
  "bool": {
    "should": [
      { "terms": { "acl_group_ids": ["<callerGroupId1>", ...] } },
      { "term":  { "acl_user_ids": "<callerId>" } }
    ],
    "minimum_should_match": 1
  }
}
```

This prevents users from seeing search results for documents they cannot access, even if they know the document ID.

### Index mapping

| Field | Type | Boosting |
|-------|------|---------|
| `title` | text (english) | 3× in multi_match |
| `tags` | keyword | 2× in multi_match |
| `body` | text (english) | 1× |
| `content_embedding` | knn_vector (1536-dim, HNSW) | Phase 2 — null now |

The `knn_vector` field is declared in the mapping from day one so Phase 2 AI search requires no re-index, only backfilling embeddings.

---

## Authentication

Users sign in with email and password. The API verifies credentials against `users.password_hash`, then issues an HS256 JWT signed with `JWT_SECRET`. The same model is used in local development and production.

Claims in the token:

| Claim | Value |
|-------|-------|
| `sub` | User UUID |
| `custom:org_id` | Organization UUID |
| `custom:org_slug` | Organization subdomain slug |
| `custom:role` | `admin` \| `member` \| `viewer` |

The auth middleware uses `jose` to verify the HS256 signature with `JWT_SECRET`. Tokens are accepted from the `Authorization: Bearer` header or the `wiki_token` httpOnly cookie set by the web BFF.

---

## Data flow: typical document edit

```
1. Browser: PATCH /api/documents/:id  { content: "<html>..." }
2. API auth middleware: verifies JWT → req.tenant.orgId, userId, userRole
3. API tenantContext middleware:
   a. SET LOCAL app.current_org_id = <orgId>
   b. Redis cache hit → req.tenant.groupIds = [...]
4. content router:
   a. SELECT document WHERE id = ? AND org_id = ?  (RLS applies)
   b. assertDocumentAccess(edit) → checks doc override → falls back to space ACL
   c. UPDATE documents SET contentRef = ?, version = version+1, updatedAt = now()
   d. INSERT INTO document_versions (versionNumber, contentSnapshot, editedBy)
   e. SQS SendMessage: { type: "SEARCH_INDEX", documentId, orgId, operation: "upsert" }
5. Response: 200 { data: <updatedDocument> }

6. (async) Worker receives SEARCH_INDEX message:
   a. SELECT document + permissions from DB
   b. Build SearchIndexDocument with denormalized ACL
   c. OpenSearch PUT /wiki-documents/_doc/<documentId>
```

---

## Environment configuration

All configuration is validated at process startup via Zod schemas in `packages/config`. Missing or invalid values cause an immediate exit with a clear field-level error list.

Key variables:

| Variable | Used by | Purpose |
|----------|---------|---------|
| `DATABASE_URL` | api, search, worker | Primary PG connection |
| `REDIS_URL` | api | ACL cache + pub/sub |
| `JWT_SECRET` | api, search | HS256 JWT signing and verification |
| `BASE_DOMAIN` | api | Subdomain cross-check (e.g. `wiki.example.com`) |
| `S3_QUARANTINE_BUCKET`, `S3_SERVED_BUCKET` | api, worker | Upload pipeline |
| `SQS_PDF_QUEUE_URL`, `SQS_INDEX_QUEUE_URL` | api, worker | Async queues |
| `OPENSEARCH_URL` | search, worker | Index read/write |
| `SES_FROM_ADDRESS` | worker | Transactional email (not yet wired) |
| `S3_ENDPOINT`, `SQS_ENDPOINT`, `SES_ENDPOINT` | api, worker | LocalStack overrides in dev |

---

## Local development

```bash
cp .env.example .env        # set JWT_SECRET (32+ chars) and other defaults
pnpm install                # install all workspace dependencies
docker compose up -d        # start Postgres, Redis, OpenSearch, LocalStack
pnpm db:generate            # generate migration SQL from schema
pnpm db:migrate             # apply migrations + RLS policies
pnpm dev                    # Turborepo: start api + search + worker + web concurrently
```

Optional dev tools (OpenSearch Dashboards, MailHog):
```bash
docker compose --profile tools up -d
```

---

## Shared packages dependency graph

```
apps/api     ──► packages/types, packages/config, packages/db
apps/search  ──► packages/types, packages/config, packages/db
apps/worker  ──► packages/types, packages/config, packages/db
apps/web     ──► packages/types
```

`packages/db` exports: Drizzle `db` client factory (`getDb`), all table references, `setTenantContext`, `RLS_POLICIES`.

---

## Phase 2 upgrade path (AI search)

The index is already prepared for vector search:
- `content_embedding: knn_vector(1536, hnsw, cosine)` — matches OpenAI `text-embedding-3-small` / `text-embedding-ada-002` output dimensions
- Worker's `PdfProcessor` and `Indexer` both set `content_embedding: null` — no schema change needed when embeddings are added
- Upgrade steps: (1) add an embedding model call in the indexer, (2) populate `content_embedding`, (3) add a hybrid BM25 + knn query path in `SearchService`
