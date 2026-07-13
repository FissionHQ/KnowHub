"use client";

import { Button, Dropdown } from "@heroui/react";
import {
  ArrowDownAZ,
  ChevronDown,
  Filter,
  Plus,
  RefreshCw,
  Search,
  Upload,
  FileInput,
  FileText,
} from "lucide-react";
import clsx from "clsx";
import type { DocumentSortKey, DocumentTableState, DocumentViewFilter } from "./types";

interface Props {
  spaceId: string;
  state: DocumentTableState;
  onStateChange: (patch: Partial<DocumentTableState>) => void;
  onRefresh: () => void;
  isRefreshing?: boolean;
  onUploadPdf: () => void;
  onImportDocx: () => void;
}

const VIEW_OPTIONS: { id: DocumentViewFilter; label: string }[] = [
  { id: "recent", label: "Recently edited" },
  { id: "categories", label: "Table by category" },
  { id: "all", label: "All" },
  { id: "mine", label: "Mine" },
];

export function DocumentTableToolbar({
  spaceId,
  state,
  onStateChange,
  onRefresh,
  isRefreshing,
  onUploadPdf,
  onImportDocx,
}: Props) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-sm sticky top-0 z-10">
      <div className="flex items-center gap-1 flex-wrap">
        {VIEW_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => onStateChange({ view: opt.id })}
            className={clsx(
              "px-3 py-1.5 rounded-lg text-sm transition-colors",
              state.view === opt.id
                ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-medium"
                : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-900",
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            type="search"
            placeholder="Search documents…"
            value={state.search}
            onChange={(e) => onStateChange({ search: e.target.value })}
            aria-label="Search documents"
            className="h-8 pl-8 pr-3 w-44 sm:w-52 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 outline-none focus:border-violet-400"
          />
        </div>

        <Button
          variant="ghost"
          size="sm"
          aria-label="Filter"
          className="min-w-8 px-2"
          onClick={() => onStateChange({ sortKey: "title", sortAsc: !state.sortAsc })}
        >
          <Filter size={15} />
        </Button>

        <Dropdown>
          <Dropdown.Trigger>
            <Button variant="ghost" size="sm" aria-label="Sort" className="min-w-8 px-2">
              <ArrowDownAZ size={15} />
            </Button>
          </Dropdown.Trigger>
          <Dropdown.Popover placement="bottom end">
            <Dropdown.Menu
              onAction={(key) => {
                const sortKey = key as DocumentSortKey;
                onStateChange({
                  sortKey,
                  sortAsc: state.sortKey === sortKey ? !state.sortAsc : sortKey === "title",
                });
              }}
            >
              <Dropdown.Item id="updatedAt" textValue="Last modified">
                Last modified
              </Dropdown.Item>
              <Dropdown.Item id="createdAt" textValue="Created">
                Created
              </Dropdown.Item>
              <Dropdown.Item id="title" textValue="Title">
                Title
              </Dropdown.Item>
            </Dropdown.Menu>
          </Dropdown.Popover>
        </Dropdown>

        <Button
          variant="ghost"
          size="sm"
          aria-label="Refresh"
          className="min-w-8 px-2"
          onClick={onRefresh}
          {...(isRefreshing ? { isDisabled: true } : {})}
        >
          <RefreshCw size={15} className={isRefreshing ? "animate-spin" : ""} />
        </Button>

        <Dropdown>
          <Dropdown.Trigger>
            <Button variant="primary" size="sm" className="gap-1">
              New
              <ChevronDown size={14} />
            </Button>
          </Dropdown.Trigger>
          <Dropdown.Popover placement="bottom end">
            <Dropdown.Menu
              onAction={(key) => {
                if (key === "page") window.location.href = `/spaces/${spaceId}/new`;
                if (key === "pdf") onUploadPdf();
                if (key === "docx") onImportDocx();
              }}
            >
              <Dropdown.Item id="page" textValue="New page">
                <span className="flex items-center gap-2">
                  <FileText size={14} /> New page
                </span>
              </Dropdown.Item>
              <Dropdown.Item id="pdf" textValue="Upload PDF">
                <span className="flex items-center gap-2">
                  <Upload size={14} /> Upload PDF
                </span>
              </Dropdown.Item>
              <Dropdown.Item id="docx" textValue="Import DOCX">
                <span className="flex items-center gap-2">
                  <FileInput size={14} /> Import DOCX
                </span>
              </Dropdown.Item>
            </Dropdown.Menu>
          </Dropdown.Popover>
        </Dropdown>
      </div>
    </div>
  );
}
