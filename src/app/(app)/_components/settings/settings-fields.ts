import { getTranslations } from "next-intl/server";
import { settingsRegistry, type SettingKey } from "@/core/settings/registry";
import type { SettingFieldMetadata, SettingFieldType } from "./settings-form";

function fieldType(key: SettingKey, descriptorDefault: unknown): SettingFieldType {
  if (typeof descriptorDefault === "boolean") return "boolean";
  if (typeof descriptorDefault === "number") return "number";
  if (key === "localization.defaultLocale") return "locale";
  if (key === "workspace.timeZone") return "timeZone";
  return "string";
}

function serializableValue(raw: unknown, descriptorDefault: unknown): string | number | boolean {
  if (typeof descriptorDefault === "boolean") return Boolean(raw);
  if (typeof descriptorDefault === "number") return Number(raw);
  return raw === undefined || raw === null ? "" : String(raw);
}

/** Resolves registry i18n keys into plain strings safe to pass to a client form. */
export async function buildSettingsFields(
  keys: readonly SettingKey[],
  values: Record<SettingKey, unknown>,
): Promise<SettingFieldMetadata[]> {
  const t = await getTranslations();

  return keys.map((key) => {
    const descriptor = settingsRegistry.find((item) => item.key === key);
    if (!descriptor) throw new Error(`Unknown setting key: ${key}`);

    return {
      key,
      label: t(descriptor.label),
      description: descriptor.description ? t(descriptor.description) : undefined,
      value: serializableValue(values[key], descriptor.default),
      type: fieldType(key, descriptor.default),
      sensitive: descriptor.sensitive,
      restartRequired: descriptor.restartRequired,
    };
  });
}
