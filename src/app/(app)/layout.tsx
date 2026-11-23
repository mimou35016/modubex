import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { requirePagePermission } from "@/core/auth/dal";
import { getCurrentAvatar } from "@/core/files/service";
import { getSettingValue } from "@/core/settings/service";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const { session, permissionKeys } = await requirePagePermission("app.access");

  const [currentAvatar, appName, tagline] = await Promise.all([
    getCurrentAvatar(session.user.id),
    getSettingValue("site.name"),
    getSettingValue("site.tagline"),
  ]);
  const user = {
    name: session.user.name || session.user.email || "",
    email: session.user.email || "",
    image: currentAvatar ? `/api/files/${currentAvatar.id}` : (session.user.image ?? null),
  };

  const version = (await import("../../../package.json")).default.version as string;

  return (
    <AppShell
      version={version}
      currentMilestone="M5"
      user={user}
      permissions={[...permissionKeys]}
      appName={appName}
      tagline={tagline}
    >
      {children}
    </AppShell>
  );
}
