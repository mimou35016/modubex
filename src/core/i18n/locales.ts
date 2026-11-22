import { z } from "zod";

const localeSchema = z.object({
  code: z.enum(["en", "fr", "ar"]),
  label: z.string().min(1),
  dir: z.enum(["ltr", "rtl"]),
});

export const locales = localeSchema.array().min(1).parse([
  { code: "en", label: "English", dir: "ltr" },
  { code: "fr", label: "Français", dir: "ltr" },
  { code: "ar", label: "العربية", dir: "rtl" },
]);

export type Locale = (typeof locales)[number]["code"];
export type LocaleConfig = (typeof locales)[number];

export const defaultLocale: Locale = "en";

export function isLocale(value: string | undefined): value is Locale {
  return locales.some((locale) => locale.code === value);
}

export function getLocaleConfig(locale: Locale): LocaleConfig {
  const config = locales.find((entry) => entry.code === locale);
  if (!config) throw new Error(`Unregistered locale: ${locale}`);
  return config;
}
