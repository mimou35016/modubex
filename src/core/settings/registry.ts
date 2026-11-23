import { z } from "zod";
import { env } from "@/core/config/env";
import { defaultLocale } from "@/core/i18n/locales";

/** UI categories, including env-only infrastructure metadata. */
export const settingCategories = [
  "site",
  "seo",
  "performance",
  "localization",
  "security",
  "audit",
  "workspace",
  "infrastructure",
] as const;
export type SettingCategory = (typeof settingCategories)[number];

/** Editable runtime keys. Infrastructure values live in a separate registry. */
export const settingKeys = [
  "site.name",
  "site.tagline",
  "seo.description",
  "seo.titleSuffix",
  "performance.cacheReads",
  "localization.defaultLocale",
  "security.passwordMinLength",
  "security.passwordMaxLength",
  "security.requireNumber",
  "security.requireSymbol",
  "security.requireTwoFactor",
  "audit.retentionDays",
  "workspace.timeZone",
] as const;
export type SettingKey = (typeof settingKeys)[number];

/**
 * Public descriptor contract shared with the UI workstream. `label` and
 * `description` are i18n keys, never rendered copy.
 */
export type SettingDescriptor<K extends SettingKey = SettingKey> = {
  key: K;
  category: SettingCategory;
  label: string;
  description?: string;
  schema: z.ZodTypeAny;
  default: unknown;
  sensitive?: boolean;
  restartRequired?: boolean;
  infrastructure?: boolean;
  entitlement?: string;
};

