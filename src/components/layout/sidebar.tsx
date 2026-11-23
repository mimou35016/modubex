import { getTranslations } from "next-intl/server";
import {
  BadgeCheck,
  Blocks,
  LayoutDashboard,
  MailPlus,
  ScrollText,
  Settings,
  Shield,
  UserRound,
  Users,
} from "lucide-react";
import { NavLink } from "@/app/(app)/_components/nav-link";
import { hasPermission, type PermissionKeys } from "@/app/(app)/_components/permissions";

type Props = {
  version: string;
  currentMilestone: string;
  permissions?: PermissionKeys;
  appName?: string;
  tagline?: string;
};

const linkClass =
  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-accent-soft hover:text-foreground";
const activeClass = "bg-accent-soft text-accent";
const subLinkClass =
  "flex items-center gap-2 rounded-md ps-9 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-accent-soft hover:text-foreground";

export async function Sidebar({
  version,
  currentMilestone,
  permissions = [],
  appName,
  tagline,
}: Props) {
  const t = await getTranslations("nav");
  const tModules = await getTranslations("modules");
  const planned = [{ icon: UserRound, label: t("areas.profile"), milestone: "M5" }];
  const canSeeModules = hasPermission(permissions, "modules.read");
  const canSeeUsers = hasPermission(permissions, "users.read");
  const canSeeRoles = hasPermission(permissions, "roles.read");
  const canInvite = hasPermission(permissions, "users.invite");
  const canSeeAudit = hasPermission(permissions, "audit.read");
  const canSeeLicense = hasPermission(permissions, "license.read");
  const canSeeSettings = hasPermission(permissions, "settings.read");

  return (
    <aside className="hidden w-64 shrink-0 flex-col border-e bg-surface md:flex">
      <div className="flex h-16 items-center gap-3 border-b px-6">
        <div className="flex size-8 items-center justify-center rounded-md bg-accent font-mono text-xs font-bold text-accent-foreground">
          MB
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold tracking-tight">{appName ?? t("appName")}</p>
          <p className="truncate font-mono text-[10px] text-muted">{tagline ?? t("foundation")}</p>
        </div>
      </div>

      <nav className="flex-1 px-3 py-6" aria-label={t("foundation")}>
        <p className="px-3 pb-2 font-mono text-[10px] tracking-wide text-muted">{t("overview")}</p>
        <NavLink href="/" exact className={linkClass} activeClassName={activeClass}>
          <LayoutDashboard className="size-4" aria-hidden="true" />
          {t("overview")}
        </NavLink>

        {canInvite ? (
          <NavLink
            href="/invite"
            exact
            className={`mt-1 ${linkClass}`}
            activeClassName={activeClass}
          >
            <MailPlus className="size-4" aria-hidden="true" />
            {t("invite")}
          </NavLink>
        ) : null}

        {canSeeModules ||
        canSeeUsers ||
        canSeeRoles ||
        canSeeAudit ||
        canSeeLicense ||
        canSeeSettings ? (
          <>
            <p className="mt-8 px-3 pb-2 font-mono text-[10px] tracking-wide text-muted">
              {t("manage")}
            </p>
            {canSeeModules ? (
              <NavLink href="/modules" className={linkClass} activeClassName={activeClass}>
                <Blocks className="size-4" aria-hidden="true" />
                {tModules("navLabel")}
              </NavLink>
            ) : null}
            {canSeeUsers ? (
              <NavLink href="/users" className={linkClass} activeClassName={activeClass}>
                <Users className="size-4" aria-hidden="true" />
                {t("areas.users")}
              </NavLink>
            ) : null}
            {canSeeRoles ? (
              <NavLink
                href="/roles"
                exact
                className={`mt-1 ${subLinkClass}`}
                activeClassName={activeClass}
              >
                <Shield className="size-3.5" aria-hidden="true" />
                {t("areas.roles")}
              </NavLink>
            ) : null}
            {canSeeAudit ? (
              <NavLink href="/audit" className={`mt-1 ${linkClass}`} activeClassName={activeClass}>
                <ScrollText className="size-4" aria-hidden="true" />
                {t("areas.audit")}
              </NavLink>
            ) : null}
            {canSeeLicense ? (
              <NavLink
                href="/license"
                exact
                className={`mt-1 ${linkClass}`}
                activeClassName={activeClass}
              >
                <BadgeCheck className="size-4" aria-hidden="true" />
                {t("areas.license")}
              </NavLink>
            ) : null}
            {canSeeSettings ? (
              <NavLink
                href="/settings"
                className={`mt-1 ${linkClass}`}
                activeClassName={activeClass}
              >
                <Settings className="size-4" aria-hidden="true" />
                {t("areas.settings")}
              </NavLink>
            ) : null}
          </>
        ) : null}

        <p className="mt-8 px-3 pb-2 font-mono text-[10px] tracking-wide text-muted">
          {t("planned")}
        </p>
        <ul className="space-y-1">
          {planned.map((item) => (
            <li
              key={item.milestone + item.label}
              className="flex items-center gap-3 px-3 py-2 text-sm text-muted"
              title={t("comingLater")}
            >
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
