import type { Prisma } from "@prisma/client";
import type { ComponentType } from "react";
import { z } from "zod";
import type { AuditActor } from "@/core/audit/audit";
import { entitlementSchema, planSchema } from "@/core/entitlements/plans";
import type { Locale } from "@/core/i18n/locales";

/** Stable identifier limits shared by manifests, routes, and the registry. */
export const MODULE_ID_MAX_LENGTH = 60;

export const moduleIdSchema = z
  .string()
  .min(1)
  .max(MODULE_ID_MAX_LENGTH)
  .regex(
    /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/,
    "Module ids must start with a lowercase letter and use lowercase letters, digits, or single dashes",
  );

export type ModuleId = z.infer<typeof moduleIdSchema>;

/**
 * Generic dotted key shape. The `<moduleId>.` portion is enforced against the
 * concrete manifest id by `moduleManifestSchema` and again by the registry.
 */
export const modulePermissionKeySchema = z
  .string()
  .min(3)
  .max(120)
  .regex(
    /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*(?:\.[a-z][a-z0-9_-]*)+$/,
    "Module permission keys must be lowercase dotted identifiers",
  );

/** Zod schema factory for a specific module's permission prefix. */
export function modulePermissionKeySchemaFor(moduleId: string) {
  const prefix = `${moduleId}.`;
  return modulePermissionKeySchema.refine((key) => key.startsWith(prefix), {
    message: `Permission keys must begin with "${prefix}"`,
  });
}

export const moduleRouteKeySchema = moduleIdSchema;

/**
 * Route paths are relative to `/modules/run/<moduleId>`. An empty string is
 * the module root; nested paths use `/`-separated lowercase segments.
 */
export const moduleRoutePathSchema = z
  .string()
  .max(200)
  .refine(
    (value) =>
      value === "" ||
      value
        .split("/")
        .every((segment) => segment.length > 0 && /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(segment)),
    "Route paths must be empty or /-separated lowercase segments without a leading slash",
  );

const modulePermissionDescriptorSchema = z.object({
  key: modulePermissionKeySchema,
  description: z.string().trim().min(1).max(500),
});

const moduleRouteSidebarSchema = z.object({
  labelKey: z.string().min(1).max(200),
  icon: z.string().min(1).max(120),
  order: z.number().int().nonnegative().optional(),
});

const moduleRouteSchema = z.object({
  key: moduleRouteKeySchema,
  path: moduleRoutePathSchema,
  labelKey: z.string().min(1).max(200),
  permission: modulePermissionKeySchema.optional(),
  sidebar: moduleRouteSidebarSchema.optional(),
});

/** Any Zod object schema; module settings are validated by the owning module. */
export type ModuleSettingsSchema = z.ZodType<Record<string, unknown>>;

function isZodSettingsSchema(value: unknown): value is ModuleSettingsSchema {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as {
    parse?: unknown;
    safeParse?: unknown;
    _def?: { type?: unknown };
  };
  if (typeof candidate.parse !== "function" || typeof candidate.safeParse !== "function") {
    return false;
  }
  return candidate._def?.type === "object";
}

const moduleSettingsSchemaField = z.custom<ModuleSettingsSchema>(isZodSettingsSchema, {
  message: "settingsSchema must be a Zod object schema",
});

export const moduleManifestSchema = z
  .object({
    id: moduleIdSchema,
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().min(1).max(500),
    version: z
      .string()
      .regex(
        /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/,
        "Version must be semantic (for example 1.0.0)",
      ),
    author: z.string().trim().min(1).max(120),
    icon: z.string().trim().min(1).max(120),
    requiredPlan: planSchema.optional(),
    requiredEntitlement: entitlementSchema.optional(),
    dependencies: z.array(moduleIdSchema),
    permissions: z.array(modulePermissionDescriptorSchema),
    routes: z.array(moduleRouteSchema),
    settingsSchema: moduleSettingsSchemaField,
    ownedModels: z.array(z.string().min(1).max(120)),
    migrations: z.array(z.string().min(1).max(300)),
    messageNamespace: moduleIdSchema.optional(),
  })
  .superRefine((manifest, ctx) => {
    const prefix = `${manifest.id}.`;
    manifest.permissions.forEach((permission, index) => {
      if (!permission.key.startsWith(prefix)) {
        ctx.addIssue({
          code: "custom",
          path: ["permissions", index, "key"],
          message: `Permission keys must begin with "${prefix}"`,
        });
      }
    });
  });

export type ModuleManifest = z.infer<typeof moduleManifestSchema>;

/** Props passed to every statically bundled module route component. */
export type ModuleRouteProps = {
  moduleId: string;
  slug: readonly string[];
};

/** Context supplied to a module's optional data-cleanup hook. */
export type ModuleCleanupContext = {
  client: Prisma.TransactionClient;
  actor: AuditActor;
  moduleId: string;
};

/** Per-model deletion counts reported by a cleanup hook. */
export type ModuleCleanupResult = {
  deleted: Record<string, number>;
};

/** Optional destructive cleanup run inside the module uninstall transaction. */
export type ModuleCleanupHook = (context: ModuleCleanupContext) => Promise<ModuleCleanupResult>;

/** A build-time bundled module: manifest, route components, cleanup, messages. */
export type ModuleDefinition = {
  manifest: ModuleManifest;
  routes: Readonly<Record<string, ComponentType<ModuleRouteProps>>>;
  cleanup?: ModuleCleanupHook;
  messages: Readonly<Record<Locale, () => Promise<Record<string, unknown>>>>;
};
