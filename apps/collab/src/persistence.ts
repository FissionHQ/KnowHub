import * as Y from "yjs";
import { eq, and } from "drizzle-orm";
import type { Redis } from "ioredis";
import type { Db } from "@wiki/db";
import {
  documents,
  documentCollabState,
  setTenantContext,
  recordRecentlyUpdated,
  saveDocumentContent,
  hasUnpublishedChanges,
  syncDocumentSearchIndex,
} from "@wiki/db";
import {
  htmlToYdoc,
  ydocToHtml,
  isHtmlContentChanged,
} from "@wiki/doc-collab";
import { clearLastEditor, getLastEditor } from "./lastEditor.js";
import { logger } from "./logger.js";

const persistTimers = new Map<string, ReturnType<typeof setTimeout>>();
const PERSIST_DEBOUNCE_MS = 3000;

function isHtmlEmpty(html: string): boolean {
  return html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim().length === 0;
}

function isYdocEmpty(ydoc: Y.Doc): boolean {
  try {
    return isHtmlEmpty(ydocToHtml(ydoc));
  } catch {
    return true;
  }
}

async function seedFromHtml(
  db: Db,
  orgId: string,
  documentId: string,
  ydoc: Y.Doc,
): Promise<boolean> {
  const docRows = await db
    .select({
      contentRef: documents.contentRef,
      draftContentRef: documents.draftContentRef,
    })
    .from(documents)
    .where(and(eq(documents.id, documentId), eq(documents.orgId, orgId)));

  const row = docRows[0];
  // Prefer unpublished WIP so editors resume the shared draft; readers do not join collab.
  const html = row?.draftContentRef ?? row?.contentRef;
  if (!html || isHtmlEmpty(html)) {
    return false;
  }

  const seed = htmlToYdoc(html);
  Y.applyUpdate(ydoc, Y.encodeStateAsUpdate(seed));
  return true;
}

export async function loadCollabDocument(
  db: Db,
  redis: Redis,
  orgId: string,
  documentId: string,
  ydoc: Y.Doc,
): Promise<void> {
  // No editor yet — reconnect/load must not create a draft from serialize noise.
  clearLastEditor(redis, orgId, documentId);

  await setTenantContext(db, orgId);

  const stateRows = await db
    .select()
    .from(documentCollabState)
    .where(
      and(
        eq(documentCollabState.documentId, documentId),
        eq(documentCollabState.orgId, orgId),
      ),
    );

  if (stateRows.length) {
    const update = Buffer.from(stateRows[0]!.state, "base64");
    Y.applyUpdate(ydoc, update);
    if (!isYdocEmpty(ydoc)) return;
  }

  const seeded = await seedFromHtml(db, orgId, documentId, ydoc);
  if (!seeded) {
    logger.warn("No content to seed for collaborative document", { documentId, orgId });
  }
}

export async function storeCollabYjsState(
  db: Db,
  orgId: string,
  documentId: string,
  ydoc: Y.Doc,
): Promise<void> {
  if (isYdocEmpty(ydoc)) return;

  await setTenantContext(db, orgId);
  const state = Buffer.from(Y.encodeStateAsUpdate(ydoc)).toString("base64");

  await db
    .insert(documentCollabState)
    .values({ documentId, orgId, state, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: documentCollabState.documentId,
      set: { state, updatedAt: new Date() },
    });
}

export function scheduleHtmlPersist(
  db: Db,
  redis: Redis,
  orgId: string,
  documentId: string,
  ydoc: Y.Doc,
): void {
  const key = `${orgId}:${documentId}`;
  const existing = persistTimers.get(key);
  if (existing) clearTimeout(existing);

  persistTimers.set(
    key,
    setTimeout(() => {
      persistTimers.delete(key);
      void persistHtmlAndIndex(db, redis, orgId, documentId, ydoc).catch((err) => {
        logger.error("Failed to persist collaborative document", {
          documentId,
          orgId,
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }, PERSIST_DEBOUNCE_MS),
  );
}

async function persistHtmlAndIndex(
  db: Db,
  redis: Redis,
  orgId: string,
  documentId: string,
  ydoc: Y.Doc,
): Promise<void> {
  const html = ydocToHtml(ydoc);
  if (isHtmlEmpty(html)) {
    return;
  }

  const editedBy = await getLastEditor(redis, orgId, documentId);

  const saved = await db.transaction(async (tx) => {
    await setTenantContext(tx, orgId);

    const docRows = await tx
      .select({
        version: documents.version,
        contentRef: documents.contentRef,
        title: documents.title,
        ownerId: documents.ownerId,
        status: documents.status,
        draftTitle: documents.draftTitle,
        draftContentRef: documents.draftContentRef,
      })
      .from(documents)
      .where(and(eq(documents.id, documentId), eq(documents.orgId, orgId)))
      .for("update");

    const doc = docRows[0];
    if (!doc) return null;

    // Published pages: only write draft_* after a real editor onChange (lastEditor set).
    // Reconnect/store without typing must not create false unpublished drafts.
    if (doc.status === "published" && !editedBy) {
      logger.debug("Skipped draft persist — no editor change since load", {
        documentId,
        orgId,
      });
      return null;
    }

    const hasDraft = hasUnpublishedChanges(doc);
    const baseContent = hasDraft
      ? (doc.draftContentRef ?? doc.contentRef)
      : doc.contentRef;

    // TipTap roundtrip can change byte-exact HTML without a user edit.
    if (!isHtmlContentChanged(baseContent, html)) {
      return null;
    }

    const result = await saveDocumentContent(tx, {
      doc: {
        id: documentId,
        orgId,
        version: doc.version,
        title: doc.title,
        contentRef: doc.contentRef,
        status: doc.status,
        draftTitle: doc.draftTitle,
        draftContentRef: doc.draftContentRef,
      },
      nextContent: html,
      ...(editedBy ? { editedBy } : {}),
    });

    return result.saved ? doc.status : null;
  });

  if (!saved) {
    return;
  }

  if (editedBy) {
    await recordRecentlyUpdated(db, editedBy, documentId);
  }

  // Published docs are indexed from the latest published snapshot only (on publish).
  if (saved === "published") {
    logger.debug("Skipped search reindex for draft autosave on published document", {
      documentId,
      orgId,
    });
    return;
  }

  await syncDocumentSearchIndex(db, documentId, orgId, "upsert");

  logger.debug("Persisted collaborative HTML (no version bump)", {
    documentId,
    orgId,
    editedBy: editedBy ?? "owner-fallback",
  });
}
