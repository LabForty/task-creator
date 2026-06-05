"use client";

import { MotionConfig } from "motion/react";

// App-wide motion policy: reducedMotion="user" disables transform/layout
// animations for users with prefers-reduced-motion while keeping opacity
// transitions. app/layout.tsx is a server component, so this thin client
// wrapper exists solely to host MotionConfig at the root.
export function MotionRoot({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
