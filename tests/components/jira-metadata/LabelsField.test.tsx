import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LabelsField } from "@/components/jira-metadata/LabelsField";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify({ labels: ["backend", "backend-v2"] }), { status: 200 }),
  );
});

describe("LabelsField", () => {
  it("renders selected labels as removable chips", () => {
    render(<LabelsField cloudId="c1" value={["backend", "v2"]} onChange={() => {}} />);
    expect(screen.getByText("backend")).toBeInTheDocument();
    expect(screen.getByText("v2")).toBeInTheDocument();
    expect(screen.getAllByLabelText(/^Remove /).length).toBe(2);
  });

  it("shows label suggestions after typing", async () => {
    const user = userEvent.setup();
    render(<LabelsField cloudId="c1" value={[]} onChange={() => {}} />);
    await user.type(screen.getByRole("combobox"), "ba");
    await waitFor(() => expect(screen.getByText("backend")).toBeInTheDocument());
  });

  it("adds a suggestion to the selection on click", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<LabelsField cloudId="c1" value={[]} onChange={onChange} />);
    await user.type(screen.getByRole("combobox"), "ba");
    await waitFor(() => screen.getByText("backend"));
    await user.click(screen.getByText("backend"));
    expect(onChange).toHaveBeenCalledWith(["backend"]);
  });

  it("shows a Create '<typed>' row when no exact match exists", async () => {
    const user = userEvent.setup();
    render(<LabelsField cloudId="c1" value={[]} onChange={() => {}} />);
    await user.type(screen.getByRole("combobox"), "newlabel");
    await waitFor(() => expect(screen.getByText(/Create "newlabel"/)).toBeInTheDocument());
  });

  it("disables Create when the typed value matches an existing label (case-insensitive)", async () => {
    const user = userEvent.setup();
    render(<LabelsField cloudId="c1" value={[]} onChange={() => {}} />);
    await user.type(screen.getByRole("combobox"), "Backend");
    await waitFor(() => screen.getByText("backend"));
    expect(screen.queryByText(/Create "Backend"/)).toBeNull();
  });

  it("removes a chip via the remove button", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<LabelsField cloudId="c1" value={["backend"]} onChange={onChange} />);
    await user.click(screen.getByLabelText("Remove backend"));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("shows an error and a retry button when the labels endpoint fails", async () => {
    fetchMock.mockResolvedValue(new Response("", { status: 500 }));
    const user = userEvent.setup();
    render(<LabelsField cloudId="c1" value={[]} onChange={() => {}} />);
    await user.type(screen.getByRole("combobox"), "ba");
    await waitFor(() => expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument());
  });
});
