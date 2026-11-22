"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { setLocale } from "@/core/i18n/actions";
import { locales } from "@/core/i18n/locales";

export function LocaleSwitcher() {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations("header");
  const [pending, startTransition] = useTransition();

  return (
    <label className="flex items-center gap-2 text-xs text-muted">
      <span className="sr-only">{t("language")}</span>
      <select
        id="locale"
        name="locale"
        aria-label={t("language")}
        value={locale}
        disabled={pending}
        onChange={(event) => {
          const next = event.target.value;
          startTransition(async () => {
            await setLocale(next);
            router.refresh();
          });
        }}
        className="h-8 rounded-md border bg-surface px-2 text-xs font-medium text-foreground disabled:opacity-50"
      >
        {locales.map((item) => (
          <option key={item.code} value={item.code}>
            {item.label}
          </option>
        ))}
      </select>
    </label>
  );
}
