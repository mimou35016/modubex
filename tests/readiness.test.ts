import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getFoundationReadiness } from "@/core/foundation/readiness";
import { readinessSnapshot } from "@/core/foundation/readiness.generated";
import { collectReadinessSnapshot } from "../scripts/generate-readiness";

function readinessCheck(id: string) {
  const check = getFoundationReadiness().checks.find((item) => item.id === id);
  if (!check) throw new Error(`Missing readiness check: ${id}`);
  return check;
}

describe("foundation readiness", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps the committed snapshot in sync with repository facts", () => {
    expect(readinessSnapshot).toEqual(collectReadinessSnapshot());
  });

  it("has no filesystem or cwd dependency in the runtime seam", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src", "core", "foundation", "readiness.ts"),
      "utf8",
    );
    expect(source).not.toContain("node:fs");
    expect(source).not.toContain("readFileSync");
    expect(source).not.toContain("existsSync");
    expect(source).not.toContain("process.cwd()");

    const cwd = vi.spyOn(process, "cwd");
    const result = getFoundationReadiness();
    expect(cwd).not.toHaveBeenCalled();
    expect(result.version).toBe(readinessSnapshot.version);
    expect(result.milestones).toEqual(readinessSnapshot.milestones);
    expect(result.currentMilestone).toBe(readinessSnapshot.currentMilestone);
  });

  it("maps every build-time fact to a real readiness check", () => {
    expect(readinessCheck("lockfile")).toEqual({
      id: "lockfile",
      ready: readinessSnapshot.lockfilePresent,
      detail: "package-lock.json",
    });
    expect(readinessCheck("scripts")).toEqual({
      id: "scripts",
      ready: readinessSnapshot.scriptsConfigured === readinessSnapshot.requiredScripts.length,
      detail: `${readinessSnapshot.scriptsConfigured}/${readinessSnapshot.requiredScripts.length} required scripts present`,
    });
    expect(readinessCheck("ci")).toEqual({
      id: "ci",
      ready: readinessSnapshot.ciPresent,
      detail: ".github/workflows/ci.yml",
    });
    expect(readinessCheck("locales")).toEqual({
      id: "locales",
      ready: true,
      detail: "3 registered locales",
    });
    expect(readinessCheck("prisma")).toEqual({
      id: "prisma",
      ready: readinessSnapshot.prismaGenerated,
      detail: readinessSnapshot.prismaGenerated
        ? "Prisma client generated"
        : "Prisma client not generated",
    });
  });

  it("derives the database check from the configured environment only", () => {
    const original = process.env.DATABASE_URL;
    try {
      process.env.DATABASE_URL = "configured";
      expect(readinessCheck("database")).toEqual({
        id: "database",
        ready: true,
        detail: "DATABASE_URL set",
      });

      delete process.env.DATABASE_URL;
      expect(readinessCheck("database")).toEqual({
        id: "database",
        ready: false,
        detail: "DATABASE_URL not set",
      });
    } finally {
      if (original === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = original;
    }
  });
});
