"use client";
import { useEffect, useRef } from "react";

/**
 * Cursor-tracking accent glow for a surface. Attach the returned ref to the
 * element and give it the `.spotlight` class (globals.css): on pointer movement
 * it sets `--spot-x`/`--spot-y` (percent) which the `.spotlight::before` radial
 * follows. rAF-throttled, passive listener. Reduced-motion: no tracking (glow
 * stays centered). Generalizes the sign-in card spotlight.
 */
export function useSpotlight<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const mq = typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-reduced-motion: reduce)")
      : null;
    if (mq?.matches) return;
    let raf = 0;
    const onMove = (e: PointerEvent) => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const rect = el.getBoundingClientRect();
        const w = rect.width || 1;
        const h = rect.height || 1;
        el.style.setProperty("--spot-x", `${((e.clientX - rect.left) / w) * 100}%`);
        el.style.setProperty("--spot-y", `${((e.clientY - rect.top) / h) * 100}%`);
      });
    };
    el.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      el.removeEventListener("pointermove", onMove);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);
  return ref;
}
