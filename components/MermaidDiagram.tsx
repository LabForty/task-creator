"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useIsDark } from "@/lib/useIsDark";

type Props = {
  source: string;
  /** Called when parse/render fails; receives the actionable message. */
  onError?: (message: string) => void;
};

/**
 * Lazy-loaded Mermaid renderer. The mermaid package is ~700 KB, so the
 * import happens on first mount via `await import("mermaid")`. The whole
 * v1 editor route stays unaffected because nothing imports this file.
 */
export function MermaidDiagram({ source, onError }: Props) {
  const id = useId().replace(/:/g, "_"); // mermaid ids cannot contain colons
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>("");
  const [renderError, setRenderError] = useState<string | null>(null);
  const isDark = useIsDark();

  useEffect(() => {
    let cancelled = false;
    async function go() {
      try {
        const mod = await import("mermaid");
        const mermaid = mod.default;
        // Re-initialize on every render so a theme flip is picked up. mermaid
        // treats initialize() as idempotent — repeated calls just update opts.
        mermaid.initialize({
          startOnLoad: false,
          theme: isDark ? "dark" : "default",
          securityLevel: "strict",
        });
        // Validate first so we report syntax errors clearly.
        await mermaid.parse(source);
        const result = await mermaid.render(`md-${id}`, source);
        if (cancelled) return;
        setSvg(result.svg);
        setRenderError(null);
      } catch (e) {
        if (cancelled) return;
        const message = e instanceof Error ? e.message : String(e);
        setRenderError(message);
        onError?.(message);
      }
    }
    if (source.trim()) {
      go();
    } else {
      // Empty source: clear any prior render. setState here is intentional;
      // this effect is the integration point with the external mermaid module.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSvg("");
    }
    return () => {
      cancelled = true;
    };
  }, [source, id, onError, isDark]);

  if (renderError) {
    return (
      <div className="rounded-lg border border-danger bg-surface-muted p-4" role="alert">
        <p className="text-danger text-hig-footnote font-medium mb-1">Mermaid syntax error</p>
        <pre className="text-hig-caption whitespace-pre-wrap text-ink-secondary">{renderError}</pre>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      // Mermaid emits trusted SVG (securityLevel: strict sandboxes the input).
      dangerouslySetInnerHTML={{ __html: svg }}
      className="mermaid-host overflow-auto"
    />
  );
}
