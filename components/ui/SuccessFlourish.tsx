import { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

/**
 * One-shot success flourish — a soft expanding accent ring + a few sparks, ~600ms.
 * Mount it (e.g. keyed on the success event) over a success surface. Decorative,
 * aria-hidden, non-interactive. Reduced-motion: the global rule neutralizes the
 * animations (no burst); pair with the `celebrate` motion beat on the content.
 */
export function SuccessFlourish({ className = "", ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden
      className={cn("success-flourish pointer-events-none absolute inset-0 overflow-visible", className)}
      {...rest}
    >
      <span className="sf-ring" />
      <span className="sf-spark sf-spark--1" />
      <span className="sf-spark sf-spark--2" />
      <span className="sf-spark sf-spark--3" />
    </div>
  );
}
