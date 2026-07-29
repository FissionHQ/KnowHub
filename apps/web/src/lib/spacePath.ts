/** Build in-app paths for a space (uses slug in the URL). */
export function spacePath(
  space: { slug: string },
  ...segments: string[]
): string {
  const base = `/spaces/${space.slug}`;
  if (!segments.length) return base;
  return `${base}/${segments.join("/")}`;
}

/** Build `/spaces/{spaceSlug}/docs/{docSlug}`. Accepts a doc object or slug string. */
export function spaceDocPath(
  space: { slug: string },
  docOrSlug: { slug: string } | string,
): string {
  const docSlug = typeof docOrSlug === "string" ? docOrSlug : docOrSlug.slug;
  return spacePath(space, "docs", String(docSlug));
}
