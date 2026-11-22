import type { ReactNode } from "react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { LocaleSwitcher } from "@/components/layout/locale-switcher";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Card } from "@/components/ui/card";

export default async function AuthLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations("auth");
  const app = await getTranslations("app");

  return (
    <div className="flex min-h-full flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
        <Link href="/" className="text-xs font-medium text-muted transition-colors hover:text-accent">
          ← {t("common.backToOverview")}
        </Link>
        <div className="flex items-center gap-3">
          <LocaleSwitcher />
          <ThemeToggle />
        </div>
      </div>
      <main className="flex flex-1 items-center justify-center px-4 py-8 sm:py-12">
        <div className="w-full max-w-md">
          <div className="mb-6 text-center">
            <div className="mx-auto flex size-10 items-center justify-center rounded-md bg-accent font-mono text-xs font-bold text-accent-foreground">
              MB
            </div>
            <p className="mt-3 text-sm font-semibold tracking-tight">{app("name")}</p>
          </div>
          <Card className="p-6 shadow-sm sm:p-8">{children}</Card>
        </div>
      </main>
    </div>
  );
}
