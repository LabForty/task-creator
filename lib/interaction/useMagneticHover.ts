"use client";
import { useEffect, useRef } from "react";

const MAX = 6; // px — barely-there pull, per the "elegant & subtle" tone

/**
 * Gentle magnetic hover for a small interactive element (e.g. a prominent CTA).
 * While the pointer is over it, the element translates toward the cursor by a
 * damped amount capped at MAX px; eases back to 0 on leave. rAF-throttled,
 * passive. Reduced-motion: no-op.
 */
export function useMagneticHover<T extends HTMLElement = HTMLButtonElement>() {
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
        const dx = e.clientX - (rect.left + rect.width / 2);
        const dy = e.clientY - (rect.top + rect.height / 2);
        const clamp = (v: number) => Math.max(-MAX, Math.min(MAX, v * 0.3));
        el.style.transform = `translate(${clamp(dx)}px, ${clamp(dy)}px)`;
      });
    };
    const onLeave = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      el.style.transform = "translate(0px, 0px)";
    };
    el.addEventListener("pointermove", onMove, { passive: true });
    el.addEventListener("pointerleave", onLeave);
    return () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);
  return ref;
}
