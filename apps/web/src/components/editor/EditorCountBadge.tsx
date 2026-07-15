"use client";

interface Props {
  count: number;
  status: "connecting" | "connected" | "disconnected";
}

export function EditorCountBadge({ count, status }: Props) {
  if (status === "disconnected") {
    return (
      <span className="text-xs text-amber-600 bg-amber-50 px-2.5 py-1 rounded-full">
        Offline — edits may not sync
      </span>
    );
  }

  const label =
    count === 1
      ? "1 person editing"
      : `${count} people editing`;

  return (
    <span className="text-xs text-zinc-500 bg-zinc-100 dark:bg-zinc-800 px-2.5 py-1 rounded-full">
      {status === "connecting" ? "Connecting…" : label}
    </span>
  );
}
