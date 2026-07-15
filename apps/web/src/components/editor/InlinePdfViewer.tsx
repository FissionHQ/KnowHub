"use client";

import { useState } from "react";
import { AlertCircle } from "lucide-react";

interface Props {
  url: string;
}

export default function InlinePdfViewer({ url }: Props) {
  const [error, setError] = useState(false);

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
      <object
        data={url}
        type="application/pdf"
        className="w-full h-[500px] rounded"
        onError={() => setError(true)}
      >
        <div className="flex items-center gap-2 px-3 py-3">
          <AlertCircle size={12} className="text-amber-500" />
          <p className="text-xs text-zinc-500">
            Your browser cannot display this PDF.{" "}
            <a href={url} target="_blank" rel="noopener noreferrer" className="text-[#f25011] hover:underline">
              Download instead
            </a>
          </p>
        </div>
      </object>
    </div>
  );
}
