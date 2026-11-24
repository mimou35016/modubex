import { withEnglishFallback } from "@/core/i18n/fallback";
import { defaultLocale, type Locale } from "@/core/i18n/locales";
import type { ModuleDefinition } from "./manifest";
import { getModuleDefinition, getModuleManifests } from "./registry";

type MessageTree = Record<string, unknown>;

function isMessageTree(value: unknown): value is MessageTree {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Deep merge where the base (core) tree always wins on key conflicts. */
export function mergeWithCorePrecedence(base: MessageTree, overlay: MessageTree): MessageTree {
  const result: MessageTree = { ...base };
  for (const [key, value] of Object.entries(overlay)) {
    if (!(key in result)) {
      result[key] = value;
      continue;
    }
    if (isMessageTree(result[key]) && isMessageTree(value)) {
      result[key] = mergeWithCorePrecedence(result[key], value);
    }
  }
  return result;
}

async function loadLocaleMessages(
  definition: ModuleDefinition,
  locale: Locale,
): Promise<MessageTree> {
  const loader = definition.messages[locale];
  if (!loader) return {};

  try {
    const loaded: unknown = await loader();
    return isMessageTree(loaded) ? loaded : {};
  } catch {
    // A broken loader is equivalent to no messages for that locale.
    return {};
  }
}

async function loadModuleMessages(moduleId: string, locale: Locale): Promise<MessageTree> {
  const definition = getModuleDefinition(moduleId);
  if (!definition) return {};

  const namespace = definition.manifest.messageNamespace ?? moduleId;
  const [english, localized] = await Promise.all([
    loadLocaleMessages(definition, defaultLocale),
    loadLocaleMessages(definition, locale),
  ]);
  const messages = locale === defaultLocale ? english : withEnglishFallback(english, localized);

  return { modules: { [namespace]: messages } };
}

/**
 * Deep-merges enabled module message trees into the core messages. Core keys
 * always take precedence; each module's locale tree falls back to that module's
 * English messages key by key. When `enabledModuleIds` is omitted, all
 * registered modules are included.
 */
export async function mergeModuleMessages(
  locale: Locale,
  baseMessages: MessageTree,
  enabledModuleIds?: readonly string[],
): Promise<MessageTree> {
  const allIds = getModuleManifests().map((manifest) => manifest.id);
  const allowed = enabledModuleIds ? new Set(enabledModuleIds) : undefined;
  let merged: MessageTree = baseMessages;

  for (const moduleId of allIds) {
    if (allowed && !allowed.has(moduleId)) continue;
    const messages = await loadModuleMessages(moduleId, locale);
    merged = mergeWithCorePrecedence(merged, messages);
  }
  return merged;
}
