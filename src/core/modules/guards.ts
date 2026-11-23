import { ModuleStateError } from "./errors";
import type { ModuleDefinition } from "./manifest";
import { getModuleDefinition } from "./registry";
import { getModuleStates } from "./state";

/** Server-side guard for module routes and actions. */
export async function requireEnabledModule(moduleId: string): Promise<ModuleDefinition> {
  const definition = getModuleDefinition(moduleId);
  if (!definition) {
    throw new ModuleStateError(moduleId, "Module is not registered");
  }

  const states = await getModuleStates();
  const state = states[moduleId];
  if (state !== "enabled") {
    throw new ModuleStateError(moduleId, `Module is ${state ?? "available"}, not enabled`);
  }
  return definition;
}
