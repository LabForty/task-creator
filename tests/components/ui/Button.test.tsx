import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
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
