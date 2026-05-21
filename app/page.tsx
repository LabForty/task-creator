import { requireSessionOrRedirect } from "@/lib/auth/requireSession";
import { StandaloneApp } from "@/components/StandaloneApp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function Page() {
  const session = await requireSessionOrRedirect("/");
  return (
    <StandaloneApp
      initialSession={{
        configured: true,
        connected: true,
        email: session.email ?? null,
        accountId: session.accountId,
      }}
    />
  );
}
