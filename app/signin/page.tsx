import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getValidSession, isConfigured } from "@/lib/jira";
import { sanitizeReturnPath } from "@/lib/auth/returnPath";
import { SigninExperience } from "@/components/signin/SigninExperience";

export const runtime = "nodejs";
// Auth state and Jira config are per-request — don't cache the response.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sign in · Task Creator",
  description: "Sign in with your Atlassian account to use Task Creator.",
};

type SearchParams = Promise<{
  return?: string | string[];
  error?: string | string[];
}>;

function pick(v: string | string[] | undefined): string | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

export default async function SigninPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const returnPath = sanitizeReturnPath(pick(sp.return));
  const error = pick(sp.error);

  const configured = isConfigured();

  // Already signed in? Skip the landing page entirely. We resolve the session
  // outside any try/catch that would swallow the NEXT_REDIRECT throw.
  let alreadySignedIn = false;
  if (configured) {
    try {
      await getValidSession();
      alreadySignedIn = true;
    } catch {
      // Not connected — fall through to the landing UI.
    }
  }
  if (alreadySignedIn) {
    redirect(returnPath);
  }

  const connectHref = `/api/jira/connect?return=${encodeURIComponent(returnPath)}`;

  return (
    <SigninExperience
      configured={configured}
      error={error}
      connectHref={connectHref}
    />
  );
}
