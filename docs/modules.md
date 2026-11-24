# Module system (M4)

Modules are ordinary TypeScript code bundled with the application under `src/modules/<id>/`. Installing a module is a **database state change**, not runtime code loading: the registry is generated at build time, and `ModuleInstall` rows decide which bundled code is reachable. This page is the authoring reference; [`developer-guide.md`](developer-guide.md) covers the surrounding seams, [`authorization.md`](authorization.md) covers permission aggregation, and [`licensing.md`](licensing.md) covers plan entitlements.

## Directory layout

```
src/modules/<module-id>/
├── manifest.ts          # default export: manifest parsed with `moduleManifestSchema`
├── settings.ts          # optional: exported zod object schema used by `manifest.settingsSchema`
├── cleanup.ts           # optional: default-exported data cleanup hook
├── routes/
│   └── <route-key>.tsx  # one default-exported component per manifest route key
└── messages/
    ├── en.json          # source locale / English fallback
    ├── fr.json
    └── ar.json
```

The directory name is the **module id** and must match `manifest.id`. Use lowercase kebab-case (`faq`, `audit-digest`); the generator rejects other directory names. The id prefixes permissions and is the default message namespace, so it is effectively a namespace — do not rename it casually.

`src/modules/registry.generated.ts` is generated, never hand-edited. It imports every manifest, route component, cleanup hook, and message loader statically, and is committed so typechecks and builds see the same module list as CI.

## Manifest reference

`manifest.ts` **default-exports** an object parsed with `moduleManifestSchema` from `@/core/modules`. The table below is the full authoring contract; follow the exported type if a later implementation narrows it.

