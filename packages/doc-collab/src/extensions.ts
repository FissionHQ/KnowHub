import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Table from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import { Node, mergeAttributes } from "@tiptap/core";

/**
 * Schema-only file embed node for server-side HTML/Yjs round-trips.
 * No React node view — just attribute serialization so file embeds
 * survive collab persistence.
 */
const FileEmbedSchema = Node.create({
  name: "fileEmbed",
  group: "block",
  atom: true,
  addAttributes() {
    return {
      attachmentId: {
        default: null,
        parseHTML: (el: Element) => el.getAttribute("data-attachment-id"),
        renderHTML: (attrs: Record<string, unknown>) => ({ "data-attachment-id": attrs["attachmentId"] }),
      },
      fileName: {
        default: "",
        parseHTML: (el: Element) => el.getAttribute("data-file-name") ?? "",
        renderHTML: (attrs: Record<string, unknown>) => ({ "data-file-name": attrs["fileName"] }),
      },
      fileType: {
        default: "",
        parseHTML: (el: Element) => el.getAttribute("data-file-type") ?? "",
        renderHTML: (attrs: Record<string, unknown>) => ({ "data-file-type": attrs["fileType"] }),
      },
      fileSize: {
        default: 0,
        parseHTML: (el: Element) => Number(el.getAttribute("data-file-size") ?? 0),
        renderHTML: (attrs: Record<string, unknown>) => ({ "data-file-size": String(attrs["fileSize"]) }),
      },
    };
  },
  parseHTML() {
    return [{ tag: 'div[data-type="file-embed"]' }];
  },
  renderHTML({ HTMLAttributes }: { HTMLAttributes: Record<string, string> }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "file-embed" })];
  },
});

/** Must match the web editor extensions for consistent HTML round-trips. */
export const collabTiptapExtensions = [
  StarterKit.configure({ codeBlock: false, history: false }),
  Image,
  Link.configure({ openOnClick: false }),
  Table.configure({ resizable: true }),
  TableRow,
  TableCell,
  TableHeader,
  FileEmbedSchema,
];
