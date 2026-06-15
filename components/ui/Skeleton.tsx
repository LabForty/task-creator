import { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

/**
 * Shimmer placeholder block. Replaces static `animate-pulse` skeletons. The
 * sweep is a CSS animation (globals.css `.hig-shimmer`) that reduced-motion
 * neutralises to a flat tint. Pass sizing/shape via className (e.g. "h-4 w-44").
 */
export function Skeleton({ className = "", ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden className={cn("hig-shimmer rounded", className)} {...rest} />;
}
