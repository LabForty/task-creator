import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { JiraMetadata } from "@/components/jira-metadata/JiraMetadata";
import { EMPTY_METADATA } from "@/lib/jira/metadata";

vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));

describe("JiraMetadata", () => {
  it("renders all five field groups", () => {
    render(<JiraMetadata cloudId="c1" projectKey="PROJ" value={EMPTY_METADATA} onChange={() => {}} />);
    expect(screen.getByText("Labels")).toBeInTheDocument();
    expect(screen.getByText("Linked issues")).toBeInTheDocument();
    expect(screen.getByText("Attachments")).toBeInTheDocument();
    expect(screen.getByText("Flag")).toBeInTheDocument();
    expect(screen.getByText("Epic")).toBeInTheDocument();
  });

  it("renders a muted hint when no project is selected", () => {
    render(<JiraMetadata cloudId={null} projectKey={null} value={EMPTY_METADATA} onChange={() => {}} />);
    expect(screen.queryByText("Labels")).toBeNull();
    expect(screen.getByText(/pick a project/i)).toBeInTheDocument();
  });
});
