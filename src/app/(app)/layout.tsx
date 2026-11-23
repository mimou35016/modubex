import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { getCurrentUser, requirePagePermission } from "@/core/auth/dal";
import { getSettingValue } from "@/core/settings/service";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const { permissionKeys } = await requirePagePermission("app.access");

  const [currentUser, appName, tagline] = await Promise.all([
    getCurrentUser(),
    getSettingValue("site.name"),
    getSettingValue("site.tagline"),
  ]);
  const profile = currentUser as unknown as {
    name?: string;
    email?: string;
    image?: string | null;
  } | null;
  const user = profile
    ? {
        name: profile.name || profile.email || "",
        email: profile.email || "",
        image: profile.image ?? null,
      }
    : null;

  const version = (await import("../../../package.json")).default.version as string;

  return (
    <AppShell
      version={version}
      currentMilestone="M3"
      user={user}
      permissions={[...permissionKeys]}
      appName={appName}
      tagline={tagline}
    >
      {children}
    </AppShell>
  );
}
