import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  canTransition,
  findDependencyCycle,
  findEnabledDependents,
  findUnmetDependencies,
} from "@/core/modules/dependencies";
import { moduleManifestSchema, type ModuleManifest } from "@/core/modules/manifest";
import type { ModuleState } from "@/core/modules/state";

function makeManifest(id: string, dependencies: readonly string[] = []): ModuleManifest {
  return moduleManifestSchema.parse({
    id,
    name: `${id} module`,
    description: `Dependency test module ${id}.`,
    version: "1.0.0",
    author: "Modubex tests",
    icon: "puzzle",
    dependencies: [...dependencies],
    permissions: [{ key: `${id}.read`, description: `Read ${id} data.` }],
    routes: [{ key: "overview", path: "", labelKey: `modules.${id}.overview` }],
    settingsSchema: z.object({ enabled: z.boolean() }),
    ownedModels: [],
    migrations: [],
  });
}

describe("findUnmetDependencies", () => {
  const manifest = makeManifest("demo", ["core-a", "core-b"]);

  it("treats installed and enabled dependencies as satisfied", () => {
    const states: Record<string, ModuleState> = { "core-a": "installed", "core-b": "enabled" };
    expect(findUnmetDependencies(manifest, states)).toEqual([]);
  });

  it("reports missing, available, or disabled dependencies", () => {
    const states: Record<string, ModuleState> = { "core-a": "available", "core-b": "disabled" };
    expect(findUnmetDependencies(manifest, states)).toEqual(["core-a", "core-b"]);
  });
});

describe("findEnabledDependents", () => {
  const manifests = [
    makeManifest("base"),
    makeManifest("first", ["base"]),
    makeManifest("second", ["base"]),
    makeManifest("third", ["first"]),
  ];

  it("returns only enabled direct dependents", () => {
    const states: Record<string, ModuleState> = {
      base: "enabled",
      first: "enabled",
      second: "installed",
      third: "enabled",
    };
    expect(findEnabledDependents("base", manifests, states)).toEqual(["first"]);
    expect(findEnabledDependents("first", manifests, states)).toEqual(["third"]);
  });
});

describe("canTransition", () => {
  it("allows install, enable, disable, re-enable, and uninstall flows", () => {
    expect(canTransition("available", "installed")).toBe(true);
    expect(canTransition("installed", "enabled")).toBe(true);
    expect(canTransition("enabled", "disabled")).toBe(true);
    expect(canTransition("disabled", "enabled")).toBe(true);
    expect(canTransition("disabled", "available")).toBe(true);
    expect(canTransition("enabled", "available")).toBe(true);
  });

  it("rejects invalid and no-op transitions", () => {
    expect(canTransition("available", "enabled")).toBe(false);
    expect(canTransition("available", "disabled")).toBe(false);
    expect(canTransition("enabled", "enabled")).toBe(false);
    expect(canTransition("disabled", "installed")).toBe(false);
  });
});

describe("findDependencyCycle", () => {
  it("returns null for an acyclic graph", () => {
    expect(
      findDependencyCycle([
        makeManifest("base"),
        makeManifest("first", ["base"]),
        makeManifest("second", ["first"]),
      ]),
    ).toBeNull();
  });

  it("reports self-dependencies and multi-module cycles", () => {
    expect(findDependencyCycle([makeManifest("solo", ["solo"])])).toEqual(["solo", "solo"]);
    expect(
      findDependencyCycle([makeManifest("a", ["b"]), makeManifest("b", ["a"])]),
    ).not.toBeNull();
  });
});
