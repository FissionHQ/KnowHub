export function getCollabWsUrl(): string {
  return process.env["NEXT_PUBLIC_COLLAB_WS_URL"] ?? "ws://localhost:3003";
}

export function getCollaborationToken(): string | undefined {
  // wiki_token is httpOnly — use fetchCollaborationToken() in the browser.
  if (typeof window === "undefined") return undefined;
  return process.env["NEXT_PUBLIC_DEV_JWT"];
}

export async function fetchCollaborationToken(): Promise<string | undefined> {
  if (typeof window === "undefined") return undefined;

  const devToken = process.env["NEXT_PUBLIC_DEV_JWT"];
  if (devToken) return devToken;

  try {
    const res = await fetch("/api/auth/collab-token", { credentials: "include" });
    if (!res.ok) return undefined;
    const json = (await res.json()) as { data?: { token?: string } };
    return json.data?.token;
  } catch {
    return undefined;
  }
}

export function colorForUser(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue} 65% 45%)`;
}

export type CollabPresenceMode = "view" | "edit";

export interface CollabAwarenessUser {
  id: string;
  name: string;
  color: string;
  mode: CollabPresenceMode;
}

export interface PresenceCounts {
  editors: number;
  viewers: number;
}

export function formatPresenceLabel(
  counts: PresenceCounts,
  status: "connecting" | "connected" | "disconnected",
  canEdit?: boolean,
): string {
  if (status === "connecting") return "Connecting…";

  const parts: string[] = [];
  if (counts.editors > 0) {
    parts.push(counts.editors === 1 ? "1 editing" : `${counts.editors} editing`);
  }
  if (counts.viewers > 0) {
    parts.push(counts.viewers === 1 ? "1 viewing" : `${counts.viewers} viewing`);
  }

  if (parts.length > 0) return parts.join(", ");

  if (status === "disconnected") {
    return canEdit ? "1 editing" : "1 viewing";
  }

  return canEdit ? "1 editing" : "1 viewing";
}
