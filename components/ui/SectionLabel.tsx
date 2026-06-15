import { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

/** Uppercase tracked eyebrow label (the `.hig-section-label` idiom). */
export function SectionLabel({ className = "", ...rest }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("hig-section-label", className)} {...rest} />;
}
