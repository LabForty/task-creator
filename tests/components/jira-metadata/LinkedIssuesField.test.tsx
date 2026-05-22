import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LinkedIssuesField } from "@/components/jira-metadata/LinkedIssuesField";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

const linkTypes = [
  { id: "10000", name: "Relates", inward: "relates to", outward: "relates to" },
  { id: "10001", name: "Blocks", inward: "is blocked by", outward: "blocks" },
];

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string) => {
    if (url.includes("/api/jira/link-types")) {
      return new Response(JSON.stringify({ linkTypes }), { status: 200 });
    }
    if (url.includes("/api/jira/issue-search")) {
      return new Response(JSON.stringify({ issues: [{ key: "ABC-1", title: "Add export" }] }), { status: 200 });
    }
    return new Response("", { status: 404 });
  });
});

describe("LinkedIssuesField", () => {
  it("shows results for a 2+ char query", async () => {
    const user = userEvent.setup();
    render(<LinkedIssuesField cloudId="c1" projectKey="PROJ" value={[]} onChange={() => {}} />);
    await user.type(screen.getByRole("combobox", { name: /linked issue search/i }), "add");
    await waitFor(() => expect(screen.getByText("ABC-1")).toBeInTheDocument());
    expect(screen.getByText("Add export")).toBeInTheDocument();
  });

  it("adds a result as a chip with default link type Relates", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<LinkedIssuesField cloudId="c1" projectKey="PROJ" value={[]} onChange={onChange} />);
    await user.type(screen.getByRole("combobox", { name: /linked issue search/i }), "add");
    await waitFor(() => screen.getByText("ABC-1"));
    await user.click(screen.getByText("ABC-1"));
    expect(onChange).toHaveBeenCalledWith([
      { key: "ABC-1", title: "Add export", linkTypeId: "10000" },
    ]);
  });

  it("prevents adding the same (key, linkTypeId) twice", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <LinkedIssuesField
        cloudId="c1"
        projectKey="PROJ"
        value={[{ key: "ABC-1", title: "Add export", linkTypeId: "10000" }]}
        onChange={onChange}
      />,
    );
    await user.type(screen.getByRole("combobox", { name: /linked issue search/i }), "add");
    await waitFor(() => screen.getByText("ABC-1"));
    await user.click(screen.getByText("ABC-1"));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("allows changing a chip's link type via the dropdown", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <LinkedIssuesField
        cloudId="c1"
        projectKey="PROJ"
        value={[{ key: "ABC-1", title: "Add export", linkTypeId: "10000" }]}
        onChange={onChange}
      />,
    );
    const select = screen.getByLabelText("Link type for ABC-1");
    await user.selectOptions(select, "10001");
    expect(onChange).toHaveBeenCalledWith([
      { key: "ABC-1", title: "Add export", linkTypeId: "10001" },
    ]);
  });
});
