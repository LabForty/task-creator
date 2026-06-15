import { HTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/cn";

type Tone = "solid" | "glass" | "glass-strong";

const tones: Record<Tone, string> = {
  solid: "hig-card",
  glass: "hig-glass",
  "glass-strong": "hig-glass-strong",
};

type Props = HTMLAttributes<HTMLDivElement> & { tone?: Tone };

/**
 * Surface primitive. `solid` = opaque hig-card (dense data). `glass` = the
 * sign-in card treatment (spacious / light-touch). `glass-strong` = higher
 * opacity for dense working surfaces that still want the glass language.
 */
export const Card = forwardRef<HTMLDivElement, Props>(function Card(
  { tone = "solid", className = "", ...rest },
  ref,
) {
  return <div ref={ref} className={cn(tones[tone], className)} {...rest} />;
});
