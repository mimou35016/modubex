import { defaultLocale, type Locale } from "@/core/i18n/locales";
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

async function loadModuleMessages(moduleId: string, locale: Locale): Promise<MessageTree> {
  const definition = getModuleDefinition(moduleId);
  if (!definition) return {};

  const namespace = definition.manifest.messageNamespace ?? moduleId;
  const loader = definition.messages[locale] ?? definition.messages[defaultLocale];
  let messages: MessageTree = {};
  if (loader) {
    try {
      const loaded: unknown = await loader();
      if (isMessageTree(loaded)) messages = loaded;
    } catch {
      // A missing or broken locale falls back to English below.
      messages = {};
    }
  }
  if (locale !== defaultLocale && Object.keys(messages).length === 0) {
    const fallback = definition.messages[defaultLocale];
    if (fallback) {
      try {
        const loaded: unknown = await fallback();
        if (isMessageTree(loaded)) messages = loaded;
      } catch {
        messages = {};
      }
    }
  }

  return { modules: { [namespace]: messages } };
}

/**
 * Deep-merges enabled module message trees into the core messages. Core keys
 * take precedence; a module without the requested locale uses English.
 * When `enabledModuleIds` is omitted, all registered modules are included.
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
