# Document versioning

How document revisions are stored, when new versions are created, and how restore works.

**Invariant:** `documents.version === MAX(document_versions.version_number)` for every page document.

---

## Data model

| Concept | Storage | Purpose |
|---------|---------|---------|
| **Current revision** | `documents.version` | Live revision counter (starts at `1`) |
| **Snapshots** | `document_versions` | Immutable title + HTML keyed by `version_number` |

### `document_versions`

| Column | Description |
|--------|-------------|
| `version_number` | Matches `documents.version` at snapshot time |
| `content_snapshot` | Full HTML at that revision |
| `title_snapshot` | Document title at that revision |
| `edited_by` | User who published that revision |

---

## When a new version is created

```
Create document           → version=1, no snapshot until first publish
Autosave / collab save    → updates content_ref only, no version change
PATCH title/content       → updates live fields only, no version change
Publish (draft or republish) → version++ + snapshot (title + content)
Unpublish                 → status only, no version change
Version history restore   → version++ + snapshot (restored title + content)
Trash / trash restore     → no version change
```

**Not versioned:** tags, draft/publish toggles (except the publish snapshot itself), `restrictDownload`, permissions, raw attachment upload.

Shared logic: `packages/db/src/documentVersioning.ts` — `saveDocumentContent`, `publishDocumentVersion`, `appendRestoredDocumentVersion`.

Publish (`PATCH` with `publish: true`) — draft or already published

1. Client sends `publish: true`, current title + HTML, and `status: "published"`
2. `newVersion = MAX(document_versions.version_number) + 1` (first publish → v1, each later publish → v2, v3, …)
3. Set `documents.content_ref`, `documents.title`, `documents.version`, `status = published`
4. Insert `document_versions` row at `newVersion` (prior versions remain in history)

**Unpublish** (`status: "draft"` without `publish`) only changes visibility; it does not create a version.

### Version history restore (`POST /documents/:id/versions/:n/restore`)

1. Load `content_snapshot` and `title_snapshot` for `versionNumber`
2. `newVersion = doc.version + 1` (always forward)
3. Set `documents.content_ref` and `documents.title` from snapshot
4. Insert new snapshot at `newVersion` (history preserved)
5. Reset collab state for page docs; return updated document

Cannot restore when `versionNumber === documents.version`.

**Pre-migration rows:** `0010_document_version_title_snapshot` backfills `title_snapshot` from the document's current title (best-effort for existing history).

---

## Code references

| Area | File |
|------|------|
| Version helpers | `packages/db/src/documentVersioning.ts` |
| API create/patch/restore | `apps/api/src/domains/content/router.ts` |
| Collab persist | `apps/collab/src/persistence.ts` |
| Publish payload (client) | `apps/web/src/app/spaces/[spaceId]/docs/[docId]/DocumentView.tsx` |
| Version history UI | `apps/web/src/components/DocumentVersionHistory.tsx` |
