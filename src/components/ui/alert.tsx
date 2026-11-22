import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Props = HTMLAttributes<HTMLDivElement> & {
  tone?: "error" | "success" | "info";
};

export function Alert({ className, tone = "info", role, ...props }: Props) {
  return (
    <div
      role={role ?? (tone === "error" ? "alert" : "status")}
      className={cn(
        "rounded-md border px-3 py-2 text-sm leading-6",
        tone === "error" && "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300",
        tone === "success" && "border-accent/40 bg-accent-soft text-accent",
        tone === "info" && "bg-accent-soft/60 text-foreground",
        className,
      )}
      {...props}
    />
  );
}
