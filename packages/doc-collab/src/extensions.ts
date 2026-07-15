import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Table from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";

/** Must match the web editor extensions for consistent HTML round-trips. */
export const collabTiptapExtensions = [
  StarterKit.configure({ codeBlock: false, history: false }),
  Image,
  Link.configure({ openOnClick: false }),
  Table.configure({ resizable: true }),
  TableRow,
  TableCell,
  TableHeader,
];
