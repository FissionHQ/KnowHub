"use client";

import { Button } from "@/components/ui/button";
import { Trash2, Loader2 } from "lucide-react";

export function TrashConfirmDialog({
  title,
  deleting,
  onCancel,
  onConfirm,
}: {
  title: string;
  deleting: boolean;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
}) {
  return (
    <>
      <div
        className="fixed inset-0 z-[10000] bg-black/40 backdrop-blur-[1px]"
        onClick={deleting ? undefined : onCancel}
        aria-hidden="true"
      />
      <div className="fixed inset-0 z-[10001] flex items-center justify-center p-4 pointer-events-none">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="trash-confirm-title"
          className="pointer-events-auto w-full max-w-sm rounded-xl border border-border bg-card text-card-foreground shadow-xl"
        >
          <div className="px-5 pt-5 pb-4">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 shrink-0">
                <Trash2 size={18} />
              </div>
              <div className="min-w-0">
                <h2
                  id="trash-confirm-title"
                  className="text-base font-semibold text-foreground"
                >
                  Move to trash?
                </h2>
                <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
                  <span className="font-medium text-foreground/80">{title}</span>{" "}
                  will be moved to trash. An admin can restore it before the retention period
                  expires.
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between gap-2 px-5 py-4 border-t border-border bg-muted/50 rounded-b-xl">
            <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={deleting}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={onConfirm}
              disabled={deleting}
            >
              {deleting ? <Loader2 className="animate-spin" size={14} /> : null}
              Move to trash
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
