"use client";

import { useState } from "react";
import { documentsApi } from "@/lib/api";
import type { Document } from "@wiki/types";
import { Tag, User, Clock, X, Plus, ChevronDown, ChevronUp, ShieldAlert } from "lucide-react";
import { Chip } from "@heroui/react";

interface Props {
  doc: Document;
  onUpdate: (updated: Document) => void;
}

export function PageMetadataPanel({ doc, onUpdate }: Props) {
  const [open, setOpen] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [saving, setSaving] = useState(false);

  async function addTag() {
    const tag = tagInput.trim();
    if (!tag || doc.tags.includes(tag)) { setTagInput(""); return; }
    setSaving(true);
    try {
      const updated = await documentsApi.update(doc.id, { tags: [...doc.tags, tag] });
      onUpdate(updated);
      setTagInput("");
    } finally {
      setSaving(false);
    }
  }

  async function removeTag(tag: string) {
    setSaving(true);
    try {
      const updated = await documentsApi.update(doc.id, { tags: doc.tags.filter((t) => t !== tag) });
      onUpdate(updated);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="border border-zinc-200 dark:border-zinc-700 rounded-xl overflow-hidden mb-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-zinc-50 dark:bg-zinc-900 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
      >
        <span className="flex items-center gap-2">
          <Tag size={14} />
          Page Info
        </span>
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      {open && (
        <div className="px-4 py-3 space-y-3 bg-white dark:bg-zinc-900 text-sm">
          {/* Owner */}
          <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400">
            <User size={13} className="shrink-0" />
            <span className="text-zinc-400">Owner:</span>
            <span className="text-zinc-700 dark:text-zinc-200">{doc.ownerName ?? doc.ownerId}</span>
          </div>

          {/* Last edited */}
          <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400">
            <Clock size={13} className="shrink-0" />
            <span className="text-zinc-400">Last edited:</span>
            <span className="text-zinc-700 dark:text-zinc-200">
              {new Date(doc.updatedAt).toLocaleString()}
              {doc.lastEditedByName && ` by ${doc.lastEditedByName}`}
            </span>
          </div>

          {/* Tags */}
          <div className="flex items-start gap-2">
            <Tag size={13} className="shrink-0 mt-1 text-zinc-400" />
            <div className="flex flex-wrap gap-1.5 flex-1">
              {doc.tags.map((tag) => (
                <Chip
                  key={tag}
                  size="sm"
                  variant="secondary"
                  className="text-xs flex items-center gap-1"
                  endContent={
                    <button
                      type="button"
                      onClick={() => removeTag(tag)}
                      disabled={saving}
                      className="ml-0.5 hover:text-red-500"
                    >
                      <X size={10} />
                    </button>
                  }
                >
                  {tag}
                </Chip>
              ))}
              <div className="flex items-center gap-1">
                <input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addTag()}
                  placeholder="Add tag…"
                  className="text-xs border border-zinc-200 dark:border-zinc-700 rounded-md px-2 py-0.5 bg-transparent outline-none focus:border-[#f25011] w-24"
                />
                <button
                  type="button"
                  onClick={addTag}
                  disabled={saving || !tagInput.trim()}
                  className="text-[#f25011] hover:text-[#e0470f] disabled:opacity-40"
                >
                  <Plus size={13} />
                </button>
              </div>
            </div>
          </div>

          {/* Restrict Download (PDF-6) */}
          {doc.type === "pdf" && (
            <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400">
              <ShieldAlert size={13} className="shrink-0" />
              <span className="text-zinc-400 flex-1">Restrict download/print:</span>
              <button
                type="button"
                disabled={saving}
                onClick={async () => {
                  setSaving(true);
                  try {
                    const updated = await documentsApi.update(doc.id, { restrictDownload: !doc.restrictDownload });
                    onUpdate(updated);
                  } finally {
                    setSaving(false);
                  }
                }}
                className={`text-xs px-2 py-0.5 rounded-md font-medium transition-colors ${
                  doc.restrictDownload
                    ? "bg-red-100 dark:bg-red-950/40 text-red-600"
                    : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500"
                }`}
              >
                {doc.restrictDownload ? "Restricted" : "Allowed"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
