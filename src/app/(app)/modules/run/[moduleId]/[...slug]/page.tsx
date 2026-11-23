import { renderModuleRoute } from "@/app/(app)/_components/modules/module-route-renderer";

export default async function ModuleRoutePage({
  params,
}: {
  params: Promise<{ moduleId: string; slug: string[] }>;
}) {
  const { moduleId, slug } = await params;
  const content = await renderModuleRoute(moduleId, slug);
  return content;
}
