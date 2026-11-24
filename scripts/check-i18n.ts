import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

type Messages = Record<string, unknown>;

const root = process.cwd();
const coreDir = path.join(root, "src", "core", "i18n", "messages");
const sourceLocale = "en";
const comparisonLocales = ["fr", "ar"];

function flatten(value: Messages, prefix = ""): string[] {
  return Object.entries(value).flatMap(([key, child]) => {
    const pathKey = prefix ? `${prefix}.${key}` : key;
    return child !== null && typeof child === "object"
      ? flatten(child as Messages, pathKey)
      : [pathKey];
  });
}

function readMessages(file: string): Messages {
  return JSON.parse(readFileSync(file, "utf8")) as Messages;
}

function missingKeys(source: string[], target: string[]): string[] {
  const targetSet = new Set(target);
  return source.filter((key) => !targetSet.has(key));
}

function compare(sourceFile: string, targetFile: string, label: string, fail: boolean) {
  if (!existsSync(targetFile)) {
    const message = `${label}: missing message file ${path.relative(root, targetFile)}`;
    if (fail) {
      console.error(`ERROR ${message}`);
      return 1;
    }
    console.warn(`WARN  ${message}`);
    return 0;
  }

  const missing = missingKeys(flatten(readMessages(sourceFile)), flatten(readMessages(targetFile)));

  if (missing.length === 0) return 0;

  const message = `${label}: missing keys -> ${missing.join(", ")}`;
  if (fail) {
    console.error(`ERROR ${message}`);
    return 1;
  }
  console.warn(`WARN  ${message}`);
  return 0;
}

let errors = 0;

const sourceFile = path.join(coreDir, `${sourceLocale}.json`);
if (!existsSync(sourceFile)) {
  console.error(`ERROR core source message file missing: ${path.relative(root, sourceFile)}`);
  process.exit(1);
}

for (const locale of comparisonLocales) {
  errors += compare(sourceFile, path.join(coreDir, `${locale}.json`), `core/${locale}`, true);
}

const modulesDir = path.join(root, "src", "modules");
if (existsSync(modulesDir)) {
  for (const moduleId of readdirSync(modulesDir, { withFileTypes: true })) {
    if (!moduleId.isDirectory()) continue;
    const moduleMessages = path.join(modulesDir, moduleId.name, "messages");
    if (!existsSync(moduleMessages)) continue;
    const moduleSource = path.join(moduleMessages, `${sourceLocale}.json`);
    if (!existsSync(moduleSource)) continue;
    for (const locale of comparisonLocales) {
      errors += compare(
        moduleSource,
        path.join(moduleMessages, `${locale}.json`),
        `module/${moduleId.name}/${locale}`,
        false,
      );
    }
  }
}

if (errors > 0) {
  console.error(`i18n check failed with ${errors} core message error(s).`);
  process.exitCode = 1;
} else {
  console.info("i18n check passed (core parity enforced, module parity advisory).");
}