| Field                 | Required | Contract                                                                                                                                                                                 |
| --------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                  | yes      | Lowercase kebab-case id, max 60 characters; must equal the directory name.                                                                                                               |
| `name`                | yes      | Display name (or a translated key), 1–120 characters; shown in the store and module settings.                                                                                            |
| `description`         | yes      | Short store description (or a translated key), 1–500 characters.                                                                                                                         |
| `version`             | yes      | Semantic version such as `1.0.0`; persisted on `ModuleInstall.version` and included in lifecycle audit snapshots.                                                                        |
| `author`              | yes      | Attribution shown in the store, max 120 characters.                                                                                                                                      |
| `icon`                | yes      | Icon name resolved by the shared icon map, max 120 characters; no arbitrary markup or remote assets.                                                                                     |
| `requiredPlan`        | no       | Minimum plan (`free`, `pro`, `enterprise`) checked through `getEntitlements()`; plan bundles are cumulative.                                                                             |
| `requiredEntitlement` | no       | Single additional entitlement key (for example `modules.premium`) checked through `getEntitlements()`.                                                                                   |
| `dependencies`        | yes      | Array of module ids (use `[]` when none). Every dependency must be `enabled` before install or enable.                                                                                   |
| `permissions`         | yes      | Array of `{ key, description }` (use `[]` when none). Every key must begin with `<id>.`; descriptions are capped at 500 characters.                                                      |
| `routes`              | yes      | Array of route descriptors (use `[]` when none); see [Routes and sidebar](#routes-and-sidebar-conventions).                                                                              |
| `settingsSchema`      | yes      | Zod object schema, even if empty (`z.object({})`). The settings page renders fields from its shape and validates writes with it; the service also uses `parse({})` for install defaults. |
| `ownedModels`         | yes      | Array of module-owned Prisma model names (use `[]` when none). See [Owned models and migrations](#owned-models-and-migration-prefix-rule).                                               |
| `migrations`          | yes      | Array of module-owned migration directory paths (use `[]` when none).                                                                                                                    |
| `messageNamespace`    | no       | Overrides the default message namespace (`id`). Module messages merge under `modules.<namespace>` in next-intl.                                                                          |

Full example (the exported schema is authoritative):

```ts
// src/modules/faq/manifest.ts
import { moduleManifestSchema, type ModuleManifest } from "@/core/modules";
import { faqSettingsSchema } from "./settings";

const manifest: ModuleManifest = {
  id: "faq",
  name: "FAQ",
  description: "Manage frequently asked questions.",
  version: "1.0.0",
  author: "Internal",
  icon: "CircleHelp",
  requiredPlan: "pro",
  requiredEntitlement: "modules.premium",
  dependencies: [],
  permissions: [
    { key: "faq.read", description: "View FAQ entries." },
    { key: "faq.manage", description: "Create and edit FAQ entries." },
  ],
  routes: [
    {
      key: "questions",
      path: "questions",
      labelKey: "modules.faq.routes.questions.label",
      permission: "faq.read",
      sidebar: { labelKey: "modules.faq.sidebar.questions", icon: "CircleHelp", order: 10 },
    },
  ],
  settingsSchema: faqSettingsSchema,
  ownedModels: ["FaqQuestion"],
  migrations: ["prisma/migrations/<timestamp>_faq_add_questions"],
};

export default moduleManifestSchema.parse(manifest);
```

## Working example: faq

The bundled `faq` module is the reference implementation. Read it alongside this contract:

- `src/modules/faq/manifest.ts` — `requiredPlan: "pro"`, no dependencies, `faq.read` / `faq.manage`, and two routes (`questions` at the module root, `manage` at `/manage`) with sidebar labels and icons. It imports `moduleManifestSchema` from `@/core/modules/manifest` directly: the `@/core/modules` barrel loads the generated registry, which imports the manifest, so going through the barrel would create a cycle.
- `src/modules/faq/settings.ts` — `perPage` (integer 1–50, default 10) and `emptyMessage` (1–120 characters, default `No questions yet.`), rendered by the generic `/modules/faq/settings` page.
- `src/modules/faq/routes/questions.tsx` and `routes/manage.tsx` — the published, setting-bounded read view and the full management list; both resolve labels through `withModuleMessages()`.
- `src/modules/faq/components/question-forms.tsx` and `actions.ts` — create/edit/publish/delete forms backed by zod-validated server actions, each writing a strict `faq.question.*` audit entry with before/after snapshots. Every mutation calls `requirePermission("faq.manage")` before touching the database.
- `src/modules/faq/cleanup.ts` — the idempotent delete-data hook scoped to the workspace; `prisma/migrations/20261123040000_faq_add_questions/migration.sql` creates the prefixed `FaqQuestion` table and its lookup index.
- `src/modules/faq/messages/{en,fr,ar}.json` — the module message trees; `tests/faq-module.test.ts` covers the manifest, settings, route reads, actions, and cleanup.

## Routes and sidebar conventions

A route descriptor has:

| Property     | Required | Meaning                                                                                                                                                                               |
| ------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `key`        | yes      | Lowercase kebab-case key; the generator imports `routes/<key>.tsx` from the module.                                                                                                   |
| `path`       | yes      | Path relative to `/modules/run/<id>/`; `""` is the module root, nested paths use `/`-separated lowercase segments with no leading slash.                                              |
| `labelKey`   | yes      | Message key used for the route title.                                                                                                                                                 |
| `permission` | no       | `<id>.*` key required to render the route; the runner redirects unauthorized callers to `/forbidden`.                                                                                 |
| `sidebar`    | no       | `{ labelKey, icon, order? }` for a nav entry rendered in the desktop sidebar and mobile nav; shown only while the module is enabled and the route's `permission` (if any) is granted. |

The component file default-exports a React component with `{ moduleId, slug }` props:

```tsx
// src/modules/faq/routes/questions.tsx
import type { ModuleRouteProps } from "@/core/modules";

export default function QuestionsRoute({ moduleId, slug }: ModuleRouteProps) {
  // `slug` is the remaining URL segment array; render real data here.
  return null;
}
```

All module pages are mounted by the generic runner at `/modules/run/[moduleId]/[...slug]` (and `/modules/run/[moduleId]` for a route with `path: ""`). The runner resolves the component from the generated registry, requires `app.access`, checks that the module is `enabled`, matches the declared path, and applies the route permission before rendering. It never imports code from disk at request time.

`getModuleNavLinks(permissions)` in `src/core/modules/nav.ts` turns manifest `sidebar` descriptors into links. The app shell uses the same list for the desktop `Sidebar` and the mobile navigation bar: a link appears only when its module is `enabled` and the caller holds the route's declared `permission` (routes without a permission need only `app.access`, which the shell requires). Entries are de-duplicated by route key and href, sorted by `order`, then module id and route key, and resolved through the merged module messages. Hiding a link is not enforcement — the runner still checks module state and permission for direct requests.

- Declare routes in the manifest; do not hand-write files under `src/app/(app)/modules/run/`.
- Call `requirePermission("<id>.…")` in route mutations as well; hiding a link is not enforcement.
- Module settings always live at `/modules/<id>/settings`; that page is generated from `settingsSchema` and needs no route declaration.

## Settings schema and field labels

`settingsSchema` must be a zod **object**. The generic page inspects each field and renders inputs for strings, numbers, booleans, enums/literals (including unions of literals), and their `optional()` / `default()` / `nullable()` wrappers; anything else falls back to a text input. Avoid opaque schemas that cannot be represented as a form field.

Labels are resolved from merged module messages, with English fallback and a generic field-name fallback. For a field named `perPage`, add `modules.<namespace>.settings.fields.perPage.label` and optionally `…description` to `messages/en.json`. Shorter keys such as `modules.<namespace>.fields.perPage.label` are also accepted as fallbacks. A zod `.describe()` on the field is used as the description when no message key resolves.

Values are validated field-by-field against the manifest schema before being merged into `ModuleInstall.config`. Unknown keys, invalid values, and writes to an unavailable module are rejected; the stored config and audit log are unchanged on failure. Do not store secrets in module config — infrastructure values remain env-only.

## Permissions

Module permissions are regular catalog keys with a mandatory `<id>.` prefix (for example `faq.read`, `faq.manage`). `modulePermissionDescriptors` exposes them in the same shape as the core catalog, so:

- the keys appear in `/roles` and can be selected for custom roles;
- install/enable upsert the corresponding `Permission` rows and sync locked system-role bundles, so Owner receives every key and Admin receives all except `roles.assign_owner`;
- module routes and actions use the same `requirePermission()` / `requirePagePermission()` guards as core code — never a role-name check.

Audit actions written by a module also use the module id as their prefix (`faq.question.created`, etc.). Do not claim core keys such as `users.update` in a manifest.

## Owned models and migration prefix rule

Module data lives in the shared Prisma schema (`prisma/schema.prisma`) with versioned migrations under `prisma/migrations/`. Disabled modules still contribute tables; that is why naming is strict:

- Prefix every model and table with the PascalCase module id (`faq` → `FaqQuestion`, `FaqAnswer`). Model ids, relation names, and indexes should follow the same prefix.
- Prefix migration directories with the module id: `<timestamp>_faq_add_questions`. Do not mix modules in one migration.
- List the owned models and migrations in `ownedModels` / `migrations`. They are ownership metadata for reviewers and the cleanup path; they do not execute SQL at install time.
- Delete-data uninstall removes rows through the cleanup hook. Dropping tables is a separate schema decision recorded in a new migration, not an implicit runtime DDL operation.

## Messages

Ship `messages/en.json` at minimum; `fr.json` and `ar.json` are recommended. The generator imports each locale file it finds. `withEnglishFallback()` fills missing translations **per key** from the module's English tree: locale strings win where present, plain objects merge recursively, and arrays or other non-object values are replaced wholesale. A missing locale file yields the English tree. `npm run i18n:check` fails CI for missing **core** keys in `fr`/`ar`, but missing module keys are warning-only.

For enabled modules, `mergeModuleMessages()` deep-merges message trees under `modules.<namespace>` (namespace defaults to the manifest id, or `messageNamespace`). Core keys always win on collision, so keep module keys namespaced. Enabling/disabling changes the merged message set on the next request without a rebuild. Module settings pages and route components can use `withModuleMessages()` to overlay the same per-key fallback on top of the request translator.

## Cleanup hook

A module that owns data may add `cleanup.ts` with a **default-exported** hook. It runs only for **Uninstall and delete data**, after the typed confirmation has matched the module id.

```ts
// src/modules/faq/cleanup.ts
import type { ModuleCleanupHook } from "@/core/modules";

const cleanup: ModuleCleanupHook = async ({ client, actor, moduleId }) => {
  const { count } = await client.faqQuestion.deleteMany({ where: { workspaceId: "" } });
  return { deleted: { faqQuestion: count } };
};

export default cleanup;
```

The context is `{ client, actor, moduleId }`, where `client` is the Prisma transaction client and `actor` is the audit actor. The result is `{ deleted: Record<string, number> }`, merged into the uninstall audit metadata as per-model counts.

Contract:

- The lifecycle service calls the hook **inside the same `prisma.$transaction`** that removes the module row and writes the strict audit entry. Use the supplied `client` for every query; a global `prisma` call would escape the transaction.
- The hook must be idempotent and scoped to the workspace (`""` in the single-tenant deployment). If it throws, the entire uninstall — state change, config deletion, and audit entry — rolls back.
- It deletes **data**, not code or tables. Return small JSON-safe counts; never return raw rows, secrets, or large payloads.
- Do not call `revalidate*`, `redirect`, or send mail from the hook. Cache invalidation and auditing belong to the lifecycle service.

## State machine

`ModuleInstall` stores module id, `state`, `version`, `config` JSON, `dataRetained`, `installedById`, and timestamps. A bundled module with **no row** is reported as `available`; the store derives that state rather than pre-creating rows.

| From                           | Action                  | To        | Notes                                                                                                 |
| ------------------------------ | ----------------------- | --------- | ----------------------------------------------------------------------------------------------------- |
| available                      | install                 | installed | Creates/upserts the row, records version and installer, upserts permissions, writes audit.            |
| installed                      | enable                  | enabled   | Routes, desktop/mobile nav entries, and module messages become live; system-role defaults are synced. |
| enabled                        | disable                 | disabled  | Routes/nav entries removed immediately; config and data stay.                                         |
| disabled                       | enable                  | enabled   | Reuses the stored config; no reinstall needed.                                                        |
| installed / enabled / disabled | uninstall (keep-data)   | available | Row retained with `dataRetained: true` and config intact; module-owned data tables stay.              |
| installed / enabled / disabled | uninstall (delete-data) | available | Hook deletes data, permission rows and config are removed, and the module row is deleted.             |

Other transitions are rejected. Reinstalling a keep-data module restores the prior configuration and data; uninstalling after delete-data starts clean.

## Lifecycle, entitlement, and dependency rules

Every lifecycle mutation (install, enable, disable, settings update, uninstall) is a server action that requires `modules.manage`. Mutations validate input with zod and write strict before/after audit entries in one transaction. Install and enable additionally require:

1. `requireModuleInstallEntitlement()` — the mandatory `modules.store` check through the single entitlement seam;
2. the manifest's `requiredPlan` and `requiredEntitlement`, also resolved through `getEntitlements()`;
3. every `dependencies` module id to be in `enabled` state.

Disable and uninstall are rejected while any **enabled** module declares the target as a dependency; disable those dependents first. The store shows the blocking modules so the error is actionable. Missing or expired entitlements, disabled dependencies, and direct requests that bypass the UI all fail on the server.

Audit examples use module-prefixed actions and include the chosen uninstall option: `modules.installed`, `modules.enabled`, `modules.disabled`, `modules.settings.updated`, `modules.uninstalled`. Snapshots contain safe state/version/config summaries and dependency lists — never secrets.

## Uninstall data semantics

- **Uninstall and keep data** (`mode: "keep-data"`) — keeps module-owned rows and `ModuleInstall.config`, marks the row `dataRetained: true`, and returns the module to `available`. Reinstall restores the previous setup. No cleanup hook runs.
- **Uninstall and delete data** (`mode: "delete-data"`) — requires typing the exact module id. It runs the manifest cleanup hook, removes permission rows and config, deletes the `ModuleInstall` row, and records that `delete-data` was chosen. This cannot be undone.

Both paths remove the module from live routes and the sidebar and are audited with before/after state. Disable/uninstall remain blocked by enabled dependents.

## Cache invalidation

Do not hand-roll cache busting inside a module. Module rows are read through an `unstable_cache` snapshot tagged `modules` (300-second revalidation). After a lifecycle transaction commits, the service calls `revalidateTag("modules", { expire: 0 })`, refreshes `/modules`, `/`, the module settings path, and every declared route path (plus dependent route paths), so changes apply on the next request. Entitlement reads keep their own `license` tag invalidation; changing module state does not change the plan.

## Regenerating and checking the registry

```bash
npm run modules:generate   # scan src/modules/*, validate manifests, write src/modules/registry.generated.ts
npm run modules:check      # fail if the committed registry is stale
```

The generator discovers modules by directory, requires `manifest.ts`, imports route components from `routes/<key>.tsx`, detects `cleanup.ts`, and discovers `messages/<locale>.json`. Run it when you add, rename, or delete a module, or when manifest fields that affect discovery change (id, routes, cleanup, or message files). Commit the regenerated file with the module. `npm run modules:check` runs in CI and fails the build if someone forgot; it never rewrites files. The generated registry is the only place the app discovers bundled modules — there is no runtime directory scan in request handling.
