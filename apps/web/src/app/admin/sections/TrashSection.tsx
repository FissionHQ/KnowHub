"use client";

import { useState } from "react";
import useSWR from "swr";
import { documentsApi } from "@/lib/api";
import type { TrashedDocument } from "@wiki/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { File, FileText, Trash2 } from "lucide-react";
import { useToast } from "@/components/ui/ToastProvider";

export function TrashSection() {
  const { toast } = useToast();
  const { data: items = [], error, isLoading, mutate } = useSWR(
    "admin:trash",
    documentsApi.listTrash,
  );
  const [restoringId, setRestoringId] = useState<string | null>(null);

  async function handleRestore(item: TrashedDocument) {
    setRestoringId(item.id);
    try {
      await documentsApi.restore(item.id);
      await mutate();
      toast(`"${item.title}" restored to ${item.spaceName}`, "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to restore document", "error");
    } finally {
      setRestoringId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="p-6">
          <h2 className="text-lg font-semibold text-foreground mb-1">
            Trash
          </h2>
          <p className="text-sm text-muted-foreground">
            Deleted documents are kept here until the organization trash retention period expires,
            then permanently removed.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0 divide-y divide-border">
          {isLoading ? (
            <p className="px-4 py-8 text-sm text-muted-foreground text-center">
              Loading trash…
            </p>
          ) : error ? (
            <p className="px-4 py-8 text-sm text-red-600 dark:text-red-400 text-center">
              Failed to load trash.
            </p>
          ) : items.length === 0 ? (
            <div className="px-4 py-12 flex flex-col items-center gap-2 text-muted-foreground">
              <Trash2 size={28} className="opacity-40" />
              <p className="text-sm">Trash is empty.</p>
            </div>
          ) : (
            items.map((item) => (
              <div
                key={item.id}
                className="px-4 py-4 flex items-center justify-between gap-4 flex-wrap"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={
                      item.type === "pdf"
                        ? "p-1.5 rounded-lg bg-red-50 dark:bg-red-950/40 text-red-500 shrink-0"
                        : "p-1.5 rounded-lg bg-orange-50 dark:bg-orange-950/40 text-primary dark:text-orange-400 shrink-0"
                    }
                  >
                    {item.type === "pdf" ? <File size={16} /> : <FileText size={16} />}
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-foreground truncate">
                      {item.title}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {item.spaceName}
                      {item.previousStatus === "draft" && (
                        <span className="text-muted-foreground"> · was draft</span>
                      )}
                      {" · deleted "}
                      {new Date(item.trashedAt).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </p>
                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
                      Permanent deletion on{" "}
                      {new Date(item.purgeAt).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </p>
                  </div>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={restoringId === item.id}
                  onClick={() => handleRestore(item)}
                >
                  {restoringId === item.id ? "Restoring…" : "Restore"}
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
