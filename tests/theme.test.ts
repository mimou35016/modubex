import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import { themeInitScript } from "@/core/theme/script";

type ThemeOption = "light" | "dark" | "system" | null;

function runThemeScript(stored: ThemeOption, prefersDark = false, storageAvailable = true) {
  const toggle = vi.fn();
  const getItem = vi.fn(() => {
    if (!storageAvailable) throw new Error("Storage blocked");
    return stored;
  });
  const matchMedia = vi.fn(() => ({ matches: prefersDark }));
  const style = { colorScheme: "" };

  runInNewContext(themeInitScript, {
    window: {
      localStorage: { getItem },
      matchMedia,
    },
    document: {
      documentElement: {
        classList: { toggle },
        style,
      },
    },
  });

  return { toggle, getItem, matchMedia, style };
}

describe("pre-paint theme script", () => {
  it("applies the stored light theme before paint", () => {
    const { toggle, style, matchMedia } = runThemeScript("light", true);

    expect(toggle).toHaveBeenCalledWith("dark", false);
    expect(style.colorScheme).toBe("light");
    expect(matchMedia).not.toHaveBeenCalled();
  });

  it("applies the stored dark theme before paint", () => {
    const { toggle, style, matchMedia } = runThemeScript("dark", false);

    expect(toggle).toHaveBeenCalledWith("dark", true);
    expect(style.colorScheme).toBe("dark");
    expect(matchMedia).not.toHaveBeenCalled();
  });

  it("resolves system theme with the dark color-scheme media query", () => {
    const dark = runThemeScript("system", true);
    expect(dark.matchMedia).toHaveBeenCalledWith("(prefers-color-scheme: dark)");
    expect(dark.toggle).toHaveBeenCalledWith("dark", true);
    expect(dark.style.colorScheme).toBe("dark");

    const light = runThemeScript("system", false);
    expect(light.matchMedia).toHaveBeenCalledWith("(prefers-color-scheme: dark)");
    expect(light.toggle).toHaveBeenCalledWith("dark", false);
    expect(light.style.colorScheme).toBe("light");
  });

  it("treats a missing or unknown stored theme as system", () => {
    const missing = runThemeScript(null, true);
    expect(missing.matchMedia).toHaveBeenCalledWith("(prefers-color-scheme: dark)");
    expect(missing.toggle).toHaveBeenCalledWith("dark", true);

    const unknown = runThemeScript("sepia" as ThemeOption, false);
    expect(unknown.matchMedia).toHaveBeenCalledWith("(prefers-color-scheme: dark)");
    expect(unknown.toggle).toHaveBeenCalledWith("dark", false);
  });

  it("is a no-op when localStorage is unavailable", () => {
    const { toggle, style, getItem } = runThemeScript("dark", false, false);

    expect(getItem).toHaveBeenCalledWith("theme");
    expect(toggle).not.toHaveBeenCalled();
    expect(style.colorScheme).toBe("");
  });
});
