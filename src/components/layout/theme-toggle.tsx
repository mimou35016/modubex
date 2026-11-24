"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

type Theme = "light" | "dark" | "system";

const options: Theme[] = ["light", "dark", "system"];
const subscribe = () => () => {};

export function ThemeToggle() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const t = useTranslations("header");
  const mounted = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );

  if (!mounted) return <div className="h-8 w-[152px] rounded-md border" aria-hidden="true" />;

  const active = theme === "system" ? "system" : resolvedTheme === "dark" ? "dark" : "light";

  return (
    <div
      role="group"
      aria-label={t("theme")}
      className="flex h-8 items-center rounded-md border bg-surface p-0.5"
    >
      {options.map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={active === option}
          onClick={() => setTheme(option)}
          className={cn(
            "h-7 rounded px-2 text-xs font-medium text-muted transition-colors hover:text-foreground",
            active === option && "bg-accent-soft text-accent",
          )}
        >
          {t(`themes.${option}`)}
        </button>
      ))}
    </div>
  );
}
