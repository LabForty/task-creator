// Only allow same-origin relative paths so the OAuth flow can't be turned
// into an open redirect. Absolute URLs and protocol-relative paths collapse
// to the root.
export function sanitizeReturnPath(p: string | null | undefined): string {
  if (!p) return "/";
  if (typeof p !== "string") return "/";
  if (!p.startsWith("/")) return "/";
  if (p.startsWith("//")) return "/";
  // Disallow backslashes (some browsers normalize \ to / before sending,
  // which can sneak past the //-prefix check).
  if (p.includes("\\")) return "/";
  return p;
}
