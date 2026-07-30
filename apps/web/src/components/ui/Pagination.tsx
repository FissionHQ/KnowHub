import { ChevronLeft, ChevronRight } from "lucide-react";

interface Props {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onChange: (page: number) => void;
  label?: string;
}

export function Pagination({ page, totalPages, total, pageSize, onChange, label = "items" }: Props) {
  if (total === 0) return null;
  const from = page * pageSize + 1;
  const to = Math.min((page + 1) * pageSize, total);
  return (
    <div className="flex items-center justify-between border-t border-border px-4 py-3 text-sm text-muted-foreground">
      <span>{from}–{to} of {total} {label}</span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onChange(page - 1)}
          disabled={page === 0}
          className="p-1 rounded hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft size={16} />
        </button>
        <span className="px-2 tabular-nums text-xs">{page + 1} / {totalPages}</span>
        <button
          type="button"
          onClick={() => onChange(page + 1)}
          disabled={page >= totalPages - 1}
          className="p-1 rounded hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}
