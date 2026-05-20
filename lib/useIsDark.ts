"use client";

import { useEffect, useState } from "react";

// Tracks whether <html> has the `dark` class. ThemeToggle flips that class and
// dispatches a `themechange` event; we also fall back to a MutationObserver so
// any other source that toggles the class still propagates.
export function useIsDark(): boolean {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const read = () => setIsDark(document.documentElement.classList.contains("dark"));
    read();

    const onEvent = () => read();
    window.addEventListener("themechange", onEvent);

    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

    return () => {
      window.removeEventListener("themechange", onEvent);
      observer.disconnect();
    };
  }, []);

  return isDark;
}
