import "@testing-library/jest-dom/vitest";
import { MotionGlobalConfig } from "motion/react";

// jsdom 25 + Vitest 4 stopped exposing window.localStorage/sessionStorage by
// default (Node now has an experimental localStorage gated behind
// --localstorage-file). Tests that exercise the draft autosave layer rely on
// these APIs, so wire up a tiny in-memory polyfill.
class MemoryStorage implements Storage {
  private store = new Map<string, string>();
  get length(): number {
    return this.store.size;
  }
  clear(): void {
    this.store.clear();
  }
  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
}

if (typeof window !== "undefined") {
  const w = window as Window & { localStorage?: Storage; sessionStorage?: Storage };
  if (!w.localStorage) {
    Object.defineProperty(window, "localStorage", {
      value: new MemoryStorage(),
      configurable: true,
    });
  }
  if (!w.sessionStorage) {
    Object.defineProperty(window, "sessionStorage", {
      value: new MemoryStorage(),
      configurable: true,
    });
  }
}

// jsdom doesn't implement matchMedia; reduced-motion guards call it. Stub it to
// "no preference" so hooks run their normal (animated) path in tests.
if (typeof window !== "undefined" && !window.matchMedia) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

// ProseMirror/TipTap scrolls the current selection into view after text input.
// jsdom does not implement selection geometry on Range/Text nodes, so provide
// stable zero-sized rectangles for editor component tests.
if (typeof window !== "undefined") {
  const rect = () => new window.DOMRect(0, 0, 0, 0);
  const rects = () => ({
    length: 0,
    item: () => null,
    [Symbol.iterator]: function* iterator() {},
  }) as DOMRectList;
  const protos: object[] = [];
  if (window.Range) protos.push(window.Range.prototype);
  if (window.Text) protos.push(window.Text.prototype);
  for (const proto of protos) {
    if (!("getBoundingClientRect" in proto)) {
      Object.defineProperty(proto, "getBoundingClientRect", {
        configurable: true,
        value: rect,
      });
    }
    if (!("getClientRects" in proto)) {
      Object.defineProperty(proto, "getClientRects", {
        configurable: true,
        value: rects,
      });
    }
  }
}

// Framer Motion in jsdom: skip animations so AnimatePresence doesn't delay
// unmounts behind rAF-driven exit animations — tests assert final states.
MotionGlobalConfig.skipAnimations = true;
