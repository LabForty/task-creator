import { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type Tone = "danger" | "warning" | "success" | "accent";

// Mirrors the sign-in error chip language (border-danger/30 bg-danger/5 …).
const tones: Record<Tone, string> = {
  danger: "border-danger/30 bg-danger/5 text-danger-strong",
  warning: "border-warning/30 bg-warning/5 text-warning",
  success: "border-success/30 bg-success/5 text-success",
  accent: "border-accent/30 bg-accent-tint text-accent",
};

type Props = HTMLAttributes<HTMLDivElement> & { tone?: Tone };

export function Alert({ tone = "danger", className = "", children, ...rest }: Props) {
  return (
    <div
      role="alert"
      className={cn(
        "rounded-md border px-4 py-2.5 text-hig-footnote",
        tones[tone],
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}
