import Link from "next/link";
import { getTranslations } from "next-intl/server";
import {
  modulesListParamsSchema,
  normalizeSearchParams,
  type RawSearchParams,
} from "@/app/(app)/_components/list-params";
import { hasPermission } from "@/app/(app)/_components/permissions";
import { ModuleLifecycleControls } from "@/app/(app)/_components/modules/module-lifecycle-actions";
import { withModuleMessages } from "@/app/(app)/_components/modules/module-settings-fields";
import {
  asModuleTranslator,
  entitlementLabel,
  resolveModuleDescription,
  resolveModuleName,
  translateWithFallback,
  type ModuleManifestView,
  type ModuleStateValue,
} from "@/app/(app)/_components/modules/module-view";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requirePagePermission } from "@/core/auth/dal";
import { requirePageEntitlement } from "@/core/entitlements/guards";
import { planKeys, type PlanKey } from "@/core/entitlements/plans";
import type { Entitlements } from "@/core/entitlements/service";
import { getModuleViews } from "@/core/modules/state";

const stateOptions: readonly ModuleStateValue[] = ["available", "installed", "enabled", "disabled"];

const selectClass =
  "h-10 w-full rounded-md border bg-surface px-3 text-sm text-foreground disabled:cursor-not-allowed disabled:opacity-50";

function isPlanKey(value: string): value is PlanKey {
  return (planKeys as readonly string[]).includes(value);
}

function entitlementAllows(manifest: ModuleManifestView, entitlements: Entitlements): boolean {
  if (manifest.requiredEntitlement) return entitlements.has(manifest.requiredEntitlement);
  if (!manifest.requiredPlan || !isPlanKey(manifest.requiredPlan)) return true;
  return planKeys.indexOf(manifest.requiredPlan) <= planKeys.indexOf(entitlements.plan);
}

