import * as Y from "yjs";
import { TiptapTransformer } from "@hocuspocus/transformer";
import { generateJSON } from "@tiptap/html";
import { COLLAB_FIELD } from "./constants.js";
import { collabTiptapExtensions } from "./extensions.js";

export function htmlToYdoc(html: string): Y.Doc {
  const json = generateJSON(html, collabTiptapExtensions);
  return TiptapTransformer.toYdoc(json, COLLAB_FIELD, collabTiptapExtensions);
}

/** Encodes TipTap HTML as a base64 Yjs update for `document_collab_state`. */
export function encodeHtmlAsYjsStateBase64(html: string): string {
  const ydoc = htmlToYdoc(html);
  return Buffer.from(Y.encodeStateAsUpdate(ydoc)).toString("base64");
}
