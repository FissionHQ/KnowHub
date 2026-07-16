"use client";

import { useState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";

interface Props {
  url: string;
}

export default function InlinePdfViewer({ url }: Props) {
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  if (error) {
    return (
      <div className="px-3 py-3 flex items-center gap-2">
        <AlertCircle size={12} className="text-amber-500" />
        <p className="text-xs text-zinc-500">
          PDF preview unavailable.{" "}
          <a href={url} target="_blank" rel="noopener noreferrer" className="text-[#f25011] hover:underline">
            Open in new tab
          </a>
        </p>
      </div>
    );
  }

  return (
    <div className="p-2">
      {loading && (
        <div className="flex items-center justify-center gap-2 py-12 text-zinc-400">
          <Loader2 size={18} className="animate-spin" />
          <span className="text-sm">Loading preview…</span>
        </div>
      )}
      <iframe
        src={url}
        className={`w-full h-[500px] rounded border-0 ${loading ? "hidden" : ""}`}
        title="PDF preview"
        onLoad={() => setLoading(false)}
        onError={() => { setLoading(false); setError(true); }}
      />
    </div>
  );
}
