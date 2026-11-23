import type { ModuleManifest } from "./manifest";
import type { ModuleState } from "./state";

/** A dependency is satisfied once it has been installed (enabled included). */
export function findUnmetDependencies(
  manifest: ModuleManifest,
  states: Readonly<Record<string, ModuleState>>,
): readonly string[] {
  return manifest.dependencies.filter((id) => {
    const state = states[id];
    return state !== "installed" && state !== "enabled";
  });
}

/** Enabled modules that declare `moduleId` as a direct dependency. */
export function findEnabledDependents(
  moduleId: string,
  manifests: readonly ModuleManifest[],
  states: Readonly<Record<string, ModuleState>>,
): readonly string[] {
  return manifests
    .filter(
      (manifest) =>
        manifest.id !== moduleId &&
        manifest.dependencies.includes(moduleId) &&
        states[manifest.id] === "enabled",
    )
    .map((manifest) => manifest.id);
}

const allowedTransitions: ReadonlySet<string> = new Set([
  "available>installed",
  "installed>enabled",
  "installed>available",
  "enabled>disabled",
  "enabled>available",
  "disabled>enabled",
  "disabled>available",
]);

/** Pure lifecycle guard; no-op transitions are rejected. */
export function canTransition(from: ModuleState, to: ModuleState): boolean {
  return allowedTransitions.has(`${from}>${to}`);
}

/**
 * Returns the first dependency cycle as a list of module ids, or null when the
 * dependency graph is acyclic. Self-dependencies are reported as `[id, id]`.
 */
export function findDependencyCycle(
  manifests: readonly ModuleManifest[],
): readonly string[] | null {
  const known = new Set(manifests.map((manifest) => manifest.id));
  const byId = new Map(manifests.map((manifest) => [manifest.id, manifest]));
  const state = new Map<string, "visiting" | "done">();
  const stack: string[] = [];

  function visit(id: string): readonly string[] | null {
    if (state.get(id) === "done") return null;
    if (state.get(id) === "visiting") {
      const start = stack.indexOf(id);
      return start === -1 ? [id, id] : [...stack.slice(start), id];
    }

    state.set(id, "visiting");
    stack.push(id);
    const manifest = byId.get(id);
    for (const dependency of manifest?.dependencies ?? []) {
      if (!known.has(dependency)) continue;
      const cycle = visit(dependency);
      if (cycle) return cycle;
    }
    stack.pop();
    state.set(id, "done");
    return null;
  }

  for (const manifest of manifests) {
    if (manifest.dependencies.includes(manifest.id)) return [manifest.id, manifest.id];
    const cycle = visit(manifest.id);
    if (cycle) return cycle;
  }
  return null;
}
