"use client";

import { formatPresenceLabel, type PresenceCounts } from "@/lib/collab";

interface Props {
  presence: PresenceCounts;
  status: "connecting" | "connected" | "disconnected";
  canEdit?: boolean;
}

export function EditorCountBadge({ presence, status, canEdit }: Props) {
  return (
    <span className="text-xs text-muted-foreground bg-muted px-2.5 py-1 rounded-full">
      {formatPresenceLabel(presence, status, canEdit)}
    </span>
  );
}
