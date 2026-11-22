import { getTranslations } from "next-intl/server";
import { signOutAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import type { ShellUser } from "./app-shell";
import { Breadcrumbs } from "./breadcrumbs";
import { LocaleSwitcher } from "./locale-switcher";
import { ThemeToggle } from "./theme-toggle";

export async function Header({ user }: { user: ShellUser | null }) {
  const t = await getTranslations("header");
  const nav = await getTranslations("nav");

  return (
    <header className="flex min-h-16 flex-wrap items-center justify-between gap-3 border-b bg-surface px-6 py-3 lg:px-10">
      <Breadcrumbs label={t("breadcrumb")} />
      <div className="flex flex-wrap items-center gap-3">
        {user ? (
          <div className="hidden min-w-0 text-end sm:block">
            <p className="truncate text-xs font-medium">{user.name}</p>
            <p className="max-w-56 truncate text-[11px] text-muted" dir="ltr">
              {user.email}
            </p>
          </div>
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
