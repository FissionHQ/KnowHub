export function formatFileSize(bytes: number | null | undefined): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDateTime(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toLocaleString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatShortDate(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toLocaleString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function ownerInitials(name: string, email: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
  }
  if (name.trim()) return name.trim().slice(0, 2).toUpperCase();
  return (email[0] ?? "?").toUpperCase();
}

export function ownerAvatarColor(id: string): string {
  const colors = [
    "bg-orange-500",
    "bg-violet-500",
    "bg-emerald-500",
    "bg-sky-500",
    "bg-rose-500",
    "bg-amber-500",
  ];
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash + id.charCodeAt(i)) % colors.length;
  return colors[hash] ?? "bg-zinc-500";
}

export function categoryLabel(tags: string[], fallback = "General"): string {
  return tags[0] ?? fallback;
}

export function categoryColor(tag: string): string {
  const map: Record<string, string> = {
    Engineering: "bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300",
    Guides: "bg-orange-100 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300",
    Product: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300",
    General: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
  };
  return map[tag] ?? "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300";
}
