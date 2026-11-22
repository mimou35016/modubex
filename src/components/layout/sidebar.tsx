import Link from "next/link";
import { getTranslations } from "next-intl/server";
import {
  BadgeCheck,
  Blocks,
  LayoutDashboard,
  ScrollText,
  Settings,
  UserRound,
  Users,
} from "lucide-react";

type Props = { version: string; currentMilestone: string };

export async function Sidebar({ version, currentMilestone }: Props) {
  const t = await getTranslations("nav");
  const planned = [
    { icon: Blocks, label: t("areas.store"), milestone: "M4" },
    { icon: Users, label: t("areas.users"), milestone: "M2" },
    { icon: BadgeCheck, label: t("areas.license"), milestone: "M3" },
    { icon: ScrollText, label: t("areas.audit"), milestone: "M2" },
    { icon: Settings, label: t("areas.settings"), milestone: "M3" },
    { icon: UserRound, label: t("areas.profile"), milestone: "M5" },
  ];

  return (
    <aside className="hidden w-64 shrink-0 flex-col border-e bg-surface md:flex">
      <div className="flex h-16 items-center gap-3 border-b px-6">
        <div className="flex size-8 items-center justify-center rounded-md bg-accent font-mono text-xs font-bold text-accent-foreground">
          MB
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold tracking-tight">{t("appName")}</p>
          <p className="truncate font-mono text-[10px] text-muted">{t("foundation")}</p>
        </div>
      </div>

      <nav className="flex-1 px-3 py-6" aria-label={t("foundation")}>
        <p className="px-3 pb-2 font-mono text-[10px] tracking-wide text-muted">
          {t("overview")}
        </p>
        <Link
          href="/"
          aria-current="page"
          className="flex items-center gap-3 rounded-md bg-accent-soft px-3 py-2 text-sm font-medium text-accent"
        >
          <LayoutDashboard className="size-4" aria-hidden="true" />
          {t("overview")}
        </Link>

        <p className="mt-8 px-3 pb-2 font-mono text-[10px] tracking-wide text-muted">
          {t("planned")}
        </p>
        <ul className="space-y-1">
          {planned.map((item) => (
            <li key={item.milestone + item.label} className="flex items-center gap-3 px-3 py-2 text-sm text-muted">
              <item.icon className="size-4 opacity-70" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              <span className="font-mono text-[10px] opacity-70">{item.milestone}</span>
            </li>
          ))}
        </ul>
      </nav>

      <div className="border-t px-6 py-4 font-mono text-[10px] text-muted">
        v{version} · {currentMilestone}
      </div>
    </aside>
  );
}
