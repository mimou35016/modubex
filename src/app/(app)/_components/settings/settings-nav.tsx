import { getTranslations } from "next-intl/server";
import { NavLink } from "../nav-link";

const sections = [
  { key: "site", href: "/settings/site" },
  { key: "seo", href: "/settings/seo" },
  { key: "performance", href: "/settings/performance" },
  { key: "localization", href: "/settings/localization" },
  { key: "security", href: "/settings/security" },
  { key: "audit", href: "/settings/audit" },
  { key: "workspace", href: "/settings/workspace" },
  { key: "infrastructure", href: "/settings/infrastructure" },
] as const;

const linkClass =
  "shrink-0 whitespace-nowrap rounded-md px-3 py-2 text-xs font-medium text-muted transition-colors hover:bg-accent-soft hover:text-foreground";
const activeClass = "bg-accent-soft text-accent";

export async function SettingsNav() {
  const t = await getTranslations("settings");

  return (
    <nav className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1" aria-label={t("navLabel")}>
      {sections.map((section) => (
        <NavLink
          key={section.key}
          href={section.href}
          exact={
            section.key === "site" ||
            section.key === "audit" ||
            section.key === "workspace" ||
            section.key === "infrastructure"
          }
          className={linkClass}
          activeClassName={activeClass}
        >
          {t(`tabs.${section.key}`)}
        </NavLink>
      ))}
    </nav>
  );
}
