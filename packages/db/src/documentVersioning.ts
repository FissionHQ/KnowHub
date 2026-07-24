import { createHash, randomUUID } from "node:crypto";
import { eq, and, desc } from "drizzle-orm";
import type { DbOrTx } from "./client.js";
import { documents, documentVersions } from "./schema.js";

export function contentHash(html: string): string {
  return createHash("sha256").update(html).digest("hex");
}

export type VersionedDocRow = {
  id: string;
  orgId: string;
  version: number;
  title: string;
  contentRef: string | null;
  status: string;
  draftTitle?: string | null;
  draftContentRef?: string | null;
};

export function isTitleChanged(current: string, next: string): boolean {
  return next.trim() !== current.trim();
}

export function isContentChanged(current: string | null, next: string): boolean {
  const previousDigest = current ? contentHash(current) : null;
  return contentHash(next) !== previousDigest;
}

export function hasUnpublishedChanges(doc: {
  draftTitle?: string | null;
  draftContentRef?: string | null;
}): boolean {
  return doc.draftContentRef != null || doc.draftTitle != null;
}

export type SaveDocumentContentInput = {
  doc: VersionedDocRow;
  nextTitle?: string | undefined;
  nextContent?: string | undefined;
  editedBy?: string | undefined;
};

export type SaveDocumentContentResult =
  | { saved: false }
  | {
      saved: true;
      contentRef: string;
      title: string;
      /** True when the write landed in draft_* (published page WIP). */
      wroteDraft: boolean;
    };

/**
 * Persists title/content without bumping documents.version.
 * - Never-published (status=draft): updates live title/content_ref.
 * - Published: writes draft_* only; first change seeds draft from published.
 *
 * Callers that round-trip through TipTap/Yjs should pre-check with
 * `@wiki/doc-collab` `isHtmlContentChanged` so serialize noise does not create drafts.
 */
export async function saveDocumentContent(
  tx: DbOrTx,
  input: SaveDocumentContentInput,
): Promise<SaveDocumentContentResult> {
  const { doc } = input;
  const now = new Date();

  if (doc.status === "published") {
    const currentDraftTitle = doc.draftTitle ?? null;
    const currentDraftContent = doc.draftContentRef ?? null;
    const hasDraft = currentDraftTitle != null || currentDraftContent != null;

    const baseTitle = hasDraft ? (currentDraftTitle ?? doc.title) : doc.title;
    const baseContent = hasDraft
      ? (currentDraftContent ?? doc.contentRef ?? "")
      : (doc.contentRef ?? "");

    const titleUpdates =
      input.nextTitle !== undefined && isTitleChanged(baseTitle, input.nextTitle);
    const contentUpdates =
      input.nextContent !== undefined && isContentChanged(baseContent, input.nextContent);

    if (!titleUpdates && !contentUpdates) {
      return { saved: false };
    }

    const draftTitle = input.nextTitle !== undefined ? input.nextTitle.trim() : baseTitle;
    const draftContentRef =
      input.nextContent !== undefined ? input.nextContent : baseContent;

    await tx
      .update(documents)
      .set({
        draftTitle,
        draftContentRef,
        draftUpdatedAt: now,
        ...(input.editedBy ? { draftUpdatedBy: input.editedBy } : {}),
        updatedAt: now,
      })
      .where(and(eq(documents.id, doc.id), eq(documents.orgId, doc.orgId)));

    return { saved: true, contentRef: draftContentRef, title: draftTitle, wroteDraft: true };
  }

  const titleUpdates =
    input.nextTitle !== undefined && isTitleChanged(doc.title, input.nextTitle);
  const contentUpdates =
    input.nextContent !== undefined && isContentChanged(doc.contentRef, input.nextContent);

  if (!titleUpdates && !contentUpdates) {
    return { saved: false };
  }

  const title = input.nextTitle !== undefined ? input.nextTitle.trim() : doc.title;
  const contentRef =
    input.nextContent !== undefined ? input.nextContent : (doc.contentRef ?? "");

  await tx
    .update(documents)
    .set({
      ...(titleUpdates ? { title } : {}),
      ...(contentUpdates ? { contentRef } : {}),
      updatedAt: now,
    })
    .where(and(eq(documents.id, doc.id), eq(documents.orgId, doc.orgId)));

  return { saved: true, contentRef, title, wroteDraft: false };
}

export type PublishDocumentVersionInput = {
  doc: VersionedDocRow;
  editedBy: string;
  contentRef?: string | undefined;
  title?: string | undefined;
};

export type PublishDocumentVersionResult = {
  newVersion: number;
  contentRef: string;
  title: string;
};