export default async function ModulesPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const { permissionKeys } = await requirePagePermission("modules.read");
  const entitlements = await requirePageEntitlement("modules.store");

  const [typedT, tModules, tLicense, params, views] = await Promise.all([
    getTranslations(),
    getTranslations("modules"),
    getTranslations("license"),
    searchParams,
    getModuleViews(),
  ]);
  const t = await withModuleMessages(asModuleTranslator(typedT));
  const tModulesTranslator = asModuleTranslator(tModules);

  const filters = modulesListParamsSchema.parse(normalizeSearchParams(params));
  const canManage = hasPermission(permissionKeys, "modules.manage");
  const query = filters.q.trim().toLowerCase();

  const filtered = views.filter((view) => {
    const manifest = view.manifest;
    const name = resolveModuleName(t, manifest.id, manifest).toLowerCase();
    const description = resolveModuleDescription(t, manifest.id, manifest).toLowerCase();
    const matchesQuery =
      query.length === 0 ||
      manifest.id.toLowerCase().includes(query) ||
      name.includes(query) ||
      description.includes(query);
    const matchesState = filters.state === "all" || view.state === filters.state;
    return matchesQuery && matchesState;
  });

  const enabledDependents = new Set<string>();
  for (const view of views) {
    if (view.state !== "enabled") continue;
    for (const dependency of view.manifest.dependencies) {
      enabledDependents.add(dependency);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="border-b pb-6">
        <h1 className="text-3xl font-semibold tracking-tight">{tModules("title")}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">{tModules("subtitle")}</p>
      </header>

      <Card>
        <CardHeader className="border-b">
          <CardTitle>{tModules("filters.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form method="get" className="grid gap-4 sm:grid-cols-[2fr_1fr_auto_auto] sm:items-end">
            <div className="space-y-1.5">
              <Label htmlFor="module-query">{tModules("filters.queryLabel")}</Label>
              <Input
                id="module-query"
                name="q"
                defaultValue={filters.q}
                placeholder={tModules("filters.queryPlaceholder")}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="module-state">{tModules("filters.stateLabel")}</Label>
              <select
                id="module-state"
                name="state"
                defaultValue={filters.state}
                className={selectClass}
              >
                <option value="all">{tModules("filters.stateAll")}</option>
                {stateOptions.map((state) => (
                  <option key={state} value={state}>
                    {tModules(`states.${state}`)}
                  </option>
                ))}
              </select>
            </div>
            <Button type="submit">{tModules("filters.submit")}</Button>
            <Link href="/modules" className={buttonVariants({ variant: "outline" })}>
              {tModules("filters.reset")}
            </Link>
          </form>
        </CardContent>
      </Card>

      {views.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted">
            {tModules("noModules")}
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted">
            {tModules("noResults")}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          {filtered.map((view) => {
            const manifest = view.manifest;
            const name = resolveModuleName(t, manifest.id, manifest);
            const description = resolveModuleDescription(t, manifest.id, manifest);
            const allowed = entitlementAllows(manifest, entitlements);
            const planLabel =
              manifest.requiredPlan && isPlanKey(manifest.requiredPlan)
                ? tLicense(`plans.${manifest.requiredPlan}`)
                : manifest.requiredPlan;
            const entitlementLabelText = manifest.requiredEntitlement
              ? entitlementLabel(tModulesTranslator, manifest.requiredEntitlement)
              : undefined;
            const requirement = entitlementLabelText ?? planLabel;
            const blocked = enabledDependents.has(manifest.id);

            return (
              <Card key={manifest.id} className="flex h-full flex-col">
                <CardHeader className="border-b">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <CardTitle className="text-lg">{name || manifest.id}</CardTitle>
                      <p className="mt-1 font-mono text-[11px] text-muted" dir="ltr">
                        {manifest.id}
                      </p>
                    </div>
                    <div className="flex flex-wrap justify-end gap-2">
                      <Badge tone={view.state === "enabled" ? "accent" : "muted"}>
                        {tModules(`states.${view.state}`)}
                      </Badge>
                      <Badge>{view.version || tModules("unknownVersion")}</Badge>
                    </div>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-muted">
                    {description || tModules("noDescription")}
                  </p>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col gap-4 pt-6">
                  <dl className="grid gap-3 text-xs sm:grid-cols-2">
                    <div>
                      <dt className="text-muted">{tModules("columns.plan")}</dt>
                      <dd className="mt-1 font-medium">
                        {requirement
                          ? tModules("planRequired", { plan: requirement })
                          : tModules("noRequirement")}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted">{tModules("columns.dependencies")}</dt>
                      <dd className="mt-1 font-medium" dir="ltr">
                        {manifest.dependencies.length > 0
                          ? tModules("dependenciesRequired", {
                              modules: manifest.dependencies.join(", "),
                            })
                          : tModules("noDependencies")}
                      </dd>
                    </div>
                  </dl>

                  {view.state === "enabled" ? (
                    <div className="flex flex-wrap gap-3">
                      {manifest.routes.map((route) => (
                        <Link
                          key={route.key}
                          href={`/modules/run/${encodeURIComponent(manifest.id)}${
                            route.path ? `/${route.path}` : ""
                          }`}
                          className="text-xs font-medium text-accent hover:underline"
                        >
                          {translateWithFallback(t, [route.labelKey], route.key)}
                        </Link>
                      ))}
                    </div>
                  ) : null}

                  {view.dataRetained ? <Badge>{tModules("dataRetained")}</Badge> : null}

                  <div className="mt-auto border-t pt-4">
                    {!allowed ? (
                      <div className="space-y-2">
                        <Badge>{tModules("locked")}</Badge>
                        <p className="text-xs text-muted">{tModules("lockedHint")}</p>
                      </div>
                    ) : (
                      <ModuleLifecycleControls
                        moduleId={manifest.id}
                        state={view.state}
                        canManage={canManage}
                        blocked={blocked}
                      />
                    )}
                    {!canManage && allowed ? (
                      <p className="mt-2 text-xs text-muted">{tModules("manageRequired")}</p>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
