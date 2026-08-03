import { unzipSync, strFromU8 } from "fflate";
import * as CFB from "cfb";

type CfbContainer = {
  FileIndex: Array<{ name?: string; content?: Buffer | Uint8Array | number[] }>;
  FullPaths: string[];
};

const RT_SLIDE = 0x03ee;
const RT_MAIN_MASTER = 0x03f8;
const RT_NOTES = 0x03f0;
const RT_HANDOUT = 0x03fc;
const RT_SLIDE_LIST_WITH_TEXT = 0x0ff0;
const RT_TEXT_CHARS_ATOM = 0x0fa0;
const RT_TEXT_BYTES_ATOM = 0x0fa8;
const SLWT_SLIDES = 0;

function toUint8Array(content: Buffer | Uint8Array | number[]): Uint8Array {
  if (content instanceof Uint8Array) return content;
  return Uint8Array.from(content);
}

function normalizeText(raw: string): string {
  return raw
    .replace(/\u0000/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[\u0001-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .trim();
}

function isPlaceholderText(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  if (/click to edit/i.test(t)) return true;
  if (/^(second|third|fourth|fifth)\s+level$/i.test(t)) return true;
  if (t === "*" || t === "•") return true;
  return false;
}

function acceptText(raw: string): string | null {
  const text = normalizeText(raw);
  if (!text || isPlaceholderText(text)) return null;
  return text;
}

function decodeTextChars(bytes: Uint8Array, start: number, end: number): string {
  const chars: string[] = [];
  for (let i = start; i + 1 < end; i += 2) {
    const code = bytes[i]! | (bytes[i + 1]! << 8);
    if (code === 0) break;
    chars.push(String.fromCharCode(code));
  }
  return chars.join("");
}

function decodeTextBytes(bytes: Uint8Array, start: number, end: number): string {
  const chars: string[] = [];
  for (let i = start; i < end; i++) {
    const code = bytes[i]!;
    if (code === 0) break;
    chars.push(String.fromCharCode(code));
  }
  return chars.join("");
}

function collectTextAtoms(
  view: DataView,
  content: Uint8Array,
  start: number,
  end: number,
  texts: string[],
) {
  let offset = start;
  while (offset + 8 <= end) {
    const verInstance = view.getUint16(offset, true);
    const type = view.getUint16(offset + 2, true);
    const len = view.getUint32(offset + 4, true);
    const dataStart = offset + 8;
    const dataEnd = dataStart + len;
    if (len < 0 || dataEnd > end || dataEnd < dataStart) break;

    const recVer = verInstance & 0x0f;
    if (type === RT_TEXT_CHARS_ATOM) {
      const text = acceptText(decodeTextChars(content, dataStart, dataEnd));
      if (text) texts.push(text);
    } else if (type === RT_TEXT_BYTES_ATOM) {
      const text = acceptText(decodeTextBytes(content, dataStart, dataEnd));
      if (text) texts.push(text);
    } else if (recVer === 0x0f) {
      collectTextAtoms(view, content, dataStart, dataEnd, texts);
    }
    offset = dataEnd;
  }
}

/** Prefer SlideListWithText instance 0 (slides); skip masters/notes placeholders. */
function extractTextFromPptStream(content: Uint8Array): string {
  const view = new DataView(content.buffer, content.byteOffset, content.byteLength);
  const texts: string[] = [];

  function findSlideLists(start: number, end: number): boolean {
    let offset = start;
    let found = false;
    while (offset + 8 <= end) {
      const verInstance = view.getUint16(offset, true);
      const type = view.getUint16(offset + 2, true);
      const len = view.getUint32(offset + 4, true);
      const dataStart = offset + 8;
      const dataEnd = dataStart + len;
      if (len < 0 || dataEnd > end || dataEnd < dataStart) break;

      const recVer = verInstance & 0x0f;
      const recInstance = verInstance >> 4;

      if (type === RT_SLIDE_LIST_WITH_TEXT && recInstance === SLWT_SLIDES) {
        collectTextAtoms(view, content, dataStart, dataEnd, texts);
        found = true;
      } else if (
        recVer === 0x0f &&
        type !== RT_MAIN_MASTER &&
        type !== RT_NOTES &&
        type !== RT_HANDOUT &&
        type !== RT_SLIDE_LIST_WITH_TEXT
      ) {
        if (findSlideLists(dataStart, dataEnd)) found = true;
      }
      offset = dataEnd;
    }
    return found;
  }

  function findSlideContainers(start: number, end: number) {
    let offset = start;
    while (offset + 8 <= end) {
      const verInstance = view.getUint16(offset, true);
      const type = view.getUint16(offset + 2, true);
      const len = view.getUint32(offset + 4, true);
      const dataStart = offset + 8;
      const dataEnd = dataStart + len;
      if (len < 0 || dataEnd > end || dataEnd < dataStart) break;

      const recVer = verInstance & 0x0f;
      if (type === RT_SLIDE) {
        collectTextAtoms(view, content, dataStart, dataEnd, texts);
      } else if (
        recVer === 0x0f &&
        type !== RT_MAIN_MASTER &&
        type !== RT_NOTES &&
        type !== RT_HANDOUT &&
        type !== RT_SLIDE_LIST_WITH_TEXT
      ) {
        findSlideContainers(dataStart, dataEnd);
      }
      offset = dataEnd;
    }
  }

  if (!findSlideLists(0, content.length)) {
    findSlideContainers(0, content.length);
  }

  return texts.join("\n");
}

function findPowerPointStream(cfb: CfbContainer): Uint8Array | null {
  for (const name of ["PowerPoint Document", "/PowerPoint Document", "Powerpoint Document"]) {
    const entry = CFB.find(cfb as never, name);
    if (entry?.content) return toUint8Array(entry.content as Buffer | Uint8Array | number[]);
  }
  for (let i = 0; i < cfb.FullPaths.length; i++) {
    const path = cfb.FullPaths[i] ?? "";
    if (/powerpoint document/i.test(path)) {
      const entry = cfb.FileIndex[i];
      if (entry?.content) return toUint8Array(entry.content);
    }
  }
  return null;
}

export function extractPptxText(buffer: Buffer): string {
  try {
    const files = unzipSync(new Uint8Array(buffer));
    const texts: string[] = [];
    for (const [name, data] of Object.entries(files)) {
      if (!/^ppt\/slides\/slide\d+\.xml$/i.test(name)) continue;
      const xml = strFromU8(data);
      for (const match of xml.matchAll(/<a:t(?:\s[^>]*)?>([^<]*)<\/a:t>/g)) {
        const value = match[1]?.trim();
        if (value) texts.push(value);
      }
    }
    return texts.join("\n");
  } catch {
    return "";
  }
}

/** Legacy PowerPoint 97–2003 (.ppt) text extraction. */
export function extractPptText(buffer: Buffer): string {
  try {
    if (buffer.length < 8 || buffer[0] !== 0xd0 || buffer[1] !== 0xcf) return "";
    const cfb = CFB.read(buffer, { type: "buffer" }) as CfbContainer;
    const stream = findPowerPointStream(cfb);
    if (!stream?.length) return "";
    return extractTextFromPptStream(stream);
  } catch {
    return "";
  }
}
