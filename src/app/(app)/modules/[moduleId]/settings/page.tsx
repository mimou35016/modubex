import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { ModuleSettingsForm } from "@/app/(app)/_components/modules/module-settings-form";
import {
  buildModuleSettingsFields,
  withModuleMessages,
} from "@/app/(app)/_components/modules/module-settings-fields";
import {
  asModuleTranslator,
  moduleMessageNamespace,
  readModuleManifest,
  resolveModuleName,
} from "@/app/(app)/_components/modules/module-view";
import { hasPermission } from "@/app/(app)/_components/permissions";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePagePermission } from "@/core/auth/dal";
import { requirePageEntitlement } from "@/core/entitlements/guards";
import { moduleIdSchema } from "@/core/modules/schemas";
import { getModuleViews } from "@/core/modules/state";

export default async function ModuleSettingsPage({
  params,
}: {
  params: Promise<{ moduleId: string }>;
}) {
  const { moduleId: rawModuleId } = await params;
  const parsed = moduleIdSchema.safeParse(rawModuleId);
  if (!parsed.success) notFound();
  const moduleId = parsed.data;

  const { permissionKeys } = await requirePagePermission("modules.manage");
  await requirePageEntitlement("modules.store");

  const [typedT, tModules, views] = await Promise.all([
    getTranslations(),
    getTranslations("modules"),
    getModuleViews(),
  ]);
  const t = await withModuleMessages(asModuleTranslator(typedT), [moduleId]);

  const view = views.find((item) => item.manifest.id === moduleId);
  if (!view || view.state === "available") notFound();

  const manifest = readModuleManifest(view.manifest);
  const name = resolveModuleName(t, moduleId, manifest);

  const fields = buildModuleSettingsFields({
    t,
    messageNamespace: moduleMessageNamespace(manifest, moduleId),
    schema: manifest.settingsSchema,
    config: view.config,
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="border-b pb-6">
        <Link href="/modules" className="text-xs font-medium text-accent hover:underline">
          {tModules("settingsBack")}
        </Link>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-semibold tracking-tight">{tModules("settingsTitle")}</h1>
          <Badge tone="accent">{name || moduleId}</Badge>
        </div>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">{tModules("settingsHint")}</p>
      </header>

      <Card>
        <CardHeader className="border-b">
          <CardTitle>{name || moduleId}</CardTitle>
          <p className="font-mono text-[11px] text-muted" dir="ltr">
            {moduleId}
          </p>
        </CardHeader>
        <CardContent className="pt-6">
          <ModuleSettingsForm
            moduleId={moduleId}
            fields={fields}
            canEdit={hasPermission(permissionKeys, "modules.manage")}
          />
        </CardContent>
      </Card>
    </div>
  );
}
