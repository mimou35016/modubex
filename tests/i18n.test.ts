import { describe, expect, it } from "vitest";
import { defaultLocale, getLocaleConfig, isLocale, locales } from "@/core/i18n/locales";

describe("locale registry", () => {
  it("registers en, fr and ar with matching directions", () => {
    expect(locales.map((locale) => locale.code)).toEqual(["en", "fr", "ar"]);
    expect(getLocaleConfig("ar").dir).toBe("rtl");
    expect(getLocaleConfig("fr").dir).toBe("ltr");
  });

  it("rejects unknown locales and keeps a stable default", () => {
    expect(isLocale("de")).toBe(false);
    expect(isLocale(undefined)).toBe(false);
    expect(defaultLocale).toBe("en");
  });
});
