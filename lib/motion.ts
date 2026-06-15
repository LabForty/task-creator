import type { Transition, Variants } from "motion/react";

// ─── Motion vocabulary ──────────────────────────────────────────────
// Every animated component imports from here; nobody hand-rolls values.
// Division of labor: Framer handles entrances, exits, and layout reflow.
// CSS keeps handling hover/press micro-states (transition-all duration-150
// ease-hig idiom in components).

// Lively-but-professional spring: one subtle overshoot, ~300ms settle.
export const SPRING: Transition = { type: "spring", stiffness: 500, damping: 30, mass: 0.9 };

// Matches the CSS `ease-hig` curve for fast non-spring moments (exits, menus).
export const EASE_HIG = [0.25, 0.1, 0.25, 1] as const;
export const DUR_FAST = 0.15;

const STAGGER_STEP = 0.04;
const STAGGER_CAP = 8;

// First STAGGER_CAP items stagger in; the rest land together at the cap
// delay so a 50-item list doesn't take seconds to finish entering.
export function staggerDelay(index: number): number {
  return Math.min(index, STAGGER_CAP) * STAGGER_STEP;
}

// List/card entrance: fade + rise with spring (staggered via custom={index});
// exit shrinks and fades fast so deletes feel snappy.
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 14 },
  visible: (index: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: { ...SPRING, delay: staggerDelay(index) },
  }),
  exit: { opacity: 0, scale: 0.95, transition: { duration: DUR_FAST, ease: EASE_HIG } },
};

// Menus and popovers: quick scale-in from 95%, faster scale-out.
export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: { opacity: 1, scale: 1, transition: { duration: DUR_FAST, ease: EASE_HIG } },
  exit: { opacity: 0, scale: 0.95, transition: { duration: 0.1, ease: EASE_HIG } },
};

// Success beat: a quick pop that settles. Used on export/finalize success.
export const celebrate: Variants = {
  hidden: { opacity: 0, scale: 0.9 },
  visible: {
    opacity: 1,
    scale: [0.9, 1.04, 1],
    transition: { duration: 0.4, ease: EASE_HIG, times: [0, 0.6, 1] },
  },
};

// Single↔epic / view transition: gentle fade+rise in, fade+rise out the
// opposite way. Pair with AnimatePresence mode="wait".
export const crossFade: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.2, ease: EASE_HIG } },
  exit: { opacity: 0, y: -8, transition: { duration: DUR_FAST, ease: EASE_HIG } },
};
