"use client";

import { useState } from "react";
import useSWR from "swr";
import { trashApi } from "@/lib/api";
import type { Document } from "@wiki/types";
import { Card, CardContent, Button, Chip } from "@heroui/react";
import { Trash2, RotateCcw, AlertTriangle, FileText, File } from "lucide-react";

export default function TrashPage() {
  const { data: docs = [], mutate } = useSWR<Document[]>("trash", trashApi.list);
  const [loading, setLoading] = useState<string | null>(null);

  async function handleRestore(id: string) {
    setLoading(id);
    try {
      await trashApi.restore(id);
      mutate();
    } finally {
      setLoading(null);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Permanently delete this document? This cannot be undone.")) return;
    setLoading(id);
    try {
      await trashApi.permanentDelete(id);
      mutate();
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="max-w-4xl mx-auto p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
          <Trash2 size={22} className="text-zinc-400" />
          Trash
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
          Deleted documents can be restored by admins within the retention window.
        </p>
      </div>

      {docs.length === 0 ? (
        <Card>
          <CardContent className="py-16 flex flex-col items-center gap-3 text-zinc-400 dark:text-zinc-500 p-5">
            <Trash2 size={36} className="opacity-30" />
            <p className="text-sm">Trash is empty</p>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {docs.map((doc) => (
            <Card key={doc.id}>
              <CardContent className="flex items-center gap-3 p-4">
                <div className="p-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-400 shrink-0">
                  {doc.type === "pdf" ? <File size={15} /> : <FileText size={15} />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm text-zinc-900 dark:text-zinc-100 truncate">
                    {doc.title}
                  </p>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Deleted {new Date(doc.updatedAt).toLocaleDateString()}
                    {(doc as any).ownerName && ` · by ${(doc as any).ownerName}`}
                  </p>
                </div>
                <Chip size="sm" variant="flat" className="text-xs shrink-0">
                  {doc.type.toUpperCase()}
                </Chip>
                <Button
                  size="sm"
                  variant="bordered"
                  isDisabled={loading === doc.id}
                  onPress={() => handleRestore(doc.id)}
                  className="shrink-0 text-emerald-600 border-emerald-200 hover:bg-emerald-50"
                >
                  <RotateCcw size={13} />
                  Restore
                </Button>
                <Button
                  size="sm"
                  variant="bordered"
                  isDisabled={loading === doc.id}
                  onPress={() => handleDelete(doc.id)}
                  className="shrink-0 text-red-600 border-red-200 hover:bg-red-50"
                >
                  <AlertTriangle size={13} />
                  Delete
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
