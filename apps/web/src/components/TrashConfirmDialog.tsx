"use client";

import { Button } from "@heroui/react";
import { Trash2 } from "lucide-react";

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
          className="pointer-events-auto w-full max-w-sm rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-xl"
        >
          <div className="px-5 pt-5 pb-4">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 shrink-0">
                <Trash2 size={18} />
              </div>
              <div className="min-w-0">
                <h2
                  id="trash-confirm-title"
                  className="text-base font-semibold text-zinc-900 dark:text-zinc-100"
                >
                  Move to trash?
                </h2>
                <p className="mt-1.5 text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">
                  <span className="font-medium text-zinc-700 dark:text-zinc-300">{title}</span>{" "}
                  will be moved to trash. An admin can restore it before the retention period
                  expires.
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 rounded-b-xl">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onPress={onCancel}
              isDisabled={deleting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              className="bg-red-600 hover:bg-red-700 text-white"
              onPress={onConfirm}
              isPending={deleting}
              isDisabled={deleting}
            >
              Move to trash
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
