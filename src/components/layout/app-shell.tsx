import type { ReactNode } from "react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Header } from "./header";
import { Sidebar } from "./sidebar";

type Props = { children: ReactNode; version: string; currentMilestone: string };

export async function AppShell({ children, version, currentMilestone }: Props) {
  const t = await getTranslations("nav");

  return (
    <div className="flex min-h-full flex-col md:flex-row">
      <Sidebar version={version} currentMilestone={currentMilestone} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header />
        <nav className="flex items-center gap-2 border-b px-6 py-2 text-xs md:hidden" aria-label={t("foundation")}>
          <Link href="/" aria-current="page" className="font-medium text-accent">
            {t("overview")}
          </Link>
        </nav>
        <main className="flex-1 px-6 py-10 lg:px-10">{children}</main>
      </div>
    </div>
  );
}
