import { getLocale } from "next-intl/server";
import { defaultLocale, isLocale } from "@/core/i18n/locales";
import { mergeModuleMessages } from "@/core/modules/messages";
import type { ModuleSettingField, ModuleSettingFieldType } from "./module-field-types";
import { asModuleRecord, translateWithFallback, type ModuleTranslator } from "./module-view";

type UnknownRecord = Record<string, unknown>;

const wrapperTypes = new Set([
  "optional",
  "default",
  "nullable",
  "readonly",
  "nonoptional",
  "catch",
  "prefault",
  "brand",
]);

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function lookupMessage(tree: UnknownRecord, key: string): string | undefined {
  let current: unknown = tree;
  for (const segment of key.split(".")) {
    const record = asModuleRecord(current);
    if (!record || !Object.prototype.hasOwnProperty.call(record, segment)) return undefined;
    current = record[segment];
  }
  return typeof current === "string" ? current : undefined;
}

/**
 * Overlays bundled module messages on the core translator. Core keys still win;
 * passing no ids includes every registered module (needed for disabled modules,
 * whose messages are not part of the request-level enabled-only merge).
 */
export async function withModuleMessages(
  base: ModuleTranslator,
  moduleIds?: readonly string[],
): Promise<ModuleTranslator> {
  const rawLocale = await getLocale();
  const locale = isLocale(rawLocale) ? rawLocale : defaultLocale;
  const overlay = await mergeModuleMessages(locale, {}, moduleIds);

  const translate = (key: string, values?: Record<string, string | number>) =>
    base.has(key) ? base(key, values) : (lookupMessage(overlay, key) ?? base(key, values));

  return Object.assign(translate, {
    has: (key: string) => base.has(key) || lookupMessage(overlay, key) !== undefined,
  });
}

function descriptionOf(schema: unknown): string | undefined {
  const source = asModuleRecord(schema);
  return asString(source?.description) ?? asString(asModuleRecord(source?.def)?.description);
}

type InspectedField = {
  type: ModuleSettingFieldType;
  options?: string[];
  required: boolean;
  defaultValue?: unknown;
  description?: string;
};

function inspectSchema(schema: unknown): InspectedField {
  let current = schema;
  let required = true;
  let defaultValue: unknown;
  let description = descriptionOf(current);

  for (let depth = 0; depth < 8; depth += 1) {
    const def = asModuleRecord(asModuleRecord(current)?.def);
    if (!def) break;
    const type = asString(def.type);
    if (!type || !wrapperTypes.has(type)) break;

    description = description ?? descriptionOf(current);
    if (type === "optional" || type === "nullable" || type === "prefault" || type === "catch") {
      required = false;
    }
    if (type === "default") {
      required = false;
      defaultValue = def.defaultValue;
    }

    const inner = def.innerType ?? def.wrapped;
    if (!inner) break;
    current = inner;
  }

  const def = asModuleRecord(asModuleRecord(current)?.def) ?? {};
  const zodType = asString(def.type) ?? "string";

  if (zodType === "boolean") return { type: "boolean", required, defaultValue, description };
  if (zodType === "number") return { type: "number", required, defaultValue, description };
  if (zodType === "enum") {
    const entries = asModuleRecord(def.entries);
    const values = Array.isArray(def.values) ? def.values : [];
    const options = entries
      ? Object.keys(entries)
      : values.flatMap((value) => (typeof value === "string" ? [value] : []));
    return { type: "enum", options, required, defaultValue, description };
  }
  if (zodType === "literal") {
    const value = def.values;
    return {
      type: "enum",
      options: typeof value === "string" || typeof value === "number" ? [String(value)] : [],
      required,
      defaultValue,
      description,
    };
  }
  if (zodType === "union" && Array.isArray(def.options)) {
    const options = def.options.flatMap((option) => {
      const literal = asModuleRecord(asModuleRecord(option)?.def);
      const value = literal?.values;
      return typeof value === "string" || typeof value === "number" ? [String(value)] : [];
    });
    if (options.length > 0) return { type: "enum", options, required, defaultValue, description };
  }

  return { type: "string", required, defaultValue, description };
}

function resolvedValue(raw: unknown, field: InspectedField): string | number | boolean {
  if (field.type === "boolean") {
    if (typeof raw === "boolean") return raw;
    if (typeof raw === "number") return raw !== 0;
    if (typeof raw === "string") return raw === "true";
    return field.defaultValue === true;
  }
  if (field.type === "number") {
    const candidate = raw ?? field.defaultValue ?? 0;
    const parsed = typeof candidate === "number" ? candidate : Number(candidate);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  const candidate = raw ?? field.defaultValue;
  return candidate === undefined || candidate === null ? "" : String(candidate);
}

/** Extracts serializable field metadata from a module's zod settings schema on the server. */
export function buildModuleSettingsFields({
  t,
  messageNamespace,
  schema,
  config,
}: {
  t: ModuleTranslator;
  messageNamespace: string;
  schema: unknown;
  config: unknown;
}): ModuleSettingField[] {
  const object = asModuleRecord(schema);
  const shape = object?.shape ?? asModuleRecord(asModuleRecord(object?.def)?.shape);
  if (!shape || typeof shape !== "object") return [];

  const values = asModuleRecord(config) ?? {};

  return Object.entries(shape).map(([key, fieldSchema]) => {
    const field = inspectSchema(fieldSchema);
    const labelKeys = [
      `modules.${messageNamespace}.settings.fields.${key}.label`,
      `modules.${messageNamespace}.fields.${key}.label`,
      `modules.${messageNamespace}.settings.${key}.label`,
      `modules.${messageNamespace}.${key}.label`,
      `modules.${messageNamespace}.${key}`,
    ];
    const descriptionKeys = labelKeys.map((item) => item.replace(/\.label$/, ".description"));

    return {
      key,
      name: `config.${key}`,
      label: translateWithFallback(t, labelKeys, t("modules.fieldFallback", { key })),
      description: translateWithFallback(
        t,
        descriptionKeys,
        field.description ?? t("modules.fieldDescriptionFallback", { key }),
      ),
      value: resolvedValue(values[key], field),
      type: field.type,
      options: field.options,
      required: field.required,
    };
  });
}
