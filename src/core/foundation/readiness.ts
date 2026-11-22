import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { locales } from "@/core/i18n/locales";

export type ReadinessCheck = {
  id: "lockfile" | "scripts" | "ci" | "database" | "locales" | "prisma";
  ready: boolean;
  detail: string;
};

const requiredScripts = [
  "dev",
  "build",
  "start",
  "lint",
  "typecheck",
  "format",
  "test",
  "i18n:check",
  "db:migrate",
  "db:seed",
];

function readFile(file: string): string | null {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

export function getFoundationReadiness() {
  const root = process.cwd();
  const packageFile = path.join(root, "package.json");
  const rawPackage = readFile(packageFile) ?? "{}";
  const manifest = JSON.parse(rawPackage) as {
    version?: string;
    scripts?: Record<string, string>;
  };
  const scripts = manifest.scripts ?? {};
  const configured = requiredScripts.filter((name) => Boolean(scripts[name]));

  const tasksFile = readFile(path.join(root, "docs", "tasks.md")) ?? "";
  const milestones = [...tasksFile.matchAll(/^## (M\d+)/gm)].map((match) => match[1]);

  const prismaGenerated = existsSync(path.join(root, "node_modules", ".prisma", "client", "index.d.ts"));

  const checks: ReadinessCheck[] = [
    {
      id: "lockfile",
      ready: existsSync(path.join(root, "package-lock.json")),
      detail: "package-lock.json",
    },
    {
      id: "scripts",
      ready: configured.length === requiredScripts.length,
      detail: `${configured.length}/${requiredScripts.length} required scripts present`,
    },
    {
      id: "ci",
      ready: existsSync(path.join(root, ".github", "workflows", "ci.yml")),
      detail: ".github/workflows/ci.yml",
    },
    {
      id: "database",
      ready: Boolean(process.env.DATABASE_URL),
      detail: process.env.DATABASE_URL ? "DATABASE_URL set" : "DATABASE_URL not set",
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
    currentMilestone: milestones[0] ?? "M0",
    version: manifest.version ?? "0.0.0",
  };
}
