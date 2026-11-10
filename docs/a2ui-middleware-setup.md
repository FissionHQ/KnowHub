****# A2UI Middleware Chat: Setup Guide

How the A2UI chat widget was added to KnowHub, step by step, with every file touched.
Branch: `feat/a2ui-chat`. Commits: `022d43a` (add widget), `649db7e` (cleanup).

## 0. What this is

KnowHub (Next.js, `apps/web`) embeds a chat widget served by a **separate service, the a2ui-middleware**. The middleware is not in this repo. KnowHub only does three things:

1. Loads the widget script `chat.js` from the middleware.
2. Renders the `<a2ui-chat>` custom element for signed-in users.
3. Gives the widget the user's auth token, so the middleware can call the KnowHub API as that user.
****
The middleware learns what the API can do from `docs/knowhub-openapi.yaml`.

```
Browser (KnowHub web)                a2ui-middleware (:4900)         KnowHub API (:3001)
  <a2ui-chat> --- chat.js ------------> serves widget + chat backend
       |  getToken() -> /api/auth/collab-token
       +-- token + messages ----------> LLM + tool calls --------> /api/... (Bearer token)
```

## Files changed

| # | File | Change |
|---|------|--------|
| 1 | `apps/web/src/components/A2uiChat.tsx` | New: the widget wrapper component |
| 2 | `apps/web/src/app/providers.tsx` | Mount `<A2uiChat />` globally |
| 3 | `.env.example` | Document `NEXT_PUBLIC_A2UI_ENDPOINT` |
| 4 | `apps/web/Dockerfile` | Pass the env var in at build time |
| 5 | `docker-compose.yml` | Forward the env var to the web build |
| 6 | `docs/knowhub-openapi.yaml` | New: API spec the middleware reads |

---

## Step 1: Create the component

**File:** `apps/web/src/components/A2uiChat.tsx` (new)

1. `"use client"` at the top. It uses hooks and the DOM, so it can't be a server component.
2. Read config from env:
   - `NEXT_PUBLIC_A2UI_ENDPOINT` (`URL_BASE`): the middleware URL. Required.
   - `NEXT_PUBLIC_A2UI_APP` (`APP`): app id sent to the middleware. Defaults to `"know-hub"`.
   - `NEXT_PUBLIC_` is required because the value is used in the browser.
3. `PUBLIC_PREFIXES = ["/login", "/invite"]`: pages before sign-in, where the chat must not show.
4. Decide visibility (`show`). All four must hold:
   - `URL_BASE` is set (so the feature is opt-in and does nothing by default)
   - auth finished loading (`!loading`, from `useAuth()` in `@/lib/auth`)
   - a user is signed in (`!!user`)
   - the current `usePathname()` doesn't start with a public prefix
5. **Effect 1: load the script once.** If `URL_BASE` is set and no `script[data-a2ui]` exists, append `<script type="module" src="{URL_BASE}/chat.js" data-a2ui="1">` to `<head>`. The `data-a2ui` marker prevents duplicate loads on re-render or navigation. Loading the module registers the `a2ui-chat` custom element.
6. **Effect 2: hand over the token.** Set `ref.current.getToken = fetchCollaborationToken` (from `@/lib/collab`) whenever `show` changes. The `wiki_token` cookie is `httpOnly`, so JS can't read it. `fetchCollaborationToken()` calls `GET /api/auth/collab-token` with `credentials: "include"` and returns `data.token`. It's the same token the collaborative editor uses. The widget calls `getToken()` whenever it needs a fresh token.
7. If `!show`, return `null`. Otherwise render `<a2ui-chat ref={ref} app={APP} endpoint={URL_BASE} />`. The `// @ts-expect-error custom element` comment is needed because TypeScript doesn't know the tag.

## Step 2: Mount it globally

**File:** `apps/web/src/app/providers.tsx`

1. Import: `import { A2uiChat } from "@/components/A2uiChat";`
2. Render `<A2uiChat />` **inside `<AuthProvider>`**, after `{children}`. It must be inside `AuthProvider` because it calls `useAuth()`. Placing it in the shared providers means it appears on every page without touching individual layouts.

## Step 3: Document the env var

**File:** `.env.example`

Add a commented entry:

```
# A2UI chat (optional): URL of the a2ui-middleware, e.g. http://localhost:4900
# NEXT_PUBLIC_A2UI_ENDPOINT=
```

Locally, copy it to `.env`/`.env.local` and set `NEXT_PUBLIC_A2UI_ENDPOINT=http://localhost:4900`.

## Step 4: Dockerfile build arg

**File:** `apps/web/Dockerfile`

Next.js inlines `NEXT_PUBLIC_*` values **at build time**, so Docker must receive it during `next build`:

```dockerfile
ARG NEXT_PUBLIC_A2UI_ENDPOINT=
ENV NEXT_PUBLIC_A2UI_ENDPOINT=$NEXT_PUBLIC_A2UI_ENDPOINT
```

The empty default keeps the widget disabled unless a value is supplied.

## Step 5: docker-compose build arg

**File:** `docker-compose.yml`, in the web service's `build.args`:

```yaml
NEXT_PUBLIC_A2UI_ENDPOINT: ${NEXT_PUBLIC_A2UI_ENDPOINT:-}
```

It reads from the shell or `.env` and falls back to empty. The value must be a **browser-reachable** URL, not a Docker-internal hostname.

## Step 6: Give the middleware the API spec

**File:** `docs/knowhub-openapi.yaml` (new, OpenAPI 3.0.3)

- `servers: http://host.docker.internal:3001/api`: where the middleware (in Docker) reaches the KnowHub API on the host.
- `security: bearer`: every call carries the user's token, so results are limited to what that user may see.
- ~40 paths cover the signed-in API. Responses are wrapped as `{data: ...}`.
- Login, logout and accept-invite are left out because they use cookies.
- Point the middleware at this file in its own config. That config lives in the middleware repo, not here.

## Step 7: Cleanup commit

`649db7e` removed an unrelated compose API URL change and stray comments. It left the `docker-compose.yml` change as the single line shown in Step 5.

---

## Running it

1. Start the a2ui-middleware on port 4900 with `docs/knowhub-openapi.yaml` configured.
2. Set `NEXT_PUBLIC_A2UI_ENDPOINT=http://localhost:4900` in the web app env.
3. Run `pnpm dev` (or rebuild the Docker image, since it's baked in at build time).
4. Sign in. The chat widget appears. It is hidden on `/login` and `/invite`.

## Verify

- No env var set → nothing renders, no script requested.
- Signed out or on `/login` → no widget.
- Signed in → `chat.js` loads once (Network tab) and `<a2ui-chat>` is in the DOM.
- Chat triggers API calls with an `Authorization: Bearer` header.

## Troubleshooting

| Symptom | Cause |
|---|---|
| Widget never shows | Env var unset, or changed without a rebuild |
| `chat.js` 404 / blocked | Wrong URL, or the middleware's CORS doesn't allow the web origin |
| Widget shows but calls fail with 401 | `/api/auth/collab-token` returned nothing (not signed in, or `NEXT_PUBLIC_DEV_JWT` misconfigured) |
| Works locally, not in Docker | Build arg not passed (Steps 4 and 5) |
