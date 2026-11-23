import { createElement } from "react";
import { notFound, redirect } from "next/navigation";
import { requirePagePermission } from "@/core/auth/dal";
import { getModuleDefinition } from "@/core/modules/registry";
import { moduleIdSchema } from "@/core/modules/schemas";
import { getModuleViews } from "@/core/modules/state";

/**
 * Shared server renderer for bundled module routes. Routes are resolved from the
 * build-time registry; no code is loaded at runtime.
 */
export async function renderModuleRoute(rawModuleId: string, slug: string[]) {
  const parsed = moduleIdSchema.safeParse(rawModuleId);
  if (!parsed.success) notFound();
  const moduleId = parsed.data;

  const { permissionKeys } = await requirePagePermission("app.access");

  const views = await getModuleViews();
  const view = views.find((item) => item.manifest.id === moduleId);
  if (!view || view.state !== "enabled") notFound();

  const definition = getModuleDefinition(moduleId);
  if (!definition) notFound();

  const segments = slug.filter((segment) => segment.length > 0);
  const routes = [...definition.manifest.routes].sort((a, b) => {
    const aLength = a.path ? a.path.split("/").length : 0;
    const bLength = b.path ? b.path.split("/").length : 0;
    return bLength - aLength;
  });

  const route = routes.find((item) => {
    const parts = item.path ? item.path.split("/") : [];
    if (parts.length === 0) return segments.length === 0;
    return parts.every((part, index) => segments[index] === part);
  });
  if (!route) notFound();

  if (route.permission && !permissionKeys.some((key) => key === route.permission)) {
    redirect("/forbidden");
  }

  const Component = definition.routes[route.key];
  if (!Component) notFound();

  const remaining = route.path ? segments.slice(route.path.split("/").length) : [];
  return createElement(Component, { moduleId, slug: remaining });
}
