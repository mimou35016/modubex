import { getModuleViews } from "./state";

export type ModuleNavLink = {
  moduleId: string;
  key: string;
  href: string;
  labelKey: string;
  icon: string;
  order: number;
};

function compareText(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/**
 * Sidebar links declared by enabled modules that the current session may see.
 * Kept free of React and i18n so the selection logic is easy to test.
 */
export async function getModuleNavLinks(permissions: readonly string[]): Promise<ModuleNavLink[]> {
  const views = await getModuleViews();
  const granted = new Set(permissions);
  const links: ModuleNavLink[] = [];
  const seenKeys = new Set<string>();
  const seenHrefs = new Set<string>();

  for (const view of views) {
    if (view.state !== "enabled") continue;

    const moduleId = view.manifest.id;
    for (const route of view.manifest.routes) {
      const sidebar = route.sidebar;
      if (!sidebar) continue;
      if (route.permission && !granted.has(route.permission)) continue;

      const href = route.path
        ? `/modules/run/${moduleId}/${route.path}`
        : `/modules/run/${moduleId}`;
      const identity = `${moduleId}/${route.key}`;
      if (seenKeys.has(identity) || seenHrefs.has(href)) continue;

      seenKeys.add(identity);
      seenHrefs.add(href);
      links.push({
        moduleId,
        key: route.key,
        href,
        labelKey: sidebar.labelKey,
        icon: sidebar.icon,
        order: sidebar.order ?? 0,
      });
    }
  }

  links.sort(
    (a, b) => a.order - b.order || compareText(a.moduleId, b.moduleId) || compareText(a.key, b.key),
  );
  return links;
}
