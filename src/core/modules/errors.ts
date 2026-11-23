import type { ModuleState } from "./state";

const moduleStates: readonly string[] = ["available", "installed", "enabled", "disabled"];

function asModuleState(value: string | undefined): ModuleState | undefined {
  return value && moduleStates.includes(value) ? (value as ModuleState) : undefined;
}

/** Raised when a module id has no registered definition. */
export class ModuleNotFoundError extends Error {
  readonly moduleId: string;

  constructor(moduleId: string) {
    super(`Module not found: ${moduleId}`);
    this.name = "ModuleNotFoundError";
    this.moduleId = moduleId;
  }
}

/** Raised when a module is absent, not enabled, or cannot change state. */
export class ModuleStateError extends Error {
  readonly moduleId: string;
  readonly from?: ModuleState;
  readonly to?: ModuleState;

  constructor(moduleId: string, fromOrMessage?: ModuleState | string, to?: ModuleState) {
    const from = typeof fromOrMessage === "string" ? asModuleState(fromOrMessage) : undefined;
    const explicitMessage =
      typeof fromOrMessage === "string" && from === undefined ? fromOrMessage : undefined;
    const message =
      explicitMessage ??
      (from && to
        ? `Cannot transition module ${moduleId} from ${from} to ${to}`
        : `Module is not enabled: ${moduleId}`);
    super(message);
    this.name = "ModuleStateError";
    this.moduleId = moduleId;
    this.from = from;
    this.to = to;
  }
}

/** Raised when required module dependencies are missing or disabled. */
export class ModuleDependencyError extends Error {
  readonly moduleId: string;
  readonly dependencies: readonly string[];

  constructor(moduleId: string, dependencies: readonly string[] = [], message?: string) {
    super(message ?? `Unmet dependencies for module ${moduleId}: ${dependencies.join(", ")}`);
    this.name = "ModuleDependencyError";
    this.moduleId = moduleId;
    this.dependencies = dependencies;
  }
}

/** Raised when the current plan lacks an entitlement required by a module. */
export class ModuleEntitlementError extends Error {
  readonly moduleId: string;
  readonly entitlement?: string;

  constructor(moduleId: string, entitlement?: string, message?: string) {
    super(message ?? `Module ${moduleId} requires entitlement ${entitlement ?? "unknown"}`);
    this.name = "ModuleEntitlementError";
    this.moduleId = moduleId;
    this.entitlement = entitlement;
  }
}