/** Promotes draft (or provided body) to published current + history snapshot; clears draft_*. */
export async function publishDocumentVersion(
  tx: DbOrTx,
  input: PublishDocumentVersionInput,
): Promise<PublishDocumentVersionResult> {
  const { doc, editedBy } = input;
  const hasDraft = hasUnpublishedChanges(doc);

  const contentRef =
    input.contentRef ??
    (hasDraft ? (doc.draftContentRef ?? doc.contentRef ?? "") : (doc.contentRef ?? ""));
  const title = (
    input.title ?? (hasDraft ? (doc.draftTitle ?? doc.title) : doc.title)
  ).trim();
  const now = new Date();

  const existing = await tx
    .select({ versionNumber: documentVersions.versionNumber })
    .from(documentVersions)
    .where(eq(documentVersions.documentId, doc.id))
    .orderBy(desc(documentVersions.versionNumber))
    .limit(1);

  const newVersion = (existing[0]?.versionNumber ?? 0) + 1;

  await tx
    .update(documents)
    .set({
      contentRef,
      title,
      version: newVersion,
      status: "published",
      draftTitle: null,
      draftContentRef: null,
      draftUpdatedAt: null,
      draftUpdatedBy: null,
      updatedAt: now,
    })
    .where(and(eq(documents.id, doc.id), eq(documents.orgId, doc.orgId)));

  await tx.insert(documentVersions).values({
    id: randomUUID(),
    documentId: doc.id,
    versionNumber: newVersion,
    contentSnapshot: contentRef,
    titleSnapshot: title,
    editedBy,
  });

  return { newVersion, contentRef, title };
}

export type RestoreVersionInput = {
  doc: VersionedDocRow;
  contentSnapshot: string;
  titleSnapshot: string;
  editedBy: string;
};

export type RestoreVersionResult = {
  /** Always false for published restore-into-draft; true only for never-published live restore. */
  publishedImmediately: boolean;
  contentRef: string;
  title: string;
  newVersion?: number;
};

/**
 * Restore a historical snapshot.
 * - Published: load into draft_* only (readers unchanged until Publish).
 * - Never-published: write into live title/content_ref (no version bump).
 */
export async function appendRestoredDocumentVersion(
  tx: DbOrTx,
  input: RestoreVersionInput,
): Promise<RestoreVersionResult> {
  const { doc, contentSnapshot, titleSnapshot, editedBy } = input;
  const now = new Date();

  if (doc.status === "published") {
    await tx
      .update(documents)
      .set({
        draftTitle: titleSnapshot,
        draftContentRef: contentSnapshot,
        draftUpdatedAt: now,
        draftUpdatedBy: editedBy,
        updatedAt: now,
      })
      .where(and(eq(documents.id, doc.id), eq(documents.orgId, doc.orgId)));

    return {
      publishedImmediately: false,
      contentRef: contentSnapshot,
      title: titleSnapshot,
    };
  }

  await tx
    .update(documents)
    .set({
      title: titleSnapshot,
      contentRef: contentSnapshot,
      updatedAt: now,
    })
    .where(and(eq(documents.id, doc.id), eq(documents.orgId, doc.orgId)));

  return {
    publishedImmediately: false,
    contentRef: contentSnapshot,
    title: titleSnapshot,
  };
}

/** Clears unpublished draft_* and leaves published title/content_ref intact. */
export async function discardDocumentDraft(
  tx: DbOrTx,
  doc: Pick<VersionedDocRow, "id" | "orgId">,
): Promise<void> {
  await tx
    .update(documents)
    .set({
      draftTitle: null,
      draftContentRef: null,
      draftUpdatedAt: null,
      draftUpdatedBy: null,
      updatedAt: new Date(),
    })
    .where(and(eq(documents.id, doc.id), eq(documents.orgId, doc.orgId)));
}

/**
 * @deprecated Use saveDocumentContent for edits and publishDocumentVersion on publish.
 */
export async function bumpVersionIfContentOrTitleChanged(
  tx: DbOrTx,
  input: {
    doc: VersionedDocRow;
    nextTitle?: string | undefined;
    nextContent?: string | undefined;
    editedBy: string;
  },
): Promise<
  | { bumped: false }
  | { bumped: true; newVersion: number; contentRef: string; title: string }
> {
  const published = await publishDocumentVersion(tx, {
    doc: input.doc,
    editedBy: input.editedBy,
    ...(input.nextTitle !== undefined ? { title: input.nextTitle } : {}),
    ...(input.nextContent !== undefined ? { contentRef: input.nextContent } : {}),
  });
  return {
    bumped: true,
    newVersion: published.newVersion,
    contentRef: published.contentRef,
    title: published.title,
  };
}
