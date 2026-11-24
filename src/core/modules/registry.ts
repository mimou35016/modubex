import { moduleDefinitions as generatedDefinitions } from "@/modules/registry.generated";
import { findDependencyCycle } from "./dependencies";
import { moduleManifestSchema, type ModuleDefinition, type ModuleManifest } from "./manifest";

/**
 * Pure validation of the build-time generated module set. Called once at
 * import and exported so registry invariants can be unit tested directly.
 */
export function validateModuleDefinitions(
  definitions: readonly ModuleDefinition[],
): readonly ModuleManifest[] {
  const ids = new Set<string>();
  const permissionKeys = new Set<string>();
  const manifests: ModuleManifest[] = [];

  for (const definition of definitions) {
    const manifest = moduleManifestSchema.parse(definition.manifest);
    if (ids.has(manifest.id)) {
      throw new Error(`Duplicate module id: ${manifest.id}`);
    }
    ids.add(manifest.id);

    const routeKeys = new Set<string>();
    const routePaths = new Set<string>();
    for (const route of manifest.routes) {
      if (routeKeys.has(route.key)) {
        throw new Error(`Duplicate route key "${route.key}" in module ${manifest.id}`);
      }
      routeKeys.add(route.key);
      if (routePaths.has(route.path)) {
        throw new Error(`Duplicate route path "${route.path}" in module ${manifest.id}`);
      }
      routePaths.add(route.path);
      if (!definition.routes[route.key]) {
        throw new Error(`Missing route component for ${manifest.id}/${route.key}`);
      }
    }

    const prefix = `${manifest.id}.`;
    for (const permission of manifest.permissions) {
      if (!permission.key.startsWith(prefix)) {
        throw new Error(
          `Permission ${permission.key} in module ${manifest.id} must begin with "${prefix}"`,
        );
      }
      if (permissionKeys.has(permission.key)) {
        throw new Error(`Duplicate permission key: ${permission.key}`);
      }
      permissionKeys.add(permission.key);
    }

    for (const route of manifest.routes) {
      if (route.permission && !route.permission.startsWith(prefix)) {
        throw new Error(
          `Route permission ${route.permission} in module ${manifest.id} must begin with "${prefix}"`,
        );
      }
    }

    manifests.push(manifest);
  }

  for (const manifest of manifests) {
    for (const dependency of manifest.dependencies) {
      if (!ids.has(dependency)) {
        throw new Error(`Module ${manifest.id} depends on unknown module ${dependency}`);
      }
    }
  }

  const cycle = findDependencyCycle(manifests);
  if (cycle) {
    throw new Error(`Module dependency cycle: ${cycle.join(" -> ")}`);
  }

  return manifests;
}

const manifests = validateModuleDefinitions(generatedDefinitions);

export const moduleDefinitions: readonly ModuleDefinition[] = generatedDefinitions;

const definitionsById: ReadonlyMap<string, ModuleDefinition> = new Map(
  moduleDefinitions.map((definition) => [definition.manifest.id, definition]),
);

const manifestsById: ReadonlyMap<string, ModuleManifest> = new Map(
  moduleDefinitions.map((definition) => [definition.manifest.id, definition.manifest]),
);

/** Returns the bundled definition for `id`, or undefined when unknown. */
export function getModuleDefinition(id: string): ModuleDefinition | undefined {
  return definitionsById.get(id);
}

/** Returns the validated manifest for `id`, or undefined when unknown. */
export function getModuleManifest(id: string): ModuleManifest | undefined {
  return manifestsById.get(id);
}

/** Stable, validated manifest list in generated (alphabetical) order. */
export function getModuleManifests(): readonly ModuleManifest[] {
  return manifests;
}
