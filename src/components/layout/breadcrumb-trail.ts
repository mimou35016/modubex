export type BreadcrumbLabels = Readonly<Record<string, string>>;
export type BreadcrumbItem = { href: string; label: string };

function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/** Resolves the current pathname into real, localized breadcrumb entries. */
export function buildBreadcrumbTrail(
  pathname: string | null,
  rootLabel: string,
  labels: BreadcrumbLabels,
): BreadcrumbItem[] {
  const path = (pathname ?? "/").split("?")[0].replace(/\/+$/, "") || "/";
  const trail: BreadcrumbItem[] = [{ href: "/", label: rootLabel }];
  if (path === "/") return [...trail, { href: "/", label: labels["/"] ?? rootLabel }];

  let current = "";
  for (const segment of path.split("/").filter(Boolean)) {
    const parent = current || "/";
    current = `${current}/${segment}`;
    const label =
      labels[current] ?? labels[`${parent}/*`] ?? labels["/*"] ?? decodeSegment(segment);
    // An empty label marks a technical segment (for example /modules/run) that
    // should not appear as breadcrumb text.
    if (!label) continue;
    trail.push({ href: current, label });
  }
  return trail;
}
