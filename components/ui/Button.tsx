"use client";

import { ButtonHTMLAttributes, forwardRef } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
};

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
  primary:
    "bg-accent text-white shadow-[0_1px_2px_rgba(0,0,0,0.06)] " +
    "hover:bg-accent-hover active:bg-accent-pressed",
  secondary:
    "bg-surface-muted text-ink border border-rule " +
    "hover:bg-surface-inset",
  ghost:
    "bg-transparent text-accent hover:bg-accent-tint",
  danger:
    "bg-danger text-white hover:opacity-90",
};

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = "primary", size = "md", className = "", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}
      {...rest}
    />
  );
});
