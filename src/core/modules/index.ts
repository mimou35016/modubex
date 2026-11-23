export {
  moduleIdSchema,
  moduleManifestSchema,
  modulePermissionKeySchema,
  modulePermissionKeySchemaFor,
  moduleRouteKeySchema,
  moduleRoutePathSchema,
} from "./manifest";
export type {
  ModuleCleanupContext,
  ModuleCleanupHook,
  ModuleCleanupResult,
  ModuleDefinition,
  ModuleManifest,
  ModuleRouteProps,
  ModuleSettingsSchema,
} from "./manifest";
export {
  canTransition,
  findDependencyCycle,
  findEnabledDependents,
  findUnmetDependencies,
} from "./dependencies";
export {
  ModuleDependencyError,
  ModuleEntitlementError,
  ModuleNotFoundError,
  ModuleStateError,
} from "./errors";
export {
  getModuleDefinition,
  getModuleManifest,
  getModuleManifests,
  moduleDefinitions,
  validateModuleDefinitions,
} from "./registry";
export {
  getModuleStates,
  getModuleViews,
  MODULES_CACHE_TAG,
  moduleStateSchema,
  readModuleStates,
  readModuleViews,
} from "./state";
export type { ModuleState, ModuleView } from "./state";
export { modulePermissionDescriptors } from "./catalog";
export { mergeModuleMessages, mergeWithCorePrecedence } from "./messages";
export { requireEnabledModule } from "./guards";
export {
  moduleIdSchema as lifecycleModuleIdSchema,
  moduleLifecycleActionSchema,
  moduleLifecycleSchema,
  moduleSettingsActionSchema,
  moduleUninstallModeSchema,
  moduleUninstallSchema,
} from "./schemas";
export type {
  ModuleLifecycleAction,
  ModuleLifecycleInput,
  ModuleSettingsActionInput,
  ModuleUninstallInput,
  ModuleUninstallMode,
} from "./schemas";
