import { describe, expect, it } from "vitest";
import { buildBreadcrumbTrail } from "@/components/layout/breadcrumb-trail";

const labels = {
  "/": "Overview",
  "/users": "Users and roles",
  "/users/*": "Account",
  "/settings": "Settings",
  "/settings/security": "Security",
  "/modules": "App store",
  "/modules/run": "",
  "/modules/run/faq": "FAQ",
  "/modules/run/faq/manage": "Manage",
};

describe("buildBreadcrumbTrail", () => {
  it("shows the root and overview on the home page", () => {
    expect(buildBreadcrumbTrail("/", "Foundation", labels)).toEqual([
      { href: "/", label: "Foundation" },
      { href: "/", label: "Overview" },
    ]);
  });

  it("uses translated segment labels for nested pages", () => {
    expect(buildBreadcrumbTrail("/settings/security", "Foundation", labels)).toEqual([
      { href: "/", label: "Foundation" },
      { href: "/settings", label: "Settings" },
      { href: "/settings/security", label: "Security" },
    ]);
  });

  it("uses the wildcard label for dynamic route ids", () => {
    expect(buildBreadcrumbTrail("/users/abc123", "Foundation", labels)).toEqual([
      { href: "/", label: "Foundation" },
      { href: "/users", label: "Users and roles" },
      { href: "/users/abc123", label: "Account" },
    ]);
  });

  it("resolves module routes from the current path", () => {
    expect(buildBreadcrumbTrail("/modules/run/faq/manage", "Foundation", labels)).toEqual([
      { href: "/", label: "Foundation" },
      { href: "/modules", label: "App store" },
      { href: "/modules/run/faq", label: "FAQ" },
      { href: "/modules/run/faq/manage", label: "Manage" },
    ]);
  });
});
