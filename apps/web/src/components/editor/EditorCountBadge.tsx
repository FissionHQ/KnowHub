"use client";

import { formatPresenceLabel, type PresenceCounts } from "@/lib/collab";

interface Props {
  presence: PresenceCounts;
  status: "connecting" | "connected" | "disconnected";
  canEdit?: boolean;
}

export function EditorCountBadge({ presence, status, canEdit }: Props) {
  return (
    <span className="text-xs text-zinc-500 bg-zinc-100 dark:bg-zinc-800 px-2.5 py-1 rounded-full">
      {formatPresenceLabel(presence, status, canEdit)}
    </span>
  );
}
