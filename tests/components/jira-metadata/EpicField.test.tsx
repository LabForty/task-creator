import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EpicField } from "@/components/jira-metadata/EpicField";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify({ epics: [{ key: "EPIC-9", title: "Auth rework" }] }), { status: 200 }),
  );
});

describe("EpicField", () => {
  it("lists open epics for the project", async () => {
    render(<EpicField cloudId="c1" projectKey="PROJ" value={undefined} onChange={() => {}} />);
    await waitFor(() => expect(screen.getByText("Auth rework")).toBeInTheDocument());
  });

  it("selects an existing epic", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<EpicField cloudId="c1" projectKey="PROJ" value={undefined} onChange={onChange} />);
    await waitFor(() => screen.getByText("Auth rework"));
    await user.click(screen.getByText("Auth rework"));
    expect(onChange).toHaveBeenCalledWith({ kind: "existing", key: "EPIC-9", title: "Auth rework" });
  });

  it("opens an inline create row and emits kind:new on commit", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<EpicField cloudId="c1" projectKey="PROJ" value={undefined} onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: /create new epic/i }));
    await user.type(screen.getByLabelText(/new epic title/i), "Reporting v2");
    await user.click(screen.getByRole("button", { name: /^create$/i }));
    expect(onChange).toHaveBeenCalledWith({ kind: "new", title: "Reporting v2" });
  });

  it("shows the selected existing epic as the picked value", () => {
    render(<EpicField cloudId="c1" projectKey="PROJ" value={{ kind: "existing", key: "EPIC-9", title: "Auth rework" }} onChange={() => {}} />);
    expect(screen.getByText(/EPIC-9 — Auth rework/)).toBeInTheDocument();
  });

  it("shows the selected new-epic title as a draft chip", () => {
    render(<EpicField cloudId="c1" projectKey="PROJ" value={{ kind: "new", title: "Reporting v2" }} onChange={() => {}} />);
    expect(screen.getByText(/New: Reporting v2/)).toBeInTheDocument();
  });
});
