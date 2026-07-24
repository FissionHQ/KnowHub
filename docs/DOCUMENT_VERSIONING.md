# Document versioning

How document revisions are stored, when new versions are created, and how restore works.

**Invariant (published pages):** `documents.version === MAX(document_versions.version_number)` and `documents.title` / `content_ref` match that latest snapshot.

---

## Data model

| Concept | Storage | Purpose |
|---------|---------|---------|
| **Current published** | `documents.title`, `documents.content_ref`, `documents.version` | What readers see; denormalized latest publish |
| **Unpublished WIP** | `documents.draft_title`, `draft_content_ref`, … | Shared editor draft until Publish |
| **History** | `document_versions` | Immutable snapshots per publish |

### Never published (`status = draft`)

Working body lives in `title` / `content_ref`. No `draft_*` until after the first publish + later edit. First **Publish** creates **v1**.

### Published (`status = published`)

- Readers: always `title` / `content_ref`.
- Editors: first real content/title change creates `draft_*` (seeded from published); further saves update draft only.
- `hasUnpublishedChanges` ⇔ `draft_content_ref` or `draft_title` is non-null.

---

## When a new version is created

```
Create document              → status=draft, version=1, no snapshot
Autosave / collab (draft)    → live title/content_ref, no version
Autosave / collab (published)→ draft_* only, no version
Publish                      → version++ + snapshot; copy draft→live; clear draft_*
Restore (published)          → load snapshot into draft_* only (no version)
Restore (never published)    → overwrite live title/content_ref (no version)
Discard unpublished changes  → clear draft_*
Unpublish                    → status=draft; promote draft into live if present; clear draft_*
```

**Not versioned:** tags, permissions, attachments (except via publish of HTML).

Shared logic: `packages/db/src/documentVersioning.ts`.

---

## Code references

| Area | File |
|------|------|
| Version helpers | `packages/db/src/documentVersioning.ts` |
| API create/patch/restore | `apps/api/src/domains/content/router.ts` |
| Collab persist | `apps/collab/src/persistence.ts` |
| Publish UI | `apps/web/src/app/spaces/[spaceId]/docs/[docId]/DocumentView.tsx` |
