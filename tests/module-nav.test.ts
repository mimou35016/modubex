import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { ModuleManifest } from "@/core/modules/manifest";
import type { ModuleView } from "@/core/modules/state";

const { getModuleViews } = vi.hoisted(() => ({ getModuleViews: vi.fn() }));

vi.mock("@/core/modules/state", () => ({ getModuleViews }));

import { getModuleNavLinks } from "@/core/modules/nav";

type Route = ModuleManifest["routes"][number];

type SidebarOptions = {
  permission?: string;
  labelKey?: string;
  icon?: string;
  order?: number;
};

function sidebarRoute(key: string, path: string, options: SidebarOptions = {}): Route {
  return {
    key,
    path,
    labelKey: "modules.faq.routes.label",
    ...(options.permission ? { permission: options.permission } : {}),
    sidebar: {
      labelKey: options.labelKey ?? `modules.faq.sidebar.${key}`,
      icon: options.icon ?? "CircleHelp",
      ...(options.order === undefined ? {} : { order: options.order }),
    },
  };
}

function plainRoute(key: string, path: string): Route {
  return { key, path, labelKey: `modules.faq.routes.${key}` };
}

function makeView(
  moduleId: string,
  state: ModuleView["state"],
  routes: readonly Route[],
): ModuleView {
  const manifest: ModuleManifest = {
    id: moduleId,
    name: `${moduleId} module`,
    description: `${moduleId} test module`,
    version: "1.0.0",
    author: "Modubex tests",
    icon: "Blocks",
    dependencies: [],
    permissions: [],
    routes: [...routes],
    settingsSchema: z.object({}),
    ownedModels: [],
    migrations: [],
  };

  return {
    manifest,
    state,
    version: "1.0.0",
    config: {},
    installedById: null,
    installedAt: null,
    enabledAt: state === "enabled" ? new Date(0) : null,
    disabledAt: null,
    uninstalledAt: null,
    dataRetained: false,
  };
}

beforeEach(() => {
  getModuleViews.mockReset();
});

describe("getModuleNavLinks", () => {
  it("includes only enabled modules and routes with sidebar metadata", async () => {
    getModuleViews.mockResolvedValue([
      makeView("faq", "enabled", [
        sidebarRoute("questions", "questions"),
        plainRoute("hidden", "hidden"),
      ]),
      makeView("disabled-mod", "disabled", [sidebarRoute("questions", "questions")]),
      makeView("installed-mod", "installed", [sidebarRoute("questions", "questions")]),
      makeView("available-mod", "available", [sidebarRoute("questions", "questions")]),
    ]);

    const links = await getModuleNavLinks([]);

    expect(links.map((link) => link.moduleId)).toEqual(["faq"]);
    expect(links.map((link) => link.key)).toEqual(["questions"]);
  });

  it("filters routes by declared permission and allows undeclared routes", async () => {
    getModuleViews.mockResolvedValue([
      makeView("faq", "enabled", [
        sidebarRoute("public", "", { order: 1 }),
        sidebarRoute("read", "read", { permission: "faq.read", order: 2 }),
        sidebarRoute("manage", "manage", { permission: "faq.manage", order: 3 }),
      ]),
    ]);

    const links = await getModuleNavLinks(["faq.read"]);

    expect(links.map((link) => link.key)).toEqual(["public", "read"]);
    expect(await getModuleNavLinks([]).then((items) => items.map((item) => item.key))).toEqual([
      "public",
    ]);
  });

  it("builds hrefs from the module root and declared path, passing metadata through", async () => {
    getModuleViews.mockResolvedValue([
      makeView("faq", "enabled", [
        sidebarRoute("questions", "questions", {
          labelKey: "modules.faq.sidebar.questions",
          icon: "CircleHelp",
          order: 10,
        }),
        sidebarRoute("home", "", {
          labelKey: "modules.faq.sidebar.home",
          icon: "Pencil",
          order: 2,
        }),
      ]),
    ]);

    expect(await getModuleNavLinks([])).toEqual([
      {
        moduleId: "faq",
        key: "home",
        href: "/modules/run/faq",
        labelKey: "modules.faq.sidebar.home",
        icon: "Pencil",
        order: 2,
      },
      {
        moduleId: "faq",
        key: "questions",
        href: "/modules/run/faq/questions",
        labelKey: "modules.faq.sidebar.questions",
        icon: "CircleHelp",
        order: 10,
      },
    ]);
  });

  it("sorts by order, then module id, then route key", async () => {
    getModuleViews.mockResolvedValue([
      makeView("zeta", "enabled", [
        sidebarRoute("b", "b", { order: 5 }),
        sidebarRoute("a", "a", { order: 5 }),
      ]),
      makeView("alpha", "enabled", [
        sidebarRoute("z", "z", { order: 5 }),
        sidebarRoute("a", "a", { order: 5 }),
        sidebarRoute("early", "early", { order: 1 }),
      ]),
      makeView("beta", "enabled", [sidebarRoute("default", "default")]),
    ]);

    const links = await getModuleNavLinks([]);

    expect(links.map((link) => `${link.moduleId}/${link.key}`)).toEqual([
      "beta/default",
      "alpha/early",
      "alpha/a",
      "alpha/z",
      "zeta/a",
      "zeta/b",
    ]);
  });

  it("emits no duplicate route keys or hrefs", async () => {
    getModuleViews.mockResolvedValue([
      makeView("faq", "enabled", [
        sidebarRoute("questions", "questions", { order: 1 }),
        sidebarRoute("questions", "questions", { order: 2 }),
        sidebarRoute("alias", "questions", { order: 3 }),
      ]),
    ]);

    const links = await getModuleNavLinks([]);

    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ key: "questions", href: "/modules/run/faq/questions" });
  });

  it("returns an empty list when no module qualifies", async () => {
    getModuleViews.mockResolvedValue([]);
    expect(await getModuleNavLinks(["faq.read"])).toEqual([]);

    getModuleViews.mockResolvedValue([makeView("faq", "enabled", [plainRoute("hidden", "")])]);
    expect(await getModuleNavLinks([])).toEqual([]);
  });
});
