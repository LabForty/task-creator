import { describe, it, expect, vi, afterEach } from "vitest";

describe("jira callback route", () => {
  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("redirects back to the public OAuth callback origin, not the internal listener origin", async () => {
    const redirectUri = "https://192.168.90.30:3443/api/jira/callback";
    const stateCookie = [
      "nonce",
      "0",
      encodeURIComponent(redirectUri),
      encodeURIComponent("/drafts"),
    ].join("|");

    vi.doMock("@/lib/jira", () => ({
      JiraError: class JiraError extends Error {},
      clearStateCookieOnResponse: vi.fn(),
      constantTimeEquals: vi.fn(),
      exchangeCodeForTokens: vi.fn(),
      listAccessibleResources: vi.fn(),
      resolveAccountIdentity: vi.fn(),
      readConfig: vi.fn(),
      readStateCookie: vi.fn().mockResolvedValue(stateCookie),
      resolveRedirectUri: vi.fn(),
      setSessionCookieOnResponse: vi.fn(),
    }));

    const { GET } = await import("@/app/api/jira/callback/route");
    const res = await GET(
      new Request(
        "http://0.0.0.0:3000/api/jira/callback?error=access_denied&error_description=Nope",
      ),
    );

    const location = res.headers.get("location") ?? "";
    expect(location).toContain("https://192.168.90.30:3443/signin?");
    expect(location).not.toContain("0.0.0.0:3000");
    expect(location).toContain("return=%2Fdrafts");
  });
});
