import { requireSessionOrRedirect } from "@/lib/auth/requireSession";
import { DraftsDashboard } from "@/components/drafts/DraftsDashboard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function DraftsPage() {
  await requireSessionOrRedirect("/drafts");
  return (
    <main className="min-h-screen bg-surface-subtle">
      <DraftsDashboard />
    </main>
  );
}
