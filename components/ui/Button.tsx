"use client";

import { AnchorHTMLAttributes, ButtonHTMLAttributes, ForwardedRef, forwardRef, Ref } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { useMagneticHover } from "@/lib/interaction/useMagneticHover";

/**
 * Combine several refs into a single callback ref. Each ref is invoked with the
 * node (or null on unmount); handles function refs, `{ current }` object refs,
 * and nullish refs. Does NOT read `.current` at render time.
 */
function mergeRefs<T>(...refs: Array<Ref<T> | undefined>) {
  return (node: T | null) => {
    for (const ref of refs) {
      if (typeof ref === "function") {
        ref(node);
      } else if (ref) {
        (ref as { current: T | null }).current = node;
      }
    }
  };
}

type Variant = "primary" | "secondary" | "ghost" | "danger" | "success" | "warning" | "prominent";
type Size = "sm" | "md" | "lg";

// HIG: corner-rounded "pill-shape-lite", subtle elevation on primary, no chrome on secondary.
const base =
  "inline-flex items-center justify-center gap-1.5 rounded-md font-medium " +
  "transition-all duration-150 ease-hig " +
  "disabled:opacity-40 disabled:pointer-events-none " +
  "focus-visible:outline-none focus-visible:shadow-focus " +
  "active:scale-[0.985]";

const sizes: Record<Size, string> = {
  sm: "h-7 px-2.5 text-hig-footnote",
  md: "h-9 px-3.5 text-hig-subhead",
  lg: "h-11 px-5 text-hig-body",
};

const variants: Record<Variant, string> = {
  primary: "bg-accent-strong text-white shadow-card hover:bg-accent active:bg-accent-pressed",
  secondary: "bg-surface-muted text-ink border border-rule hover:bg-surface-inset",
  ghost: "bg-transparent text-accent-link hover:bg-accent-tint",
  danger: "bg-danger text-white hover:opacity-90",
  success: "bg-success text-white hover:opacity-90",
  warning: "bg-warning text-white hover:opacity-90",
  // Marquee CTA: accent-strong fill, white label, hover sheen (see globals.css).
  // `transition-transform` keeps the magnetic-hover pull/reset eased smoothly; the
  // explicit property list also preserves the eased hover background-color/shadow
  // (so adding transform easing doesn't override the base `transition-all`).
  prominent:
    "cta-prominent relative overflow-hidden bg-accent-strong text-white shadow-card hover:bg-accent active:bg-accent-pressed " +
    "transition-transform transition-[transform,background-color,box-shadow]",
};

export function buttonClasses(variant: Variant = "primary", size: Size = "md", className = "") {
  return cn(base, sizes[size], variants[variant], className);
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", className = "", children, ...rest },
  ref,
) {
  // Hook is called unconditionally (no-op until/unless its ref is attached to a
  // node). Only prominent CTAs get the magnetic pull, by merging it into the ref.
  const magneticRef = useMagneticHover<HTMLButtonElement>();
  const composedRef: ForwardedRef<HTMLButtonElement> =
    variant === "prominent" ? mergeRefs(ref, magneticRef) : ref;
  return (
    <button ref={composedRef} className={buttonClasses(variant, size, className)} {...rest}>
      {children}
      {variant === "prominent" && <span aria-hidden className="cta-sheen" />}
    </button>
  );
});

type ButtonLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string;
  variant?: Variant;
  size?: Size;
};

/**
 * A link rendered with button styling. Replaces the hand-rolled
 * "link styled as a button" className strings that were duplicated across
 * the header and drafts surfaces.
 */
export const ButtonLink = forwardRef<HTMLAnchorElement, ButtonLinkProps>(function ButtonLink(
  { href, variant = "secondary", size = "md", className = "", children, ...rest },
  ref,
) {
  // Symmetric with Button: magnetic pull only on prominent link-CTAs.
  const magneticRef = useMagneticHover<HTMLAnchorElement>();
  const composedRef: ForwardedRef<HTMLAnchorElement> =
    variant === "prominent" ? mergeRefs(ref, magneticRef) : ref;
  return (
    <Link ref={composedRef} href={href} className={buttonClasses(variant, size, className)} {...rest}>
      {children}
      {variant === "prominent" && <span aria-hidden className="cta-sheen" />}
    </Link>
  );
});
