import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { withEnglishFallback } from "@/core/i18n/fallback";
import type { Locale } from "@/core/i18n/locales";
import { moduleManifestSchema, type ModuleDefinition } from "@/core/modules/manifest";

const { getDefinition, getManifests } = vi.hoisted(() => ({
  getDefinition: vi.fn(),
  getManifests: vi.fn(),
}));

vi.mock("@/core/modules/registry", () => ({
  getModuleDefinition: getDefinition,
  getModuleManifests: getManifests,
}));

import { mergeModuleMessages } from "@/core/modules/messages";

type MessageLoader = () => Promise<Record<string, unknown>>;

function makeDefinition(messages: Partial<Record<Locale, MessageLoader>>): ModuleDefinition {
  const manifest = moduleManifestSchema.parse({
    id: "demo",
    name: "Demo module",
    description: "Message fallback test module.",
    version: "1.0.0",
    author: "Modubex tests",
    icon: "puzzle",
    dependencies: [],
    permissions: [],
    routes: [],
    settingsSchema: z.object({}),
    ownedModels: [],
    migrations: [],
  });

  return {
    manifest,
    routes: {},
    messages: {
      en: messages.en ?? (async () => ({})),
      fr: messages.fr ?? (async () => ({})),
      ar: messages.ar ?? (async () => ({})),
    },
  };
}

describe("withEnglishFallback", () => {
  it("deep-merges locale messages over English with locale precedence", () => {
    const english: Record<string, unknown> = {
      common: { save: "Save", cancel: "Cancel" },
      nested: { one: "one", two: "two" },
      list: [1, 2],
      enabled: true,
    };
    const locale: Record<string, unknown> = {
      common: { save: "Enregistrer" },
      nested: { two: "deux", three: "trois" },
      list: [3],
      enabled: false,
    };

    expect(withEnglishFallback(english, locale)).toEqual({
      common: { save: "Enregistrer", cancel: "Cancel" },
      nested: { one: "one", two: "deux", three: "trois" },
      list: [3],
      enabled: false,
    });
  });

  it("replaces non-plain values instead of merging them", () => {
    const english: Record<string, unknown> = {
      when: { from: "en", to: "en" },
      items: [1, 2],
    };
    const locale: Record<string, unknown> = {
      when: "now",
      items: [3],
    };

    expect(withEnglishFallback(english, locale)).toEqual({
      when: "now",
      items: [3],
    });
  });

  it("does not mutate either input tree", () => {
    const english: Record<string, unknown> = { group: { title: "English" }, list: ["en"] };
    const locale: Record<string, unknown> = { group: { subtitle: "Français" }, list: ["fr"] };
    const englishBefore = structuredClone(english);
    const localeBefore = structuredClone(locale);

    const merged = withEnglishFallback(english, locale);

    expect(merged).not.toBe(english);
    expect(merged).not.toBe(locale);
    expect(merged.group).not.toBe(english.group);
    expect(english).toEqual(englishBefore);
    expect(locale).toEqual(localeBefore);
  });

  it("returns English when the locale argument is nullish", () => {
    const english = { title: "English" };

    expect(withEnglishFallback(english, undefined as never)).toEqual(english);
    expect(withEnglishFallback(english, null as never)).toEqual(english);
  });
});

describe("module message fallback", () => {
  beforeEach(() => {
    getDefinition.mockReset();
    getManifests.mockReset();
    getManifests.mockReturnValue([{ id: "demo" }]);
  });

  it("falls back per key to the module's English messages", async () => {
    getDefinition.mockReturnValue(
      makeDefinition({
        en: async () => ({
          title: "Title",
          nested: { first: "First", second: "Second" },
          list: ["en"],
        }),
        fr: async () => ({
          title: "Titre",
          nested: { first: "Premier" },
        }),
      }),
    );

    await expect(mergeModuleMessages("fr", { core: "Core" })).resolves.toEqual({
      core: "Core",
      modules: {
        demo: {
          title: "Titre",
          nested: { first: "Premier", second: "Second" },
          list: ["en"],
        },
      },
    });
  });

  it("keeps core keys authoritative over module messages", async () => {
    getDefinition.mockReturnValue(
      makeDefinition({
        en: async () => ({
          title: "Module title",
          core: "Module core",
          extra: { fromModule: true },
        }),
        fr: async () => ({
          title: "Titre du module",
          core: "Module core fr",
        }),
      }),
    );

    await expect(
      mergeModuleMessages("fr", {
        core: "Core wins",
        modules: { demo: { title: "Existing module tree wins" } },
      }),
    ).resolves.toEqual({
      core: "Core wins",
      modules: {
        demo: {
          title: "Existing module tree wins",
          core: "Module core fr",
          extra: { fromModule: true },
        },
      },
    });
  });
});
