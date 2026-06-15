import { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

/**
 * Decorative, aria-hidden wireframe that self-draws on a loop (globals.css
 * `.ghost-diagram`). A placeholder hinting at the diagrams "Create diagrams"
 * will produce. Reduced-motion: renders the completed static wireframe.
 */
export function GhostDiagram({ className = "", ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div aria-hidden className={cn("ghost-diagram text-ink-quaternary", className)} {...rest}>
      <svg viewBox="0 0 200 120" width="100%" height="100%" fill="none" aria-hidden>
        <g stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
          <rect className="gd-stroke" x="14" y="20" width="52" height="28" rx="6" />
          <rect className="gd-stroke" x="134" y="20" width="52" height="28" rx="6" />
          <rect className="gd-stroke" x="74" y="74" width="52" height="28" rx="6" />
          <path className="gd-stroke" d="M66 34 H100 V74" />
          <path className="gd-stroke" d="M134 34 H100" />
        </g>
      </svg>
    </div>
  );
}
