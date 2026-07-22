"use client";

// @ts-expect-error - @tiptap/core types may not resolve in strict mode
import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer, NodeViewWrapper } from "@tiptap/react";
import { useState, useEffect, useCallback } from "react";
import { attachmentsApi } from "@/lib/api";
import { Download, Loader2, AlertCircle, Trash2, Eye, EyeOff } from "lucide-react";
import InlinePdfViewer from "./InlinePdfViewer";

export interface FileEmbedAttributes {
  attachmentId: string;
  fileName: string;
  fileType: string;
  fileSize: number;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(fileType: string, fileName: string): string {
  if (fileType === "application/pdf") return "📄";
  if (fileType.startsWith("image/")) return "🖼️";
  if (fileType.startsWith("video/")) return "🎬";
  if (fileType.startsWith("audio/")) return "🎵";
  if (fileType.includes("word") || fileType.includes("document")) return "📝";
  if (fileType.includes("sheet") || fileType.includes("excel") || fileType.includes("csv")) return "📊";
  if (fileType.includes("presentation") || fileType.includes("powerpoint")) return "📽️";
  const ext = getExtension(fileName);
  if (CODE_EXTENSIONS.has(ext)) return "💻";
  if (TEXT_EXTENSIONS.has(ext)) return "📃";
  return "📎";
}

const TEXT_EXTENSIONS = new Set([
  "txt", "csv", "md", "json", "xml", "log", "ini", "cfg", "conf", "env", "yml", "yaml", "toml",
]);
const CODE_EXTENSIONS = new Set([
  "js", "mjs", "cjs", "jsx", "ts", "tsx", "py", "rb", "go", "rs", "java", "kt", "scala",
  "c", "cpp", "cc", "h", "hpp", "cs", "php", "sh", "bash", "zsh", "sql", "lua", "swift", "r",
  "html", "css", "scss", "less",
]);

function getExtension(fileName: string): string {
  return fileName.split(".").pop()?.toLowerCase() ?? "";
}

function canPreview(fileType: string, fileName: string): boolean {
  if (fileType === "application/pdf") return true;
  if (fileType.startsWith("image/")) return true;
  if (fileType.startsWith("video/")) return true;
  if (fileType.startsWith("audio/")) return true;
  if (fileType.includes("word") || fileType.includes("document")) return true;
  if (fileType.includes("sheet") || fileType.includes("excel") || fileType.includes("csv")) return true;
  const ext = getExtension(fileName);
  if (TEXT_EXTENSIONS.has(ext) || CODE_EXTENSIONS.has(ext)) return true;
  return false;
}

function PreviewLoader() {
  return (
    <div className="flex items-center justify-center gap-2 py-12 text-zinc-400">
      <Loader2 size={18} className="animate-spin" />
      <span className="text-sm">Loading preview…</span>
    </div>
  );
}

function FilePreview({ fileType, url, attachmentId, fileName }: { fileType: string; url: string; attachmentId: string; fileName: string }) {
  const [loading, setLoading] = useState(true);

  if (fileType === "application/pdf") {
    return <InlinePdfViewer url={url} />;
  }

  if (fileType.startsWith("image/")) {
    return (
      <div className="p-3 flex justify-center">
        {loading && <PreviewLoader />}
        <img
          src={url}
          alt="Preview"
          className={`max-w-full max-h-[400px] rounded ${loading ? "hidden" : ""}`}
          onLoad={() => setLoading(false)}
          onError={() => setLoading(false)}
        />
      </div>
    );
  }

  if (fileType.startsWith("video/")) {
    return (
      <div className="p-3 flex justify-center">
        {loading && <PreviewLoader />}
        <video
          src={url}
          controls
          className={`max-w-full max-h-[400px] rounded ${loading ? "hidden" : ""}`}
          onLoadedData={() => setLoading(false)}
          onError={() => setLoading(false)}
        />
      </div>
    );
  }

  if (fileType.startsWith("audio/")) {
    return (
      <div className="p-3 flex justify-center">
        {loading && <PreviewLoader />}
        <audio
          src={url}
          controls
          className={`w-full ${loading ? "hidden" : ""}`}
          onLoadedData={() => setLoading(false)}
          onError={() => setLoading(false)}
        />
      </div>
    );
  }

  // Server-side preview (DOCX, XLSX, text, code)
  const previewUrl = `/proxy/attachments/${attachmentId}/preview?name=${encodeURIComponent(fileName)}`;

  return (
    <div className="p-2">
      {loading && <PreviewLoader />}
      <iframe
        src={previewUrl}
        className={`w-full h-[500px] rounded border border-zinc-200 dark:border-zinc-700 bg-white ${loading ? "hidden" : ""}`}
        title="Document preview"
        onLoad={() => setLoading(false)}
      />
    </div>
  );
}

function FileEmbedComponent({ node, deleteNode }: { node: { attrs: FileEmbedAttributes }; deleteNode: () => void }) {
  const { attachmentId, fileName, fileType, fileSize } = node.attrs;
  const [status, setStatus] = useState<"pending" | "ready" | "error">("pending");
  const [showPreview, setShowPreview] = useState(false);

  const proxyUrl = `/proxy/attachments/${attachmentId}`;
  const previewable = canPreview(fileType, fileName);

  const pollStatus = useCallback(async () => {
    try {
      const res = await attachmentsApi.getStatus(attachmentId);
      if (res.ready) {
        setStatus("ready");
        return true;
      }
      if (res.scanStatus === "error" || res.scanStatus === "infected") {
        setStatus("error");
        return true;
      }
    } catch {
      setStatus("error");
      return true;
    }
    return false;
  }, [attachmentId]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    async function check() {
      const done = await pollStatus();
      if (!done && !cancelled) {
        timer = setTimeout(check, 3000);
      }
    }
    check();

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [pollStatus]);

  function handleDelete() {
    if (window.confirm("Remove this attachment from the page?")) {
      deleteNode();
    }
  }

  return (
    <NodeViewWrapper className="my-3" data-type="file-embed">
      <div className="border border-zinc-200 dark:border-zinc-700 rounded-lg overflow-hidden bg-zinc-50 dark:bg-zinc-800/50">
        {/* File info bar */}
        <div className="flex items-center gap-2.5 px-3 py-2.5">
          <span className="text-base shrink-0">{getFileIcon(fileType, fileName)}</span>
          <div className="flex-1 min-w-0">
            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-200 truncate block">
              {fileName}
            </span>
            <span className="text-xs text-zinc-400">{formatFileSize(fileSize)}</span>
          </div>

          {status === "pending" && (
            <span className="flex items-center gap-1.5 text-xs text-zinc-400">
              <Loader2 size={12} className="animate-spin" />
              Processing
            </span>
          )}
          {status === "error" && (
            <span className="flex items-center gap-1.5 text-xs text-red-400">
              <AlertCircle size={12} />
              Unavailable
            </span>
          )}
          {status === "ready" && previewable && (
            <button
              type="button"
              onClick={() => setShowPreview(!showPreview)}
              className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors shrink-0"
              title={showPreview ? "Hide preview" : "Preview"}
            >
              {showPreview ? <EyeOff size={12} /> : <Eye size={12} />}
              {showPreview ? "Hide" : "Preview"}
            </button>
          )}
          {status === "ready" && (
            <a
              href={proxyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors shrink-0"
              title="Download file"
            >
              <Download size={12} />
              Download
            </a>
          )}
          <button
            type="button"
            onClick={handleDelete}
            className="p-1.5 rounded-md hover:bg-red-100 dark:hover:bg-red-900/30 text-zinc-400 hover:text-red-500 transition-colors shrink-0"
            title="Remove attachment"
          >
            <Trash2 size={13} />
          </button>
        </div>

        {/* Preview panel — only shown on click */}
        {showPreview && status === "ready" && (
          <div className="border-t border-zinc-200 dark:border-zinc-700">
            <FilePreview fileType={fileType} url={proxyUrl} attachmentId={attachmentId} fileName={fileName} />
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
}

export const FileEmbedExtension = Node.create({
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

  renderHTML({ HTMLAttributes }: { HTMLAttributes: Record<string, unknown> }) {
    return ["div", mergeAttributes(HTMLAttributes as Record<string, string>, { "data-type": "file-embed" })];
  },

  addNodeView() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ReactNodeViewRenderer(FileEmbedComponent as any);
  },

  addCommands() {
    return {
      insertFileEmbed:
        (attrs: FileEmbedAttributes) =>
        ({ commands }: { commands: { insertContent: (arg: { type: string; attrs: FileEmbedAttributes }) => boolean } }) => {
          return commands.insertContent({ type: this.name, attrs });
        },
    };
  },
});
