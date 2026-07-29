import * as Y from "yjs";
import { TiptapTransformer } from "@hocuspocus/transformer";
import { generateJSON, generateHTML } from "@tiptap/html";
import { COLLAB_FIELD } from "./constants.js";
import { collabTiptapExtensions } from "./extensions.js";

export function htmlToYdoc(html: string): Y.Doc {
  const json = generateJSON(html, collabTiptapExtensions);
  return TiptapTransformer.toYdoc(json, COLLAB_FIELD, collabTiptapExtensions);
}

export function ydocToHtml(ydoc: Y.Doc): string {
  const json = TiptapTransformer.fromYdoc(ydoc, COLLAB_FIELD);
  return generateHTML(json, collabTiptapExtensions);
}

/** Encodes TipTap HTML as a base64 Yjs update for `document_collab_state`. */
export function encodeHtmlAsYjsStateBase64(html: string): string {
  const ydoc = htmlToYdoc(html);
  return Buffer.from(Y.encodeStateAsUpdate(ydoc)).toString("base64");
}

/**
 * Normalize HTML through one TipTap parse→serialize cycle so attribute order /
 * empty-paragraph quirks don't look like content edits.
 * Safe for browser bundles (no node:crypto).
 */
export function canonicalizeHtml(html: string): string {
  if (!html) return "";
  try {
    return ydocToHtml(htmlToYdoc(html));
  } catch {
    return html;
  }
}

/** True when TipTap-normalized bodies differ (ignores serialize noise). */
export function isHtmlContentChanged(current: string | null, next: string): boolean {
  return canonicalizeHtml(current ?? "") !== canonicalizeHtml(next);
}
