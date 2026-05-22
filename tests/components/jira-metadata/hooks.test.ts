import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import {
  useJiraLabels,
  useIssueSearch,
  useEpics,
  useLinkTypes,
} from "@/components/jira-metadata/hooks";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify({ labels: ["backend"] }), { status: 200 }),
  );
});

describe("hooks", () => {
  it("useJiraLabels debounces and exposes loading/data/error", async () => {
    const { result, rerender } = renderHook(
      ({ q }: { q: string }) => useJiraLabels("c1", q, { debounceMs: 50 }),
      { initialProps: { q: "" } },
    );

    expect(result.current.loading).toBe(false);
    rerender({ q: "ba" });
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual(["backend"]);
  });

  it("useIssueSearch requires q.length >= 2 before fetching", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ issues: [] }), { status: 200 }),
    );
    const { rerender } = renderHook(
      ({ q }: { q: string }) =>
        useIssueSearch("c1", "PROJ", q, { debounceMs: 50 }),
      { initialProps: { q: "a" } },
    );
    await new Promise((r) => setTimeout(r, 100));
    expect(fetchMock).not.toHaveBeenCalled();
    rerender({ q: "ab" });
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  });

  it("useEpics fetches once per (cloudId, projectKey, q) and exposes retry", async () => {
    fetchMock.mockResolvedValueOnce(new Response("", { status: 500 }));
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ epics: [{ key: "EPIC-1", title: "Auth" }] }),
        { status: 200 },
      ),
    );
    const { result } = renderHook(() => useEpics("c1", "PROJ"));
    await waitFor(() => expect(result.current.error).not.toBeNull());
    await act(async () => {
      await result.current.retry();
    });
    await waitFor(() =>
      expect(result.current.data).toEqual([{ key: "EPIC-1", title: "Auth" }]),
    );
  });

  it("useLinkTypes caches across remounts for the same cloudId", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          linkTypes: [
            {
              id: "10000",
              name: "Relates",
              inward: "relates to",
              outward: "relates to",
            },
          ],
        }),
        { status: 200 },
      ),
    );
    // Use a unique cloudId for this test to avoid cross-test cache pollution.
    const { unmount } = renderHook(() => useLinkTypes("c1-linktypes"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    fetchMock.mockClear();
    unmount();
    renderHook(() => useLinkTypes("c1-linktypes"));
    await new Promise((r) => setTimeout(r, 30));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
