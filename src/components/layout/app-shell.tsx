import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { NavLink } from "@/app/(app)/_components/nav-link";
import { hasPermission, type PermissionKeys } from "@/app/(app)/_components/permissions";
import { Header } from "./header";
import { Sidebar } from "./sidebar";

export type ShellUser = {
  name: string;
  email: string;
  image?: string | null;
};

type Props = {
  children: ReactNode;
  version: string;
  currentMilestone: string;
  user: ShellUser | null;
  permissions?: PermissionKeys;
  appName?: string;
  tagline?: string;
};

const mobileLink = "shrink-0 whitespace-nowrap text-xs font-medium text-muted";
const mobileActive = "text-accent";

export async function AppShell({
  children,
  version,
  currentMilestone,
  user,
  permissions = [],
  appName,
  tagline,
}: Props) {
  const t = await getTranslations("nav");
  const canSeeUsers = hasPermission(permissions, "users.read");
  const canSeeRoles = hasPermission(permissions, "roles.read");
  const canInvite = hasPermission(permissions, "users.invite");
  const canSeeAudit = hasPermission(permissions, "audit.read");
  const canSeeLicense = hasPermission(permissions, "license.read");
  const canSeeSettings = hasPermission(permissions, "settings.read");

  return (
    <div className="flex min-h-full flex-col md:flex-row">
      <Sidebar
        version={version}
        currentMilestone={currentMilestone}
        permissions={permissions}
        appName={appName}
        tagline={tagline}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header user={user} />
        <nav
          className="flex items-center gap-4 overflow-x-auto border-b px-6 py-2 md:hidden"
          aria-label={t("foundation")}
        >
          <NavLink href="/" exact className={mobileLink} activeClassName={mobileActive}>
            {t("overview")}
          </NavLink>
          {canSeeUsers ? (
            <NavLink href="/users" className={mobileLink} activeClassName={mobileActive}>
              {t("areas.users")}
            </NavLink>
          ) : null}
          {canSeeRoles ? (
            <NavLink href="/roles" exact className={mobileLink} activeClassName={mobileActive}>
              {t("areas.roles")}
            </NavLink>
          ) : null}
          {canSeeAudit ? (
            <NavLink href="/audit" className={mobileLink} activeClassName={mobileActive}>
              {t("areas.audit")}
            </NavLink>
          ) : null}
          {canSeeLicense ? (
            <NavLink href="/license" exact className={mobileLink} activeClassName={mobileActive}>
              {t("areas.license")}
            </NavLink>
          ) : null}
          {canSeeSettings ? (
            <NavLink href="/settings" className={mobileLink} activeClassName={mobileActive}>
              {t("areas.settings")}
            </NavLink>
          ) : null}
          {canInvite ? (
            <NavLink href="/invite" exact className={mobileLink} activeClassName={mobileActive}>
              {t("invite")}
            </NavLink>
          ) : null}
        </nav>
        <main className="flex-1 px-6 py-10 lg:px-10">{children}</main>
      </div>
    </div>
  );
}
