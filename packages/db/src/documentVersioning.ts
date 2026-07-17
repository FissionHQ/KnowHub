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
};

export function isTitleChanged(current: string, next: string): boolean {
  return next.trim() !== current.trim();
}

export function isContentChanged(current: string | null, next: string): boolean {
  const previousDigest = current ? contentHash(current) : null;
  return contentHash(next) !== previousDigest;
}

export type BumpVersionInput = {
  doc: VersionedDocRow;
  nextTitle?: string | undefined;
  nextContent?: string | undefined;
  editedBy: string;
};

export type BumpVersionResult =
  | { bumped: false }
  | { bumped: true; newVersion: number; contentRef: string; title: string };

export type SaveDocumentContentInput = {
  doc: VersionedDocRow;
  nextTitle?: string | undefined;
  nextContent?: string | undefined;
};

export type SaveDocumentContentResult =
  | { saved: false }
  | { saved: true; contentRef: string; title: string };

/** Persists title/content without bumping documents.version or creating a snapshot. */
export async function saveDocumentContent(
  tx: DbOrTx,
  input: SaveDocumentContentInput,
): Promise<SaveDocumentContentResult> {
  const { doc } = input;

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
      updatedAt: new Date(),
    })
    .where(and(eq(documents.id, doc.id), eq(documents.orgId, doc.orgId)));

  return { saved: true, contentRef, title };
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

/** Creates a new published snapshot (draft edits do not call this). */
export async function publishDocumentVersion(
  tx: DbOrTx,
  input: PublishDocumentVersionInput,
): Promise<PublishDocumentVersionResult> {
  const { doc, editedBy } = input;
  const contentRef = input.contentRef ?? doc.contentRef ?? "";
  const title = (input.title ?? doc.title).trim();
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

/**
 * @deprecated Use saveDocumentContent for edits and publishDocumentVersion on publish.
 * Increments documents.version and inserts document_versions when title or content changed.
 */
export async function bumpVersionIfContentOrTitleChanged(
  tx: DbOrTx,
  input: BumpVersionInput,
): Promise<BumpVersionResult> {
  const { doc, editedBy } = input;

  const titleUpdates =
    input.nextTitle !== undefined && isTitleChanged(doc.title, input.nextTitle);
  const contentUpdates =
    input.nextContent !== undefined && isContentChanged(doc.contentRef, input.nextContent);

  if (!titleUpdates && !contentUpdates) {
    return { bumped: false };
  }

  const title = input.nextTitle !== undefined ? input.nextTitle.trim() : doc.title;
  const contentRef = input.nextContent !== undefined ? input.nextContent : (doc.contentRef ?? "");
  const newVersion = doc.version + 1;
  const now = new Date();

  await tx
    .update(documents)
    .set({
      ...(titleUpdates ? { title } : {}),
      ...(contentUpdates ? { contentRef } : {}),
      version: newVersion,
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

  return { bumped: true, newVersion, contentRef, title };
}

export type RestoreVersionInput = {
  doc: VersionedDocRow;
  contentSnapshot: string;
  titleSnapshot: string;
  editedBy: string;
};

export type RestoreVersionResult = {
  newVersion: number;
  contentRef: string;
  title: string;
};

/** Restore snapshot title + content as a new forward revision (history preserved). */
export async function appendRestoredDocumentVersion(
  tx: DbOrTx,
  input: RestoreVersionInput,
): Promise<RestoreVersionResult> {
  const { doc, contentSnapshot, titleSnapshot, editedBy } = input;
  const newVersion = doc.version + 1;
  const now = new Date();

  await tx
    .update(documents)
    .set({
      title: titleSnapshot,
      contentRef: contentSnapshot,
      version: newVersion,
      updatedAt: now,
    })
    .where(and(eq(documents.id, doc.id), eq(documents.orgId, doc.orgId)));

  await tx.insert(documentVersions).values({
    id: randomUUID(),
    documentId: doc.id,
    versionNumber: newVersion,
    contentSnapshot,
    titleSnapshot,
    editedBy,
  });

  return { newVersion, contentRef: contentSnapshot, title: titleSnapshot };
}
