/** Server-side API base URL (rewrites, route handlers). Use Docker service name in compose. */
export function getServerApiUrl(): string {
  return (
    process.env["API_URL"] ??
    process.env["NEXT_PUBLIC_API_URL"] ??
    "http://localhost:3001"
  );
}
