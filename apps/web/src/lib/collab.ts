export function getCollabWsUrl(): string {
  return process.env["NEXT_PUBLIC_COLLAB_WS_URL"] ?? "ws://localhost:3003";
}

export function getCollaborationToken(): string | undefined {
  if (typeof window === "undefined") return undefined;

  const match = document.cookie.match(/(?:^|; )wiki_token=([^;]+)/);
  if (match?.[1]) return decodeURIComponent(match[1]);

  return process.env["NEXT_PUBLIC_DEV_JWT"];
}

export function colorForUser(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue} 65% 45%)`;
}
