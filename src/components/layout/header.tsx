"use client";

import { useTranslations } from "next-intl";
import { Breadcrumbs } from "./breadcrumbs";
import { LocaleSwitcher } from "./locale-switcher";
import { ThemeToggle } from "./theme-toggle";

export function Header() {
  const t = useTranslations("header");

  return (
    <header className="flex min-h-16 flex-wrap items-center justify-between gap-3 border-b bg-surface px-6 py-3 lg:px-10">
      <Breadcrumbs label={t("breadcrumb")} />
      <div className="flex items-center gap-3">
        <LocaleSwitcher />
        <ThemeToggle />
      </div>
    </header>
  );
}
