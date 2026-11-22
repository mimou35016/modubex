import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { cn } from "@/lib/utils";

type Props = {
  pathname: string;
  params: Record<string, string | undefined>;
  page: number;
  totalPages: number;
};

function hrefFor(pathname: string, params: Record<string, string | undefined>, page: number) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) query.set(key, value);
  }
  query.set("page", String(page));
  return `${pathname}?${query.toString()}`;
}

export async function Pagination({ pathname, params, page, totalPages }: Props) {
  const t = await getTranslations("common");

  if (totalPages <= 1) return null;

  const base =
    "inline-flex h-8 items-center justify-center gap-1 rounded-md border px-3 text-xs font-medium text-muted transition-colors hover:bg-accent-soft hover:text-foreground";
  const disabled = "pointer-events-none opacity-40";

  return (
    <nav
      className="flex flex-wrap items-center justify-between gap-3 border-t px-6 py-4"
      aria-label={t("paginationLabel")}
    >
      <span className="text-xs text-muted">{t("page", { page, total: totalPages })}</span>
      <div className="flex items-center gap-2">
        {page > 1 ? (
          <Link href={hrefFor(pathname, params, page - 1)} className={base} rel="prev">
            <ChevronLeft className="size-3.5" aria-hidden="true" />
            {t("previous")}
          </Link>
        ) : (
          <span className={cn(base, disabled)} aria-hidden="true">
            <ChevronLeft className="size-3.5" />
            {t("previous")}
          </span>
        )}
        {page < totalPages ? (
          <Link href={hrefFor(pathname, params, page + 1)} className={base} rel="next">
            {t("next")}
            <ChevronRight className="size-3.5" aria-hidden="true" />
          </Link>
        ) : (
          <span className={cn(base, disabled)} aria-hidden="true">
            {t("next")}
            <ChevronRight className="size-3.5" />
          </span>
        )}
      </div>
    </nav>
  );
}
