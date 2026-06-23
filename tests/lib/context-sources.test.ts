import { describe, expect, it, vi } from "vitest";
import { normalizeContextLinks, resolveSourceContext } from "@/lib/context/sources";

const publicLookup = vi.fn(async () => [{ address: "93.184.216.34", family: 4 }]);

describe("context source resolver", () => {
  it("normalizes, dedupes, and caps context links", () => {
    const links = [
      "https://example.com/a",
      "https://example.com/a",
      "ftp://example.com/nope",
      "not a url",
      "https://example.com/b",
    ];
    expect(normalizeContextLinks(links)).toEqual([
      "https://example.com/a",
      "https://example.com/b",
    ]);
  });

  it("reads public html pages into source context", async () => {
    const fetchImpl = vi.fn(async () => new Response(
      "<html><head><title>Spec</title><meta name=\"description\" content=\"Meta summary\"></head><body><h1>Spec</h1><p>Must support CSV export.</p></body></html>",
      { headers: { "content-type": "text/html" } },
    ));
    const [item] = await resolveSourceContext(["https://example.com/spec"], {
      fetchImpl,
      lookup: publicLookup,
    });
    expect(item).toMatchObject({
      url: "https://example.com/spec",
      kind: "web",
      status: "resolved",
      title: "Spec",
    });
    expect(item.content).toContain("Meta summary");
    expect(item.content).toContain("Must support CSV export.");
  });

  it("does not fetch URLs that resolve to private network addresses", async () => {
    const lookup = vi.fn(async () => [{ address: "127.0.0.1", family: 4 }]);
    const fetchImpl = vi.fn();
    const [item] = await resolveSourceContext(["https://internal.example/spec"], {
      fetchImpl,
      lookup,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(item.status).toBe("unresolved");
    expect(item.error).toMatch(/private or local network/i);
  });
});
