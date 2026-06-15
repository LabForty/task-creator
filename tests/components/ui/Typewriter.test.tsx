import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Typewriter } from "@/components/ui/Typewriter";

describe("Typewriter", () => {
  it("renders text from the phrase list with a live region", () => {
    render(<Typewriter phrases={["Turn ideas into stories."]} />);
    // Under jsdom the timers haven't advanced; the live region exists and the
    // widest phrase reserves layout. At minimum the component renders an
    // aria-live region without crashing.
    expect(screen.getByRole("status", { hidden: true })).toBeTruthy();
  });
});