function isIanaTimeZone(value: string): boolean {
  if (value.trim().length === 0) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

const settingSchemas = {
  "site.name": z.string().trim().min(1).max(120),
  "site.tagline": z.string().trim().max(240),
  "seo.description": z.string().max(500),
  "seo.titleSuffix": z.string().trim().min(1).max(120),
  "performance.cacheReads": z.boolean(),
  "localization.defaultLocale": z.enum(["en", "fr", "ar"]),
  "security.passwordMinLength": z.number().int().min(8).max(128),
  "security.passwordMaxLength": z.number().int().min(8).max(256),
  "security.requireNumber": z.boolean(),
  "security.requireSymbol": z.boolean(),
  "security.requireTwoFactor": z.boolean(),
  "audit.retentionDays": z.number().int().min(0).max(3650),
  "workspace.timeZone": z
    .string()
    .min(1)
    .max(100)
    .refine(isIanaTimeZone, "Use a valid IANA time zone."),
} satisfies Record<SettingKey, z.ZodTypeAny>;

export type SettingValue<K extends SettingKey> = z.infer<(typeof settingSchemas)[K]>;

type EditableSettingDescriptor<K extends SettingKey> = SettingDescriptor<K> & {
  schema: (typeof settingSchemas)[K];
  default: SettingValue<K>;
  infrastructure?: false;
};

type SettingDefinitionMap = { [K in SettingKey]: EditableSettingDescriptor<K> };

// Env defaults are clamped into the registry bounds so a permissive bootstrap
// environment can never seed an invalid runtime value.
const passwordMinDefault = Math.min(128, Math.max(8, env.AUTH_PASSWORD_MIN_LENGTH));
const passwordMaxDefault = Math.min(
  256,
  Math.max(passwordMinDefault, env.AUTH_PASSWORD_MAX_LENGTH),
);

const settingDefinitions = {
  "site.name": {
    key: "site.name",
    category: "site",
    label: "settings.fields.site.name",
    schema: settingSchemas["site.name"],
    default: "Modubex",
  },
  "site.tagline": {
    key: "site.tagline",
    category: "site",
    label: "settings.fields.site.tagline",
    schema: settingSchemas["site.tagline"],
    default: "The foundation for your next product",
  },
  "seo.description": {
    key: "seo.description",
    category: "seo",
    label: "settings.fields.seo.description",
    schema: settingSchemas["seo.description"],
    default: "",
  },
  "seo.titleSuffix": {
    key: "seo.titleSuffix",
    category: "seo",
    label: "settings.fields.seo.titleSuffix",
    schema: settingSchemas["seo.titleSuffix"],
    default: "Modubex",
  },
  "performance.cacheReads": {
    key: "performance.cacheReads",
    category: "performance",
    label: "settings.fields.performance.cacheReads",
    description: "settings.fields.performance.cacheReadsDescription",
    schema: settingSchemas["performance.cacheReads"],
    default: true,
    entitlement: "settings.advancedPerformance",
  },
  "localization.defaultLocale": {
    key: "localization.defaultLocale",
    category: "localization",
    label: "settings.fields.localization.defaultLocale",
    schema: settingSchemas["localization.defaultLocale"],
    default: defaultLocale,
  },
  "security.passwordMinLength": {
    key: "security.passwordMinLength",
    category: "security",
    label: "settings.fields.security.passwordMinLength",
    schema: settingSchemas["security.passwordMinLength"],
    default: passwordMinDefault,
  },
  "security.passwordMaxLength": {
    key: "security.passwordMaxLength",
    category: "security",
    label: "settings.fields.security.passwordMaxLength",
    schema: settingSchemas["security.passwordMaxLength"],
    default: passwordMaxDefault,
  },
  "security.requireNumber": {
    key: "security.requireNumber",
    category: "security",
    label: "settings.fields.security.requireNumber",
    schema: settingSchemas["security.requireNumber"],
    default: env.AUTH_PASSWORD_REQUIRE_NUMBER,
  },
  "security.requireSymbol": {
    key: "security.requireSymbol",
    category: "security",
    label: "settings.fields.security.requireSymbol",
    schema: settingSchemas["security.requireSymbol"],
    default: env.AUTH_PASSWORD_REQUIRE_SYMBOL,
  },
  "security.requireTwoFactor": {
    key: "security.requireTwoFactor",
    category: "security",
    label: "settings.fields.security.requireTwoFactor",
    description: "settings.fields.security.requireTwoFactorDescription",
    schema: settingSchemas["security.requireTwoFactor"],
    default: env.AUTH_2FA_REQUIRED,
  },
  "audit.retentionDays": {
    key: "audit.retentionDays",
    category: "audit",
    label: "settings.fields.audit.retentionDays",
    schema: settingSchemas["audit.retentionDays"],
    default: env.AUDIT_RETENTION_DAYS,
  },
  "workspace.timeZone": {
    key: "workspace.timeZone",
    category: "workspace",
    label: "settings.fields.workspace.timeZone",
    schema: settingSchemas["workspace.timeZone"],
    default: "UTC",
  },
} satisfies SettingDefinitionMap;

/** Editable descriptors. Infrastructure metadata is intentionally separate. */
export const settingsRegistry: readonly SettingDescriptor[] = Object.freeze(
  Object.values(settingDefinitions) as SettingDescriptor[],
);

export const infrastructureKeys = [
  "infrastructure.databaseUrl",
  "infrastructure.authUrl",
  "infrastructure.authSecret",
  "infrastructure.passwordMinBootstrap",
  "infrastructure.auditRetentionBootstrap",
] as const;
export type InfrastructureKey = (typeof infrastructureKeys)[number];

/**
 * Env-backed, read-only descriptors. `configured` exposes only a masked
 * status; no environment value is ever stored in or returned from the registry.
 */
export type InfrastructureDescriptor = Omit<SettingDescriptor, "key" | "category" | "default"> & {
  key: InfrastructureKey;
  category: "infrastructure";
  default: undefined;
  infrastructure: true;
  configured: boolean;
};

export const infrastructureRegistry: readonly InfrastructureDescriptor[] = Object.freeze([
  {
    key: "infrastructure.databaseUrl",
    category: "infrastructure",
    label: "settings.fields.infrastructure.databaseUrl",
    schema: z.string(),
    default: undefined,
    infrastructure: true,
    sensitive: true,
    restartRequired: true,
    configured: Boolean(env.DATABASE_URL),
  },
  {
    key: "infrastructure.authUrl",
    category: "infrastructure",
    label: "settings.fields.infrastructure.authUrl",
    schema: z.string(),
    default: undefined,
    infrastructure: true,
    restartRequired: true,
    configured: Boolean(env.BETTER_AUTH_URL),
  },
  {
    key: "infrastructure.authSecret",
    category: "infrastructure",
    label: "settings.fields.infrastructure.authSecret",
    schema: z.string(),
    default: undefined,
    infrastructure: true,
    sensitive: true,
    restartRequired: true,
    configured: Boolean(env.BETTER_AUTH_SECRET),
  },
  {
    key: "infrastructure.passwordMinBootstrap",
    category: "infrastructure",
    label: "settings.fields.infrastructure.passwordMinBootstrap",
    schema: z.number(),
    default: undefined,
    infrastructure: true,
    restartRequired: true,
    configured: true,
  },
  {
    key: "infrastructure.auditRetentionBootstrap",
    category: "infrastructure",
    label: "settings.fields.infrastructure.auditRetentionBootstrap",
    schema: z.number(),
    default: undefined,
    infrastructure: true,
    configured: true,
  },
]);

const infrastructureKeySet: ReadonlySet<string> = new Set<string>(infrastructureKeys);

export function isSettingKey(value: string): value is SettingKey {
  return Object.prototype.hasOwnProperty.call(settingDefinitions, value);
}

export function isInfrastructureKey(value: string): value is InfrastructureKey {
  return infrastructureKeySet.has(value);
}

export function getSettingDescriptor<K extends SettingKey>(key: K): EditableSettingDescriptor<K> {
  const descriptor = settingDefinitions[key] as EditableSettingDescriptor<K> | undefined;
  if (!descriptor) throw new Error(`Unknown setting key: ${key}`);
  return descriptor;
}

export function getSettingDefault<K extends SettingKey>(key: K): SettingValue<K> {
  return getSettingDescriptor(key).default;
}

export function parseSettingValue<K extends SettingKey>(key: K, value: unknown): SettingValue<K> {
  return getSettingDescriptor(key).schema.parse(value) as SettingValue<K>;
}

export function safeParseSettingValue<K extends SettingKey>(key: K, value: unknown) {
  return getSettingDescriptor(key).schema.safeParse(value);
}

export function defaultSettingValues(): Record<SettingKey, unknown> {
  const values = {} as Record<SettingKey, unknown>;
  for (const key of settingKeys) values[key] = getSettingDefault(key);
  return values;
}
