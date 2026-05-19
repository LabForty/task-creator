import { NextResponse, type NextRequest } from "next/server";

function getAllowedOrigins(): string[] {
  return (process.env.TASK_EMBED_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function middleware(req: NextRequest) {
  const origin = req.headers.get("origin") ?? "";
  const allowed = getAllowedOrigins();

  // Preflight: short-circuit with the right CORS headers (no body).
  if (req.method === "OPTIONS") {
    const headers = new Headers();
    headers.set("access-control-allow-methods", "GET, POST, OPTIONS");
    headers.set("access-control-allow-headers", "content-type, x-forwarded-for");
    headers.set("access-control-max-age", "86400");
    if (allowed.length === 0 || allowed.includes(origin)) {
      if (origin) {
        headers.set("access-control-allow-origin", origin);
        headers.set("vary", "Origin");
      }
    }
    return new NextResponse(null, { status: 204, headers });
  }

  const res = NextResponse.next();
  if (allowed.length === 0 || allowed.includes(origin)) {
    if (origin) {
      res.headers.set("access-control-allow-origin", origin);
      res.headers.set("vary", "Origin");
    }
  }
  return res;
}

export const config = {
  // Apply CORS handling to all /api routes EXCEPT /api/jira/*. Jira routes are
  // always same-origin (the OAuth popup is opened with window.open from the
  // app), and middleware that wraps NextResponse.next() can interfere with
  // Set-Cookie headers on those responses.
  matcher: ["/api/((?!jira/).*)"],
};
