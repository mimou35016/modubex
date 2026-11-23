import { z } from "zod";
import { moduleIdSchema } from "./manifest";

export { moduleIdSchema };

const settingsValuesSchema = z.record(z.string(), z.unknown());

const actorSchema = z
  .object({
    userId: z.string().min(1),
    email: z.email().optional(),
    ip: z.string().optional(),
    userAgent: z.string().optional(),
  })
  .passthrough();

export const moduleLifecycleActionSchema = z.enum(["install", "enable", "disable", "uninstall"]);
export type ModuleLifecycleAction = z.infer<typeof moduleLifecycleActionSchema>;

export const moduleLifecycleSchema = z
  .object({
    moduleId: moduleIdSchema,
    action: moduleLifecycleActionSchema,
    config: settingsValuesSchema.optional(),
    actor: actorSchema.optional(),
  })
  .passthrough();

export type ModuleLifecycleInput = z.infer<typeof moduleLifecycleSchema>;

export const moduleUninstallModeSchema = z.enum(["retain", "purge"]);
export type ModuleUninstallMode = z.infer<typeof moduleUninstallModeSchema>;

/**
 * `retain` keeps module data for a later reinstall; `purge` requires an
 * explicit typed confirmation naming the module being destroyed.
 */
export const moduleUninstallSchema = z
  .object({
    moduleId: moduleIdSchema,
    mode: moduleUninstallModeSchema,
    confirmation: z.string().max(200).optional(),
    actor: actorSchema.optional(),
  })
  .passthrough()
  .superRefine((value, ctx) => {
    if (value.mode === "purge") {
      const expected = `PURGE:${value.moduleId}`;
      if (value.confirmation !== expected && value.confirmation !== value.moduleId) {
        ctx.addIssue({
          code: "custom",
          path: ["confirmation"],
          message: `Type "${expected}" to purge module data`,
        });
      }
    } else if (value.confirmation !== undefined && value.confirmation !== "") {
      ctx.addIssue({
        code: "custom",
        path: ["confirmation"],
        message: "Confirmation is only accepted for purge uninstalls",
      });
    }
  });

export type ModuleUninstallInput = z.infer<typeof moduleUninstallSchema> &
  ({ mode: "retain"; confirmation?: undefined } | { mode: "purge"; confirmation: string });

/** Settings writes are validated again by the owning module's zod schema. */
export const moduleSettingsActionSchema = z
  .object({
    moduleId: moduleIdSchema,
    settings: settingsValuesSchema.optional(),
    // Accepted as an alias so callers can use the more familiar action shape.
    values: settingsValuesSchema.optional(),
    actor: actorSchema.optional(),
  })
  .passthrough()
  .transform((value) => ({
    ...value,
    settings: value.settings ?? value.values ?? {},
  }));

export type ModuleSettingsActionInput = z.infer<typeof moduleSettingsActionSchema>;
