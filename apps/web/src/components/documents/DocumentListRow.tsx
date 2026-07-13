"use client";

import { useState } from "react";
import Link from "next/link";
import { documentsApi } from "@/lib/api";
import type { DocumentListItem } from "@wiki/types";
import { Button, Chip, Card, CardContent, Dropdown } from "@heroui/react";
import { FileText, File, MoreVertical, Trash2 } from "lucide-react";
import { DeleteDocumentModal } from "./DeleteDocumentModal";

interface Props {
  doc: DocumentListItem;
  spaceId: string;
  onDeleted: () => void;
}

export function DocumentListRow({ doc, spaceId, onDeleted }: Props) {
  const [deleteOpen, setDeleteOpen] = useState(false);

  return (
    <>
      <Card className="transition-all hover:shadow-sm hover:border-zinc-300 dark:hover:border-zinc-600">
        <CardContent className="flex flex-row items-center gap-3 px-4 py-3">
          <Link
            href={`/spaces/${spaceId}/docs/${doc.id}`}
            className="group flex flex-1 items-center gap-3 min-w-0"
          >
            <div
              className={
                doc.type === "pdf"
                  ? "p-1.5 rounded-lg bg-red-50 dark:bg-red-950/40 text-red-500 shrink-0"
                  : "p-1.5 rounded-lg bg-violet-50 dark:bg-violet-950/40 text-violet-600 dark:text-violet-400 shrink-0"
              }
            >
              {doc.type === "pdf" ? <File size={16} /> : <FileText size={16} />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-zinc-900 dark:text-zinc-100 text-sm truncate group-hover:text-violet-700 dark:group-hover:text-violet-300 transition-colors">
                {doc.title}
              </p>
              <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">
                {new Date(doc.updatedAt).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
            </div>
          </Link>

          <div className="flex items-center gap-1.5 shrink-0">
            {doc.tags.slice(0, 2).map((tag) => (
              <Chip key={tag} size="sm" variant="secondary" className="text-xs">
                {tag}
              </Chip>
            ))}
            {doc.status === "draft" && (
              <Chip size="sm" color="warning" variant="soft" className="text-xs">
                Draft
              </Chip>
            )}
            {doc.canDelete && (
              <Dropdown>
                <Dropdown.Trigger>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Actions for ${doc.title}`}
                    className="min-w-8 px-2 text-zinc-500 hover:text-zinc-700"
                  >
                    <MoreVertical size={16} />
                  </Button>
                </Dropdown.Trigger>
                <Dropdown.Popover placement="bottom end">
                  <Dropdown.Menu
                    onAction={(key) => {
                      if (key === "delete") setDeleteOpen(true);
                    }}
                  >
                    <Dropdown.Item id="delete" textValue="Delete">
                      <span className="flex items-center gap-2 text-red-600">
                        <Trash2 size={14} />
                        Delete
                      </span>
                    </Dropdown.Item>
                  </Dropdown.Menu>
                </Dropdown.Popover>
              </Dropdown>
            )}
          </div>
        </CardContent>
      </Card>

      <DeleteDocumentModal
        open={deleteOpen}
        title={doc.title}
        onClose={() => setDeleteOpen(false)}
        onConfirm={async () => {
          await documentsApi.delete(doc.id);
          setDeleteOpen(false);
          onDeleted();
        }}
      />
    </>
  );
}
