import type { ComponentType } from "react";
import type { ModuleManifest, ModuleRouteProps } from "@/core/modules/manifest";
import type { ModuleState, ModuleView } from "@/core/modules/state";

export type ModuleStateValue = ModuleState;
export type ModuleRouteMeta = ModuleManifest["routes"][number];
export type ModuleManifestView = ModuleManifest;
export type ModuleRouteComponent = ComponentType<ModuleRouteProps>;

/** Structural translator type that accepts dynamic module-owned message keys. */
export type ModuleTranslator = {
  (key: string, values?: Record<string, string | number>): string;
  has(key: string): boolean;
};

type UnknownRecord = Record<string, unknown>;

export function asModuleRecord(value: unknown): UnknownRecord | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  return value as UnknownRecord;
}

/** Casts a typed next-intl translator so module-owned dynamic keys can be probed. */
export function asModuleTranslator(translator: unknown): ModuleTranslator {
  return translator as ModuleTranslator;
}

export function readModuleManifest(manifest: ModuleManifest): ModuleManifestView {
  return manifest;
}

export function readModuleState(view: ModuleView): ModuleStateValue {
  return view.state;
}

export function readModuleConfig(view: ModuleView): Record<string, unknown> {
  return view.config;
}

export function moduleMessageNamespace(manifest: ModuleManifestView, moduleId: string): string {
  return manifest.messageNamespace ?? moduleId;
}

export function translateWithFallback(
  t: ModuleTranslator,
  keys: readonly string[],
  fallback: string,
): string {
  for (const key of keys) {
    if (t.has(key)) return t(key);
  }
  return fallback;
}

/** Module messages win; plain manifest strings and the module id remain valid fallbacks. */
export function resolveModuleName(
  t: ModuleTranslator,
  moduleId: string,
  manifest: ModuleManifestView,
): string {
  const namespace = moduleMessageNamespace(manifest, moduleId);
  const direct = t.has(manifest.name) ? t(manifest.name) : undefined;
  return (
    direct ??
    translateWithFallback(
      t,
      [`modules.${namespace}.title`, `modules.${namespace}.name`, `modules.${namespace}.label`],
      manifest.name || moduleId,
    )
  );
}

export function resolveModuleDescription(
  t: ModuleTranslator,
  moduleId: string,
  manifest: ModuleManifestView,
): string {
  const namespace = moduleMessageNamespace(manifest, moduleId);
  const direct = t.has(manifest.description) ? t(manifest.description) : undefined;
  return (
    direct ??
    translateWithFallback(
      t,
      [`modules.${namespace}.description`, `modules.${namespace}.summary`],
      manifest.description,
    )
  );
}

export function entitlementLabel(t: ModuleTranslator, entitlement: string): string {
  const suffix = entitlement.split(".").pop() ?? entitlement;
  return translateWithFallback(t, [`entitlements.${suffix}`], entitlement);
}
