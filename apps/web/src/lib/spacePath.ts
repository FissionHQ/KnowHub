/** Build in-app paths for a space (uses slug in the URL). */
export function spacePath(
  space: { slug: string },
  ...segments: string[]
): string {
  const base = `/spaces/${space.slug}`;
  if (!segments.length) return base;
  return `${base}/${segments.join("/")}`;
}

export function spaceDocPath(
  space: { slug: string },
  docId: string,
): string {
  return spacePath(space, "docs", docId);
}
