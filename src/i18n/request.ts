import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { defaultLocale, isLocale } from "@/core/i18n/locales";
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

  const messages = (await import(`@/core/i18n/messages/${locale}.json`)).default;

  return { locale, messages, timeZone: "UTC" };
});
