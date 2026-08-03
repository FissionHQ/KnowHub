/**
 * Legacy PowerPoint 97–2003 (.ppt) text extraction.
 *
 * Avoids SheetJS `ppt` (throws Error("n") on unsupported records). Instead:
 * open the OLE container with `cfb`, then read slide text from MS-PPT
 * SlideListWithText (instance 0 = slides only — not masters/notes).
 */

type CfbContainer = {
  FileIndex: Array<{ name?: string; content?: Uint8Array | number[] }>;
  FullPaths: string[];
};

type CfbModule = {
  read: (data: Uint8Array | ArrayBuffer, opts: { type: string }) => CfbContainer;
  find: (
    cfb: CfbContainer,
    path: string,
  ) => { content?: Uint8Array | number[]; name?: string } | null;
};

/** [MS-PPT] record types */
const RT_SLIDE = 0x03ee;
const RT_MAIN_MASTER = 0x03f8;
const RT_NOTES = 0x03f0;
const RT_HANDOUT = 0x03fc;
const RT_SLIDE_PERSIST_ATOM = 0x03f3;
const RT_SLIDE_LIST_WITH_TEXT = 0x0ff0;
const RT_TEXT_CHARS_ATOM = 0x0fa0;
const RT_TEXT_BYTES_ATOM = 0x0fa8;

/** SlideListWithText rh.recInstance */
const SLWT_SLIDES = 0;
const SLWT_MASTERS = 1;
const SLWT_NOTES = 2;

async function loadCfb(): Promise<CfbModule> {
  const mod = (await import("cfb")) as unknown as CfbModule | { default: CfbModule };
  return "read" in mod ? mod : mod.default;
}

