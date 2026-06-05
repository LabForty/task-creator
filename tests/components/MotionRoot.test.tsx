import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MotionRoot } from "@/components/MotionRoot";

describe("MotionRoot", () => {
  it("renders its children (motion policy wrapper is transparent)", () => {
    render(
      <MotionRoot>
        <p>hello</p>
      </MotionRoot>,
    );
    expect(screen.getByText("hello")).toBeInTheDocument();
  });
});
