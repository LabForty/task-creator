import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Button, ButtonLink } from "@/components/ui/Button";

describe("Button", () => {
  it("renders a button with the primary variant by default", () => {
    render(<Button>Go</Button>);
    const btn = screen.getByRole("button", { name: "Go" });
    expect(btn.className).toContain("bg-accent");
    expect(btn.className).toContain("shadow-card");
  });
  it("merges custom className without duplicating padding (cn)", () => {
    render(<Button className="px-8">Go</Button>);
    const btn = screen.getByRole("button", { name: "Go" });
    expect(btn.className).toContain("px-8");
    expect(btn.className).not.toContain("px-3.5");
  });
  it("primary uses the accessible accent-strong fill", () => {
    render(<Button>Go</Button>);
    expect(screen.getByRole("button", { name: "Go" }).className).toContain("bg-accent-strong");
  });
  it("prominent renders a sheen element and the cta-prominent host", () => {
    render(<Button variant="prominent">Finalize</Button>);
    const btn = screen.getByRole("button", { name: "Finalize" });
    expect(btn.className).toContain("cta-prominent");
    expect(btn.className).toContain("bg-accent-strong");
    expect(btn.querySelector(".cta-sheen")).not.toBeNull();
  });
  it("prominent still renders and fires its click handler (magnetic hook is inert in jsdom)", () => {
    const onClick = vi.fn();
    render(
      <Button variant="prominent" onClick={onClick}>
        Finalize
      </Button>,
    );
    const btn = screen.getByRole("button", { name: "Finalize" });
    expect(btn.className).toContain("cta-prominent");
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
  it("ghost text uses accent-link (AA accent-as-text)", () => {
    render(<Button variant="ghost">Link</Button>);
    expect(screen.getByRole("button", { name: "Link" }).className).toContain("text-accent-link");
  });
});

describe("ButtonLink", () => {
  it("renders an anchor with button styling and href", () => {
    render(<ButtonLink href="/drafts">Drafts</ButtonLink>);
    const link = screen.getByRole("link", { name: "Drafts" });
    expect(link).toHaveAttribute("href", "/drafts");
    expect(link.className).toContain("inline-flex");
  });
  it("applies the secondary variant classes", () => {
    render(<ButtonLink href="/x" variant="secondary">X</ButtonLink>);
    expect(screen.getByRole("link", { name: "X" }).className).toContain("bg-surface-muted");
  });
});
