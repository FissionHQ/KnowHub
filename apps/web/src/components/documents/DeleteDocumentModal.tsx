"use client";

import { useState } from "react";
import { Button } from "@heroui/react";
import { AlertTriangle } from "lucide-react";

interface Props {
  open: boolean;
  title: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

export function DeleteDocumentModal({ open, title, onClose, onConfirm }: Props) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  async function handleConfirm() {
    setDeleting(true);
    setError(null);
    try {
      await onConfirm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete document");
      setDeleting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        role="alertdialog"
        aria-labelledby="delete-doc-title"
        aria-describedby="delete-doc-desc"
        className="bg-white dark:bg-zinc-900 rounded-xl shadow-xl w-full max-w-md p-6"
      >
        <div className="flex items-start gap-3 mb-4">
          <div className="p-2 rounded-full bg-red-50 dark:bg-red-950/40 text-red-500 shrink-0">
            <AlertTriangle size={20} />
          </div>
          <div>
            <h2
              id="delete-doc-title"
              className="text-lg font-semibold text-zinc-900 dark:text-zinc-100"
            >
              Delete document?
            </h2>
            <p id="delete-doc-desc" className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
              Are you sure you want to delete{" "}
              <span className="font-medium text-zinc-700 dark:text-zinc-300">&quot;{title}&quot;</span>
              ? This action cannot be undone.
            </p>
          </div>
        </div>

        {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onClose} isDisabled={deleting}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            className="bg-red-600 hover:bg-red-700 text-white"
            onClick={handleConfirm}
            isDisabled={deleting}
          >
            {deleting ? "Deleting…" : "Yes, Delete"}
          </Button>
        </div>
      </div>
    </div>
  );
}
