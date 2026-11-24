import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  moduleManifestSchema,
  type ModuleDefinition,
  type ModuleRouteProps,
} from "@/core/modules/manifest";
import {
  getModuleDefinition,
  getModuleManifest,
  getModuleManifests,
  moduleDefinitions,
  validateModuleDefinitions,
} from "@/core/modules/registry";

function Route(): null {
  return null;
}

function makeDefinition(
  id: string,
  overrides: Partial<ReturnType<typeof baseManifest>> = {},
  options: { skipManifestValidation?: boolean } = {},
): ModuleDefinition {
  const manifest = options.skipManifestValidation
    ? ({ ...baseManifest(id), ...overrides } as ModuleDefinition["manifest"])
    : moduleManifestSchema.parse({ ...baseManifest(id), ...overrides });
  const routes: Record<string, typeof Route> = {};
  for (const route of manifest.routes) routes[route.key] = Route;
  return {
    manifest,
    routes,
    messages: {
      en: async () => ({}),
      fr: async () => ({}),
      ar: async () => ({}),
    },
  };
}

function baseManifest(id: string) {
  return {
    id,
    name: `${id} module`,
    description: `Registry test module ${id}.`,
    version: "1.0.0",
    author: "Modubex tests",
    icon: "puzzle",
    dependencies: [] as string[],
    permissions: [{ key: `${id}.read`, description: `Read ${id} data.` }],
    routes: [{ key: "overview", path: "", labelKey: `modules.${id}.overview` }],
    settingsSchema: z.object({ enabled: z.boolean() }),
    ownedModels: [] as string[],
    migrations: [] as string[],
  };
}

const routeProps: ModuleRouteProps = { moduleId: "demo", slug: [] };
expectTypeOfRoute(routeProps);

function expectTypeOfRoute(_props: ModuleRouteProps): void {
  // Compile-time contract check for the frozen route props shape.
  void _props;
}

describe("generated module registry", () => {
  it("exposes only validated definitions with unique ids", () => {
    expect(Array.isArray(moduleDefinitions)).toBe(true);
    expect(() => validateModuleDefinitions(moduleDefinitions)).not.toThrow();
    const ids = moduleDefinitions.map((definition) => definition.manifest.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("resolves definitions and manifests by id", () => {
    for (const definition of moduleDefinitions) {
      expect(getModuleDefinition(definition.manifest.id)).toBe(definition);
      expect(getModuleManifest(definition.manifest.id)).toBe(definition.manifest);
    }
    expect(getModuleDefinition("unknown-module-xyz")).toBeUndefined();
    expect(getModuleManifest("unknown-module-xyz")).toBeUndefined();
  });

  it("returns the validated manifest list", () => {
    expect(getModuleManifests().map((manifest) => manifest.id)).toEqual(
      moduleDefinitions.map((definition) => definition.manifest.id),
    );
  });
});

describe("registry validation", () => {
  it("rejects duplicate module ids", () => {
    const definition = makeDefinition("demo");
    expect(() => validateModuleDefinitions([definition, makeDefinition("demo")])).toThrow(
      /Duplicate module id/,
    );
  });

  it("rejects duplicate route keys and route paths", () => {
    const duplicateKeys = makeDefinition("demo", {
      routes: [
        { key: "overview", path: "", labelKey: "a" },
        { key: "overview", path: "other", labelKey: "b" },
      ],
    });
    expect(() => validateModuleDefinitions([duplicateKeys])).toThrow(/Duplicate route key/);

    const duplicatePaths = makeDefinition("demo", {
      routes: [
        { key: "overview", path: "", labelKey: "a" },
        { key: "home", path: "", labelKey: "b" },
      ],
    });
    expect(() => validateModuleDefinitions([duplicatePaths])).toThrow(/Duplicate route path/);
  });

  it("rejects duplicate or unprefixed permission keys", () => {
    const duplicated = makeDefinition("demo", {
      permissions: [
        { key: "demo.read", description: "Read." },
        { key: "demo.read", description: "Read again." },
      ],
    });
    expect(() => validateModuleDefinitions([duplicated])).toThrow(/Duplicate permission key/);

    const unprefixed = makeDefinition(
      "demo",
      {
        permissions: [{ key: "other.read", description: "Wrong prefix." }],
        routes: [],
      },
      { skipManifestValidation: true },
    );
    expect(() => validateModuleDefinitions([unprefixed])).toThrow(/Permission keys must begin/);
  });

  it("rejects self-dependencies, cycles, and unknown dependencies", () => {
    expect(() =>
      validateModuleDefinitions([makeDefinition("demo", { dependencies: ["demo"] })]),
    ).toThrow(/dependency cycle/);
    expect(() =>
      validateModuleDefinitions([
        makeDefinition("a", { dependencies: ["b"] }),
        makeDefinition("b", { dependencies: ["a"] }),
      ]),
    ).toThrow(/dependency cycle/);
    expect(() =>
      validateModuleDefinitions([makeDefinition("demo", { dependencies: ["missing"] })]),
    ).toThrow(/unknown module/);
  });
});
