import { locales } from "@/core/i18n/locales";
import { readinessSnapshot } from "./readiness.generated";

export type ReadinessCheck = {
  id: "lockfile" | "scripts" | "ci" | "database" | "locales" | "prisma";
  ready: boolean;
  detail: string;
};

/**
 * Reports build-time repository facts from the committed snapshot plus
 * request-time environment facts. It performs no filesystem access, so the
 * dashboard remains accurate on ephemeral serverless filesystems.
 */
export function getFoundationReadiness() {
  const {
    version,
    requiredScripts,
    scriptsConfigured,
    lockfilePresent,
    ciPresent,
    prismaGenerated,
    milestones,
    currentMilestone,
  } = readinessSnapshot;

  const databaseReady = Boolean(process.env.DATABASE_URL);
  const checks: ReadinessCheck[] = [
    {
      id: "lockfile",
      ready: lockfilePresent,
      detail: "package-lock.json",
    },
    {
      id: "scripts",
      ready: scriptsConfigured === requiredScripts.length,
      detail: `${scriptsConfigured}/${requiredScripts.length} required scripts present`,
    },
    {
      id: "ci",
      ready: ciPresent,
      detail: ".github/workflows/ci.yml",
    },
    {
      id: "database",
      ready: databaseReady,
      detail: databaseReady ? "DATABASE_URL set" : "DATABASE_URL not set",
    },
    {
      id: "locales",
      ready: locales.length >= 3,
      detail: `${locales.length} registered locales`,
    },
    {
      id: "prisma",
      ready: prismaGenerated,
      detail: prismaGenerated ? "Prisma client generated" : "Prisma client not generated",
    },
  ];

  return {
    checks,
    milestones: milestones.length > 0 ? milestones : ["M0"],
    currentMilestone,
    version,
  };
}
