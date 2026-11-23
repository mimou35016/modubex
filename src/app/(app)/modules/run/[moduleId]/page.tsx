import { renderModuleRoute } from "@/app/(app)/_components/modules/module-route-renderer";

/** Root route for modules whose manifest declares the path "". */
export default async function ModuleRouteIndexPage({
  params,
}: {
  params: Promise<{ moduleId: string }>;
}) {
  const { moduleId } = await params;
  const content = await renderModuleRoute(moduleId, []);
  return content;
}
