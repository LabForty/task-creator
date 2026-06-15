"use client";

import { AnchorHTMLAttributes, ButtonHTMLAttributes, forwardRef } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "success" | "warning";
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
  primary: "bg-accent text-white shadow-card hover:bg-accent-hover active:bg-accent-pressed",
  secondary: "bg-surface-muted text-ink border border-rule hover:bg-surface-inset",
  ghost: "bg-transparent text-accent hover:bg-accent-tint",
  danger: "bg-danger text-white hover:opacity-90",
  success: "bg-success text-white hover:opacity-90",
  warning: "bg-warning text-white hover:opacity-90",
};

export function buttonClasses(variant: Variant = "primary", size: Size = "md", className = "") {
  return cn(base, sizes[size], variants[variant], className);
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", className = "", ...rest },
  ref,
) {
  return <button ref={ref} className={buttonClasses(variant, size, className)} {...rest} />;
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
  { href, variant = "secondary", size = "md", className = "", ...rest },
  ref,
) {
  return <Link ref={ref} href={href} className={buttonClasses(variant, size, className)} {...rest} />;
});
