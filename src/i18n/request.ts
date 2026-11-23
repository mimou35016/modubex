import { cookies } from "next/headers";
import type { AbstractIntlMessages } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { defaultLocale, isLocale } from "@/core/i18n/locales";
import { mergeModuleMessages } from "@/core/modules/messages";
import { getModuleManifests } from "@/core/modules/registry";
import { getModuleStates } from "@/core/modules/state";
import { getDefaultLocale } from "@/core/settings/service";

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const requested = cookieStore.get("NEXT_LOCALE")?.value;
  let locale = defaultLocale;

  if (isLocale(requested)) {
    locale = requested;
  } else {
    try {
      const configured = await getDefaultLocale();
      if (isLocale(configured)) locale = configured;
    } catch {
      // The database may not be available during bootstrap; keep the static default.
    }
  }

  let baseMessages: Record<string, unknown> = {};
  try {
    baseMessages = (await import(`@/core/i18n/messages/${locale}.json`)).default as Record<
      string,
      unknown
    >;
  } catch {
    // Bootstrap fallback: no core message file yet, module trees still merge.
  }

  let enabledModuleIds: readonly string[] = [];
  if (getModuleManifests().length > 0) {
    try {
      const states = await getModuleStates();
      enabledModuleIds = Object.entries(states)
        .filter(([, state]) => state === "enabled")
        .map(([id]) => id);
    } catch {
      // Module state is unavailable during bootstrap; keep core-only messages.
      enabledModuleIds = [];
    }
  }

  const messages = await mergeModuleMessages(locale, baseMessages, enabledModuleIds);
  return { locale, messages: messages as AbstractIntlMessages, timeZone: "UTC" };
});