function toUint8Array(content: Uint8Array | number[]): Uint8Array {
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

/** Default PowerPoint master/layout prompts — not real slide content. */
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

type RecordHeader = {
  offset: number;
  recVer: number;
  recInstance: number;
  type: number;
  len: number;
  dataStart: number;
  dataEnd: number;
};

function readHeader(
  view: DataView,
  offset: number,
  end: number,
): RecordHeader | null {
  if (offset + 8 > end) return null;
  const verInstance = view.getUint16(offset, true);
  const type = view.getUint16(offset + 2, true);
  const len = view.getUint32(offset + 4, true);
  const dataStart = offset + 8;
  const dataEnd = dataStart + len;
  if (len < 0 || dataEnd > end || dataEnd < dataStart) return null;
  return {
    offset,
    recVer: verInstance & 0x0f,
    recInstance: verInstance >> 4,
    type,
    len,
    dataStart,
    dataEnd,
  };
}

function collectTextInRange(
  view: DataView,
  content: Uint8Array,
  start: number,
  end: number,
  into: string[],
) {
  let offset = start;
  while (offset + 8 <= end) {
    const h = readHeader(view, offset, end);
    if (!h) break;

    if (h.type === RT_TEXT_CHARS_ATOM) {
      const text = acceptText(decodeTextChars(content, h.dataStart, h.dataEnd));
      if (text) into.push(text);
    } else if (h.type === RT_TEXT_BYTES_ATOM) {
      const text = acceptText(decodeTextBytes(content, h.dataStart, h.dataEnd));
      if (text) into.push(text);
    } else if (h.recVer === 0x0f) {
      collectTextInRange(view, content, h.dataStart, h.dataEnd, into);
    }

    offset = h.dataEnd;
  }
}

/**
 * Preferred path: SlideListWithText with instance 0 (slides).
 * Masters = 1, notes = 2 — skipped so we don't show "Click to edit Master…".
 */
function extractFromSlideListWithText(
  view: DataView,
  content: Uint8Array,
): string[][] {
  const slides: string[][] = [];

  function walk(start: number, end: number) {
    let offset = start;
    while (offset + 8 <= end) {
      const h = readHeader(view, offset, end);
      if (!h) break;

      if (h.type === RT_SLIDE_LIST_WITH_TEXT && h.recInstance === SLWT_SLIDES) {
        let current: string[] = [];
        let sawPersist = false;
        let inner = h.dataStart;

        while (inner + 8 <= h.dataEnd) {
          const child = readHeader(view, inner, h.dataEnd);
          if (!child) break;

          if (child.type === RT_SLIDE_PERSIST_ATOM) {
            if (sawPersist) slides.push(current);
            current = [];
            sawPersist = true;
          } else if (child.type === RT_TEXT_CHARS_ATOM) {
            const text = acceptText(
              decodeTextChars(content, child.dataStart, child.dataEnd),
            );
            if (text) current.push(text);
          } else if (child.type === RT_TEXT_BYTES_ATOM) {
            const text = acceptText(
              decodeTextBytes(content, child.dataStart, child.dataEnd),
            );
            if (text) current.push(text);
          } else if (child.recVer === 0x0f) {
            collectTextInRange(view, content, child.dataStart, child.dataEnd, current);
          }

          inner = child.dataEnd;
        }

        if (sawPersist) slides.push(current);
      } else if (
        h.recVer === 0x0f &&
        h.type !== RT_MAIN_MASTER &&
        h.type !== RT_NOTES &&
        h.type !== RT_HANDOUT &&
        // Don't descend into master/notes text lists
        !(
          h.type === RT_SLIDE_LIST_WITH_TEXT &&
          (h.recInstance === SLWT_MASTERS || h.recInstance === SLWT_NOTES)
        )
      ) {
        walk(h.dataStart, h.dataEnd);
      }

      offset = h.dataEnd;
    }
  }

  walk(0, content.length);
  return slides.filter((s) => s.length > 0);
}

/** Fallback: text only inside RT_Slide containers (skip masters/notes). */
function extractFromSlideContainers(
  view: DataView,
  content: Uint8Array,
): string[][] {
  const slides: string[][] = [];

  function walk(start: number, end: number) {
    let offset = start;
    while (offset + 8 <= end) {
      const h = readHeader(view, offset, end);
      if (!h) break;

      if (h.type === RT_SLIDE) {
        const texts: string[] = [];
        collectTextInRange(view, content, h.dataStart, h.dataEnd, texts);
        if (texts.length) slides.push(texts);
      } else if (
        h.recVer === 0x0f &&
        h.type !== RT_MAIN_MASTER &&
        h.type !== RT_NOTES &&
        h.type !== RT_HANDOUT &&
        h.type !== RT_SLIDE_LIST_WITH_TEXT
      ) {
        walk(h.dataStart, h.dataEnd);
      }

      offset = h.dataEnd;
    }
  }

  walk(0, content.length);
  return slides;
}

function extractSlidesFromPptStream(content: Uint8Array): string[][] {
  const view = new DataView(content.buffer, content.byteOffset, content.byteLength);
  const fromList = extractFromSlideListWithText(view, content);
  if (fromList.length) return fromList;
  return extractFromSlideContainers(view, content);
}

function findPowerPointStream(CFB: CfbModule, cfb: CfbContainer): Uint8Array | null {
  const candidates = [
    "PowerPoint Document",
    "/PowerPoint Document",
    "Powerpoint Document",
  ];
  for (const name of candidates) {
    const entry = CFB.find(cfb, name);
    if (entry?.content) return toUint8Array(entry.content);
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

export async function extractPptSlides(file: File | ArrayBuffer): Promise<string[][]> {
  const CFB = await loadCfb();
  const buffer =
    file instanceof ArrayBuffer ? new Uint8Array(file) : new Uint8Array(await file.arrayBuffer());

  if (buffer.length < 8 || buffer[0] !== 0xd0 || buffer[1] !== 0xcf) {
    throw new Error("File does not look like a legacy .ppt (OLE) presentation");
  }

  const cfb = CFB.read(buffer, { type: "array" });
  const stream = findPowerPointStream(CFB, cfb);
  if (!stream?.length) {
    throw new Error("Could not find PowerPoint Document stream in this .ppt file");
  }

  const slides = extractSlidesFromPptStream(stream);
  if (!slides.length) {
    throw new Error("No extractable text found in this .ppt file");
  }
  return slides;
}

/** Convert a legacy .ppt file to editable HTML (one section per slide). */
export async function extractPptAsHtml(file: File): Promise<string> {
  const slides = await extractPptSlides(file);

  return slides
    .map((texts, index) => {
      const body =
        texts.length > 0
          ? texts.map((t) => `<p>${escapeHtml(t)}</p>`).join("")
          : `<p><em>(Slide ${index + 1} — no extractable text)</em></p>`;
      return `<section data-slide="${index + 1}"><h2>Slide ${index + 1}</h2>${body}</section>`;
    })
    .join("");
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
