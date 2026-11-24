/* eslint-disable @next/next/no-img-element -- avatars are served by /api/files or by the identity provider. */
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { signOutAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { getModuleManifests } from "@/core/modules/registry";
import type { ShellUser } from "./app-shell";
import { Breadcrumbs } from "./breadcrumbs";
import { LocaleSwitcher } from "./locale-switcher";
import { ThemeToggle } from "./theme-toggle";

function initials(user: ShellUser): string {
  const source = user.name.trim() || user.email.trim() || "?";
  const parts = source.split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}` : (source[0] ?? "?"))
    .toUpperCase()
    .slice(0, 2);
}

const settingsSections = [
  "site",
  "seo",
  "performance",
  "localization",
  "security",
  "audit",
  "workspace",
  "infrastructure",
] as const;

export async function Header({ user }: { user: ShellUser | null }) {
  const nav = await getTranslations("nav");
  const tModules = await getTranslations("modules");
  const tSettings = await getTranslations("settings");
  const tUserDetail = await getTranslations("users.detail");
  const tAll = await getTranslations();

  const labels: Record<string, string> = {
    "/": nav("overview"),
    "/profile": nav("areas.profile"),
    "/invite": nav("invite"),
    "/modules": tModules("navLabel"),
    "/modules/run": "",
    "/users": nav("areas.users"),
    "/users/*": tUserDetail("accountTitle"),
    "/roles": nav("areas.roles"),
    "/audit": nav("areas.audit"),
    "/license": nav("areas.license"),
    "/settings": nav("areas.settings"),
    "/settings/performance/advanced": tSettings("performance.advancedTitle"),
  };
  for (const section of settingsSections) {
    labels[`/settings/${section}`] = tSettings(`tabs.${section}`);
  }
  for (const manifest of getModuleManifests()) {
    const runBase = `/modules/run/${manifest.id}`;
    const storeBase = `/modules/${manifest.id}`;
    labels[runBase] = manifest.name;
    labels[storeBase] = manifest.name;
    labels[`${storeBase}/settings`] = tSettings("title");
    for (const route of manifest.routes) {
      const href = route.path ? `${runBase}/${route.path}` : runBase;
      let parent = runBase;
      for (const segment of route.path.split("/").filter(Boolean).slice(0, -1)) {
        parent = `${parent}/${segment}`;
        labels[parent] = "";
      }
      labels[href] = tAll.has(route.labelKey) ? tAll(route.labelKey) : manifest.name;
    }
  }

  return (
    <header className="flex min-h-16 flex-wrap items-center justify-between gap-3 border-b bg-surface px-6 py-3 lg:px-10">
      <Breadcrumbs rootLabel={nav("foundation")} labels={labels} />
      <div className="flex flex-wrap items-center gap-3">
        {user ? (
          <Link
            href="/profile"
            aria-label={nav("areas.profile")}
            className="flex min-w-0 items-center gap-2 rounded-md px-1 py-1 transition-colors hover:bg-accent-soft"
          >
            {user.image ? (
              <img
                src={user.image}
                alt={user.name}
                className="size-8 shrink-0 rounded-full object-cover"
              />
            ) : (
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-soft font-mono text-[11px] font-semibold text-accent">
                {initials(user)}
              </span>
            )}
            <span className="hidden min-w-0 text-end sm:block">
              <span className="block truncate text-xs font-medium">{user.name}</span>
              <span className="block max-w-56 truncate text-[11px] text-muted" dir="ltr">
                {user.email}
              </span>
            </span>
          </Link>
        ) : null}
        <LocaleSwitcher />
        <ThemeToggle />
        <form action={signOutAction}>
          <Button type="submit" variant="ghost" size="sm">
            {nav("signOut")}
          </Button>
        </form>
      </div>
    </header>
  );
}
