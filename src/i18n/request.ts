import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { defaultLocale, isLocale } from "@/core/i18n/locales";

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const requested = cookieStore.get("NEXT_LOCALE")?.value;
  const locale = isLocale(requested) ? requested : defaultLocale;
  const messages = (await import(`@/core/i18n/messages/${locale}.json`)).default;

  return { locale, messages, timeZone: "UTC" };
});
