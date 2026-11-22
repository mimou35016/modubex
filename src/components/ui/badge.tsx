import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Props = HTMLAttributes<HTMLSpanElement> & { tone?: "accent" | "muted" };

export function Badge({ className, tone = "muted", ...props }: Props) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 font-mono text-[11px] font-medium",
        tone === "accent" ? "bg-accent-soft text-accent" : "bg-accent-soft/60 text-muted",
        className,
      )}
      {...props}
    />
  );
}
