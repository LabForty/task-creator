import { requireSessionOrRedirect } from "@/lib/auth/requireSession";
import { EmbedApp } from "@/components/EmbedApp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function buildReturnPath(sp: Record<string, string | string[] | undefined>): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === "string") qs.set(k, v);
    else if (Array.isArray(v)) qs.set(k, v[0] ?? "");
  }
  const s = qs.toString();
  return s ? `/embed?${s}` : "/embed";
}

export default async function EmbedPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  // Gate the embed surface too; redirect preserves query params so the user
  // lands back on the same embed configuration after signing in.
  await requireSessionOrRedirect(buildReturnPath(sp));
  return <EmbedApp />;
}
