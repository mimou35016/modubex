# Developer guide (M2–M7 seams)

M2 adds permission checks, user/role management, and the full audit surface; M3 adds runtime settings and the entitlement/licensing foundation; M4 adds build-time bundled modules, the generated module registry, and the in-app module store; M5 adds the mail/storage adapters, validated file uploads and serving, live overview data, and profile actions; M6 adds the `faq` reference module, enabled-module navigation, per-key English message fallback, a pre-paint theme script, and the automated zero-fake-UI gate; M7 adds the Docker Compose reference deployment, the `/api/health` readiness endpoint, the serverless/pooled-connection pass, and the final documentation/acceptance run. This page is the implementation reference; the architecture map below points to the authoritative behavior docs, and the snippets show the seam contract — follow the exact exported signatures in the source if they evolve.

## Architecture map

| Area                                                                      | Read first                                                                          | Implementation seam                                                                                                 |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Foundations: toolchain, app shell, env-only infrastructure, i18n, theming | [`foundation.md`](foundation.md)                                                    | `src/app/layout.tsx`, `src/core/config/env.ts`, `src/i18n/request.ts`, `src/core/foundation/readiness.generated.ts` |
| Identity and sessions                                                     | [`identity.md`](identity.md)                                                        | `src/lib/auth.ts`, `src/core/auth/dal.ts`                                                                           |
| Authorization, roles, and audit                                           | [`authorization.md`](authorization.md)                                              | `src/core/rbac/`, `src/core/audit/`, `src/core/auth/dal.ts`                                                         |
| Runtime settings and their invalidation                                   | [`settings.md`](settings.md)                                                        | `src/core/settings/`                                                                                                |
| Plans, entitlements, and license changes                                  | [`licensing.md`](licensing.md)                                                      | `src/core/entitlements/`, the single `getEntitlements()` seam                                                       |
| Modules, store, and manifest contract                                     | [`modules.md`](modules.md)                                                          | `src/core/modules/`, `src/modules/<id>/`, `src/modules/registry.generated.ts`                                       |
| Deployment, health, and portability                                       | [Deployment](#deployment) and [Health and serverless](#health-and-serverless) below | Repository-root Compose setup, `src/app/api/health/route.ts`                                                        |

## File layout

| Path                                                                                                                                                          | Responsibility                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/core/rbac/permissions.ts`                                                                                                                                | Zod-validated permission catalog, `PermissionKey` type, system role bundles. Single source of truth for keys.                                                                            |
| `src/core/rbac/service.ts`                                                                                                                                    | DB-backed role/permission queries, effective-permission resolution, custom role mutations, last-owner invariant.                                                                         |
| `src/core/auth/dal.ts`                                                                                                                                        | `getSession`, `requireSession`, `getCurrentUser`, plus `requirePermission` and `requirePagePermission`.                                                                                  |
| `src/core/audit/`                                                                                                                                             | `audit.log()` (`audit.ts`), action vocabulary, query/filter helpers, CSV export, and retention purge; re-exported from `index.ts`.                                                       |
| `src/core/entitlements/{plans,service,guards,schema}.ts`                                                                                                      | Plan mapping, the single `getEntitlements()` seam, guards, and the license form schema.                                                                                                  |
| `src/core/settings/{registry,service}.ts`                                                                                                                     | Editable key descriptors, zod schemas, env-derived defaults, cached snapshot, and audited transactional updates.                                                                         |
| `src/core/modules/` and `src/modules/<id>/`                                                                                                                   | Module manifest schema, generated registry helpers, lifecycle service/actions, and bundled module code (routes, settings, messages, cleanup hook).                                       |
| `src/modules/registry.generated.ts`                                                                                                                           | Committed, generated list of bundled modules and their manifest metadata; produced by `npm run modules:generate`.                                                                        |
| `src/app/actions/license.ts`                                                                                                                                  | `license.manage`-guarded, zod-validated, audited license update.                                                                                                                         |
| `src/app/actions/settings.ts`                                                                                                                                 | `settings.update`-guarded, entitlement-aware, zod-validated settings update.                                                                                                             |
| `src/app/(app)/settings/` and `src/app/(app)/_components/settings/`                                                                                           | Settings pages and forms, including read-only infrastructure and Pro+ advanced performance.                                                                                              |
| `src/app/(app)/users/page.tsx`, `src/app/(app)/users/[id]/page.tsx`                                                                                           | User list and detail pages.                                                                                                                                                              |
| `src/app/(app)/roles/page.tsx`, `src/app/(app)/audit/page.tsx`                                                                                                | Role management and audit viewer pages.                                                                                                                                                  |
| `src/app/(app)/modules/`                                                                                                                                      | Module store, generated module settings, and the generic bundled-route runner.                                                                                                           |
| `src/app/actions/`                                                                                                                                            | Server actions for user, role, audit export, purge, license, settings, module lifecycle, file upload, and profile mutations.                                                             |
| `src/app/api/audit/`                                                                                                                                          | CSV export handler(s), guarded on `audit.export`.                                                                                                                                        |
| `src/core/mail/`                                                                                                                                              | `sendMail()` seam, SMTP/log adapters, localized templates, and secret redaction.                                                                                                         |
| `src/core/storage/`                                                                                                                                           | `StorageAdapter` (`put`/`get`/`delete`), local disk and S3-compatible drivers, zod key validation.                                                                                       |
| `src/core/files/`                                                                                                                                             | `FileAsset` service, upload validation, and pure authorization predicates.                                                                                                               |
| `src/core/i18n/fallback.ts`                                                                                                                                   | `withEnglishFallback()` deep-merges locale messages over English, key by key.                                                                                                            |
| `src/core/modules/nav.ts`                                                                                                                                     | `getModuleNavLinks(permissions)`: enabled, permitted module links shared by desktop sidebar and mobile nav.                                                                              |
| `src/core/theme/script.ts`                                                                                                                                    | Inline pre-paint script that applies the stored/system theme before first paint.                                                                                                         |
| `src/modules/faq/`                                                                                                                                            | Complete example module: manifest, settings, two routes, forms/actions, messages, and cleanup hook.                                                                                      |
| `scripts/check-no-fake-ui.ts`                                                                                                                                 | AST-based `npm run ui:check` gate over TSX in `src/app` and `src/modules`.                                                                                                               |
| `src/core/dashboard/overview.ts`                                                                                                                              | `getOverviewData()` aggregation of live user/session and audit data.                                                                                                                     |
| `scripts/generate-readiness.ts`, `src/core/foundation/readiness.generated.ts`                                                                                 | Generator and committed build-time snapshot behind `getFoundationReadiness()`; the runtime seam adds live `DATABASE_URL` and the compiled locale registry without filesystem/cwd access. |
| `src/app/api/files/[id]/route.ts`                                                                                                                             | Permission-aware file serving by opaque `FileAsset` id.                                                                                                                                  |
| `src/app/api/health/route.ts`                                                                                                                                 | Public readiness probe: database `SELECT 1`, 200/503 JSON with `Cache-Control: no-store`, and no DSN/error text in the response.                                                         |
| `src/app/(app)/profile/` and `src/app/(app)/_components/profile/`                                                                                             | Profile page and its name/password/2FA/session/avatar forms.                                                                                                                             |
| `prisma/schema.prisma`, `prisma/migrations/<timestamp>_rbac/`, `prisma/migrations/<timestamp>_invitation_role_id/`, `prisma/migrations/<timestamp>_m5_files/` | `Role`, `Permission`, `RolePermission`, `UserRole` (all with `workspaceId` default `""`), audit changes, the invitation `roleId` relation/backfill, and `FileAsset`.                     |
| `src/core/i18n/messages/{en,fr,ar}.json`, `tests/`                                                                                                            | New UI and mail template messages (core parity is mandatory) and RBAC/audit/adapter tests.                                                                                               |

## Effective permissions

`src/core/rbac/service.ts` resolves a user's permissions by joining `UserRole → Role → RolePermission → Permission` for the relevant `workspaceId` (default `""`). A user may hold several roles; the effective set is their union. `requireSession()` establishes identity first; the permission guards layer on top. Requests cache the resolved set, and role/permission mutations invalidate the cache so changes apply on the next request. Invitation acceptance calls Better Auth `signUpEmail` first (with a compensating delete on failure), then writes the `UserRole` assignment, invitation consumption, and audit entries inside the Prisma transaction. The legacy `User.role` mirror is written only for users with no existing `UserRole` rows; no role field is added to the Better Auth session.

## Adding a new permission

1. Add the key and a short meaning to the catalog in `src/core/rbac/permissions.ts`. Module keys use the `<module-id>.` prefix and are aggregated from manifests by the generated module registry (see [`modules.md`](modules.md#permissions)).
2. Decide system-role membership. Owner receives every catalog key automatically; Admin receives all keys except `roles.assign_owner`; custom roles can include any key except `roles.assign_owner`.
3. Generate and apply a migration that upserts the corresponding `Permission` row — the code catalog remains authoritative, the row exists for relational joins.
4. Add `en`, `fr`, and `ar` messages for any new UI label; `npm run i18n:check` fails CI on missing core keys.
5. Guard every route, action, and API handler that uses the key, add tests, and document the key in [`authorization.md`](authorization.md).

## Guarding a page, action, or handler

```ts
// React Server Component page
import { requirePagePermission } from "@/core/auth/dal";

export default async function UsersPage() {
  await requirePagePermission("users.read");
  // ...render real data
}
```

```ts
// Server action
import { requirePermission } from "@/core/auth/dal";
import { audit } from "@/core/audit";
import { prisma } from "@/lib/prisma";

export async function changeUserRole(input: unknown) {
  const session = await requirePermission("users.update");
  const data = changeRoleSchema.parse(input); // zod-validate every input
  return prisma.$transaction(async (tx) => {
    const before = await loadRoleSnapshot(tx, data.userId);
    const after = await assignUserRole(tx, data); // also enforces last-owner
    await audit.log({
      action: "users.role.changed",
      userId: session.user.id,
      before,
      after,
      metadata: { targetId: data.userId, role: data.roleKey },
      client: tx,
      strict: true,
    });
    return after;
  });
}
```

```ts
// API route handler
export async function GET(request: Request) {
  await requirePermission("audit.read");
  // ...parse filters with zod and return data
}
```

`requirePermission` fails with a forbidden error (403) and never performs the mutation; `requirePagePermission` sends unauthorized users to the app's forbidden state instead of rendering the page. Do not check `role === "admin"` in application code — check the key. The UI may hide controls, but the server check is the enforcement point.

## Entitlements (M3)

Entitlements are an additional plan-level gate, not a replacement for RBAC. `src/core/entitlements/service.ts` is the **only** Prisma access point for license state: never query `License` from a page, action, or handler. The plan mapping in `plans.ts` is authoritative; the `entitlements` JSON column is an informational snapshot. Missing, expired, unknown, or failed reads fall back to `free`. With the runtime setting `performance.cacheReads` on, only the plan string is cached under the `license` tag for 300 seconds; `has`/`hasAll` are rebuilt per call. When the setting is off, plan reads go straight to Prisma. `invalidateEntitlements()` calls `revalidateTag("license", { expire: 0 })` after a license mutation so the new plan applies immediately.

```ts
// Server action or API handler
import { requirePermission } from "@/core/auth/dal";
import { requireEntitlement } from "@/core/entitlements/guards";

export async function exportSomething(input: unknown) {
  await requirePermission("audit.export"); // RBAC: who the caller is
  await requireEntitlement("audit.export"); // plan: what the plan allows
  // ...zod-validate input and do the work
}
```

```ts
// React Server Component page
import { requirePageEntitlement } from "@/core/entitlements/guards";

export default async function AdvancedPage() {
  await requirePageEntitlement("settings.advancedPerformance"); // redirects to /forbidden
  // ...render real data
}
```

```ts
// Mandatory before every module install or enable action
import { requireModuleInstallEntitlement } from "@/core/entitlements/guards";

await requireModuleInstallEntitlement(); // checks modules.store
```

`hasEntitlement()` and `assertEntitlement()` work on an already-resolved snapshot; `requireEntitlement()` returns that snapshot for downstream use. Entitlement and permission checks are independent — a plan key such as `audit.export` does not grant the RBAC permission of the same name. Unauthenticated access is still handled by `requireSession()` / `requirePagePermission()`.

To add a key: add it to `entitlementKeys` in `plans.ts`, place it in the appropriate cumulative plan arrays, guard every call site, add tests, and document it in [`licensing.md`](licensing.md). `settings.advancedPerformance` is the Pro+ gate for advanced performance tuning; it is unavailable on Free.

`updateLicenseAction` follows the same audit discipline as other mutations: `license.manage`, zod input (`licenseUpdateSchema`), one `prisma.$transaction`, and `audit.log({ ..., client: tx, strict: true })` for `license.plan.changed` / `license.key.updated`. Only plan and key-presence values are snapshotted — never the raw key. After commit, `invalidateEntitlements()` expires the `license` tag with `{ expire: 0 }` and `revalidatePath("/license")` refreshes the page.

## Module authoring and manifest reference

Modules are bundled at build time under `src/modules/<id>/` and discovered through the committed `src/modules/registry.generated.ts`. Installation, enablement, configuration, disablement, and uninstall are audited DB state changes on `ModuleInstall`; no code is loaded at runtime. The full manifest reference, naming rules, lifecycle gates, cleanup contract, and invalidation behavior are in [`modules.md`](modules.md).

A manifest default-exports `moduleManifestSchema.parse(...)` and must declare: an `id` equal to its directory name; `name`, `description`, `version`, `author`, and `icon`; `routes` (key/path/labelKey with optional `permission` and `sidebar`); module-prefixed `permissions` (`<id>.*`); a zod object `settingsSchema`; `ownedModels` and `migrations` arrays; `dependencies` (`[]` when none); and optional `requiredPlan`, `requiredEntitlement`, and `messageNamespace`. See [`modules.md`](modules.md#manifest-reference) for the authoritative field table and [`src/modules/faq/`](../src/modules/faq/) for the working reference implementation (manifest, settings, routes, actions, messages, cleanup hook).

```bash
npm run modules:generate   # regenerate src/modules/registry.generated.ts after manifest changes
npm run modules:check      # fail CI if the committed registry is stale
```

Authoring checklist:

1. Create `src/modules/<id>/manifest.ts` and **default-export** a `moduleManifestSchema.parse(...)` result; the directory and `manifest.id` must match.
2. Populate every required field: routes (with optional sidebar metadata), module-prefixed permissions, zod `settingsSchema`, `ownedModels`, `migrations`, `dependencies`, plus optional `requiredPlan`, `requiredEntitlement`, and `messageNamespace`.
3. Add one default-exported component per route key in `routes/<route-key>.tsx`; the generic runner mounts them at `/modules/run/<id>/[...slug]` and checks module state and permission before rendering. Field labels and route titles come from module messages under `modules.<namespace>`.
4. Add `messages/en.json` (and ideally `fr`/`ar`) plus an optional default-exported `cleanup.ts` hook for delete-data uninstall. Module message parity is warning-only in `npm run i18n:check`; core parity still fails CI.
5. Run `npm run modules:generate`, commit the generated registry, and add tests for lifecycle gates, dependency blocking, and uninstall data semantics.

Every lifecycle action requires `modules.manage`; install and enable also call `requireModuleInstallEntitlement()` and check manifest plan/entitlements plus enabled dependencies via `getEntitlements()`. Lifecycle mutations write strict before/after audit entries in one transaction, then expire the `modules` cache tag and refresh store/route paths. Module permissions aggregate into the central RBAC catalog, and module messages merge into next-intl only while the module is enabled, with English fallback and core keys taking precedence.

## FAQ reference module (M6)

`src/modules/faq/` is the working implementation of the contract above: a Pro-plan module with `faq.read` / `faq.manage`, two permission-gated routes (`/modules/run/faq` for published questions and `/modules/run/faq/manage` for all questions), and `perPage` / `emptyMessage` settings rendered by the generic module settings page. Its server actions validate every form with zod, require `faq.manage` before any database access, write strict `faq.question.created` / `.updated` / `.published` / `.deleted` audit entries with before/after snapshots in the same transaction, and revalidate the FAQ views. `cleanup.ts` removes only workspace-scoped `FaqQuestion` rows for delete-data uninstall. Use it as the reference when authoring a new module; see the [working example in `modules.md`](modules.md#working-example-faq) for the file-by-file map. `tests/faq-module.test.ts` covers its manifest, settings, read route, actions, and cleanup.

## i18n fallback, module nav, and theme (M6)

- `src/i18n/request.ts` loads the core `en` and target-locale trees and applies `withEnglishFallback()` from `src/core/i18n/fallback.ts`: missing keys inherit English **per key**, locale values win where present, plain objects merge recursively, and arrays/primitives are replaced. Inputs are never mutated. The locale still comes from a valid `NEXT_LOCALE` cookie or the runtime default setting; `src/app/layout.tsx` sets `lang` and `dir` on `<html>` (`ar` is RTL).
- `mergeModuleMessages(locale, baseMessages, enabledModuleIds)` merges only enabled modules' messages under `modules.<namespace>`, applying the same per-key English fallback to each module tree; core keys always win. `withModuleMessages()` overlays module messages on the request translator for settings forms and route components that also need labels while a module is disabled. `npm run i18n:check` still fails CI only for missing core keys; module parity is advisory.
- `getModuleNavLinks(permissions)` in `src/core/modules/nav.ts` derives nav links from manifest `sidebar` metadata for enabled modules and routes whose declared `permission` is granted. The desktop `Sidebar` and the mobile nav in `AppShell` render that same list; duplicate route keys/hrefs are dropped and order is `order`, module id, route key. The route runner still enforces module state and permission for direct URLs, so hiding a link is not the enforcement point.
- `themeInitScript` in `src/core/theme/script.ts` is injected into `<head>` by the root layout. It reads `localStorage.theme`, resolves `system` through `(prefers-color-scheme: dark)`, toggles the `dark` class and `colorScheme` before first paint, and does nothing if storage or media queries are blocked. `next-themes` reconciles after hydration. Tests live in `tests/i18n-fallback.test.ts`, `tests/module-nav.test.ts`, and `tests/theme.test.ts`.

## Settings (M3)

`src/core/settings/registry.ts` is the single source of truth for the 13 editable keys, their categories, zod schemas, i18n labels, and defaults (env-derived where bootstrap values feed runtime settings, such as password rules and audit retention). `workspace.timeZone` is validated as an IANA name. `infrastructureRegistry` is a separate frozen list of env-backed metadata: it exposes only masked `configured` status and flags for sensitive / restart-required values, never the underlying value.

`src/core/settings/service.ts` reads one snapshot through `unstable_cache` (tag `settings`, 300-second revalidation). Missing, invalid, or unreadable rows fall back to registry defaults and log a warning. With `performance.cacheReads = false`, both settings reads and the entitlement plan read bypass Next cache and query Prisma directly. `ensureDefaultSettings()` is create-only, so re-running `npm run db:seed` preserves edited values.

```ts
import { getAllSettings, getSettingValue } from "@/core/settings/service";

const values = await getAllSettings();
const timeZone = await getSettingValue("workspace.timeZone");
```

`updateSettings(values, actor)` validates every value, writes changed rows in one transaction, writes one `settings.updated` audit entry with before/after maps, then calls `revalidateTag("settings", { expire: 0 })` and revalidates `/settings` and `/audit`. The caller must enforce authorization: `updateSettingsAction` requires `settings.update` and also `settings.advancedPerformance` for `performance.cacheReads` submissions.

To add a key: add its schema, descriptor, and default to the registry; add `en` / `fr` / `ar` messages; wire it into the relevant settings page; guard any new entitlement; and document it in [`settings.md`](settings.md). Existing databases can rely on the registry default until an edit upserts the row.

## Mail adapter (M5)

`src/core/mail/` is the single transactional-mail seam. `sendMail(input)` zod-parses `to`, `template` (`verification` | `passwordReset` | `invitation`), `locale` (`en` | `fr` | `ar`), and `params: { url, appName, email? }`, renders the template, calls the selected adapter, and **never throws** — it returns `{ ok: true }` or `{ ok: false, error }`.

```ts
interface MailAdapter {
  send(message: PreparedMail): Promise<SendMailResult>;
}
type PreparedMail = { to: string; subject: string; text: string; html?: string };
```

- `MAIL_DRIVER=smtp` (default) selects the Nodemailer adapter; `MAIL_DRIVER=log` selects a development adapter that writes only metadata (subject, text length, HTML presence) to the structured log, never message content. `getMailDriver()`, `getMailAdapter()` (memoized), and `resetMailAdapterForTests(fake?)` expose selection; callers use `sendMail()`.
- Env-only config: `MAIL_DRIVER`, `SMTP_FROM`, `SMTP_HOST` (`localhost`), `SMTP_PORT` (`1025`), `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`. Credentials never become runtime settings.
- Template keys are `mail.subject.<template>` and `mail.body.<template>` in `src/core/i18n/messages/{en,fr,ar}.json`, with `{url}`, `{appName}`, and `{email}` placeholders. `renderMail()` uses next-intl with an inline English fallback and returns plain text plus escaped HTML. The template union is core-owned; modules must not extend it.
- Failures are logged through `logger.error()` after `redactMailSecrets()` strips URLs and long hex tokens. The bridge in `src/lib/auth.ts` (`deliverAuthMail()` for Better Auth's `sendVerificationEmail` / `passwordReset` callbacks) logs `[redacted]` placeholders for link and token. Invitation creation calls `sendMail()` from `src/app/actions/auth.ts`; the invitation is persisted first and `acceptUrl` is returned in the action result as a fallback if delivery fails.

## Storage adapter (M5)

`src/core/storage/` exposes the vendor-neutral `StorageAdapter`:

```ts
interface StorageAdapter {
  put(input: {
    key: string;
    contentType: string;
    body: Buffer;
    size: number;
  }): Promise<{ key: string }>;
  get(key: string): Promise<{ body: Buffer; contentType: string; size: number } | null>;
  delete(key: string): Promise<void>;
}
```

Use the stable `storage` delegate (or memoized `getStorageAdapter()`); `resetStorageAdapterForTests()` clears the cache. `STORAGE_DRIVER=local` (default) writes under `STORAGE_LOCAL_PATH` (`.data/uploads`) with a `.meta.json` sidecar for content type and staged temp files renamed into place; `STORAGE_DRIVER=s3` uses `@aws-sdk/client-s3` with `STORAGE_S3_BUCKET`, optional `STORAGE_S3_REGION` (default `us-east-1`), `STORAGE_S3_ENDPOINT` (for MinIO/LocalStack), `STORAGE_S3_ACCESS_KEY_ID`, `STORAGE_S3_SECRET_ACCESS_KEY`, and `STORAGE_S3_FORCE_PATH_STYLE`. All are env-only infrastructure values. Keys are relative POSIX paths: no leading `/`, no `\`, no `..`, no control characters, 1–512 chars. Both drivers throw `StorageError` (operation/key only) without vendor messages, endpoints, or credentials.

## File uploads and serving (M5)

- `FileAsset` (`prisma/schema.prisma`, migration `20261123030000_m5_files`) stores `id`, a unique `storageKey`, nullable `ownerId` → `User`, `purpose` (`avatar` | `site-logo`), `contentType`, `size`, `workspaceId` (`""`), and timestamps. Bytes stay in the storage adapter; audit snapshots carry metadata only.
- `uploadFileSchema` in `src/core/files/service.ts` requires a `File`, a purpose, and an `ownerId` for avatars. Allowed types are PNG, JPEG, WebP, and AVIF; SVG is rejected by filename and by a byte-level head check even when the declared MIME is safe. Limits are 2 MB for avatars and 1 MB for site logos. `storageKeyFor()` builds `avatars/<ownerId>/<uuid>.<ext>` or `site/logo/<uuid>.<ext>`.
- `uploadFile()` writes to storage, inserts the `FileAsset` row (deleting the object if the insert fails), audits `files.uploaded`, then removes prior assets for the same purpose/owner and audits `files.deleted`. `deleteFile()`, `getFileAsset()`, `getCurrentAvatar()`, and `getSiteLogo()` complete the service; every function zod-parses its input.
- `src/app/actions/files.ts` gates avatar actions with `requireSession()` + `app.access` and self-ownership (`canManageOwnAvatar`), and site-logo actions with `requirePermission("settings.update")`. All four actions revalidate `/`, `/profile`, and `/settings/site`.
- `GET /api/files/[id]` validates an opaque id (`^[A-Za-z0-9_-]+$`), looks up the `FileAsset` (never exposing storage keys), and requires a session for avatars; an avatar is readable only by its owner or a holder of `users.read` (`AVATAR_READ_PERMISSION`). Site logos are public. Responses send `Content-Type`, `Content-Length`, `Content-Disposition: inline`, `X-Content-Type-Options: nosniff`, and `Cache-Control` (`private` for avatars, `public` for logos); errors use `no-store`. The route is `runtime = "nodejs"`; the predicates in `src/core/files/authorization.ts` are pure and unit-testable.

## Overview data (M5)

`getOverviewData(permissionKeys)` in `src/core/dashboard/overview.ts` is the only seam for the dashboard home. It returns `users?: { total, activeSessions }` (counts from `prisma.user` and unexpired `prisma.session`) only with `users.read`, and `audit?: { entries }` (the five newest `AuditLog` rows) only with `audit.read`. Reads run in parallel and unauthorized sections are omitted, so the page renders no placeholders. The page in `src/app/(app)/page.tsx` combines that with `getEntitlements()`, `getSettingValue()`, `getModuleViews()`, and `getFoundationReadiness()`. The readiness seam reads the committed snapshot produced by `npm run readiness:generate` and combines it with live `DATABASE_URL` and the compiled locale registry; it uses no `node:fs`, `node:path`, or `process.cwd()` at runtime. Run `npm run readiness:check` locally after toolchain/tasks changes; `tests/readiness.test.ts` fails `npm run test` when the snapshot is stale.

## Profile actions (M5)

`src/app/actions/profile.ts` is self-only: each action calls `requireSession()` and never trusts a user id from input.

- `updateProfileNameAction()`: zod name (1–120) → Better Auth `auth.api.updateUser` → `profile.updated` audit with before/after name.
- `changePasswordAction()`: current + new password, live `validatePasswordWithSettings()` policy, Better Auth `auth.api.changePassword` with `revokeOtherSessions: false`, `auth.password.changed` audit. Provider errors are never echoed or logged because they may quote the submitted password.
- `revokeOwnSessionAction()`: the ownership predicate is part of the Prisma query, then Better Auth `auth.api.revokeSession` and a `users.session.revoked` audit with session metadata.

All three use `audit.log({ ..., strict: true })` and revalidate `/profile` (the name action also refreshes the layout). 2FA links point to the existing `/two-factor/enroll` and `/two-factor` pages; avatar upload/removal uses the file actions above.

## Local mail and storage (M5)

Copy `.env.example` to `.env.local`. The defaults already work locally: `MAIL_DRIVER=smtp` with `SMTP_HOST=localhost` and `SMTP_PORT=1025` targets Mailpit — start it with `docker run -p 1025:1025 -p 8025:8025 axllent/mailpit` and read captured messages at http://localhost:8025. Set `MAIL_DRIVER=log` to capture only metadata in the application log instead. Storage defaults to `STORAGE_DRIVER=local` with `STORAGE_LOCAL_PATH=.data/uploads` under the project root — no bucket or credentials needed; for S3-compatible testing set `STORAGE_DRIVER=s3` plus the `STORAGE_S3_*` variables (and `STORAGE_S3_ENDPOINT` for MinIO/LocalStack). The M7 Docker Compose setup wires Mailpit into the stack automatically; see [Deployment](#deployment).

## Writing audit entries

```ts
await audit.log({
  action: "users.deactivated",
  userId: actor.id,
  before,
  after,
  metadata: { targetId },
  client: tx,
  strict: true,
});
```

`client` is the Prisma transaction client and `strict: true` makes an audit failure roll the transaction back; both are options on the entry object, not separate arguments.

- Use the exact action names in [`authorization.md`](authorization.md#action-vocabulary); modules prefix their own actions with their module id.
- Pass `client: tx, strict: true` for every mutation so data and audit commit or roll back together. The standalone form (no `client` / `strict`) is only for events that must not break a request, such as the M1 sign-in hook; its write failures are logged.
- Snapshot only safe fields. Never audit passwords, tokens, secrets, or raw exported content. Creates have `after` only, deletes `before` only, updates both.
- Entries are append-only: no update/delete API. The retention purge is the sole deletion path and writes its own `audit.purged` entry.

Audit filtering accepts user, action, date range, and module. The CSV writer quotes fields, doubles embedded quotes, and prefixes a single quote to cells beginning with `=`, `+`, `-`, `@`, tab, or carriage return to prevent spreadsheet formula injection.

## Migrations and seed

```bash
npm run db:generate   # regenerate the Prisma client after schema changes
npm run db:migrate    # create + apply a migration in development
npm run db:deploy     # apply migrations in production
npm run db:seed       # idempotent: Owner user, system roles, catalog rows, assignments
```

The seed upserts rather than duplicates: it does not create a second Owner, and it assigns the Owner through `UserRole` (not the legacy `User.role` string). It also creates the single Pro-plan `License` row and the default settings rows if absent; settings seeding is create-only and never overwrites edits. `AUDIT_RETENTION_DAYS` is now only the bootstrap default for the validated runtime setting `audit.retentionDays` (`0` = keep forever). Infrastructure values stay env-only and read-only in the UI.

## Deployment

The reference setup is Docker Compose at the repository root: `docker compose up --build` starts the whole stack, and `docker compose down` stops it **without deleting volumes**. Do not use `docker compose down -v` for a normal restart — `-v` removes the named `db-data` and `uploads` volumes that hold PostgreSQL data and `.data/uploads`.

| Service   | Role in the stack                                                                                                                |
| --------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `db`      | PostgreSQL with a named data volume; the app reaches it over the Compose network at `db:5432`.                                   |
| `mailpit` | Local SMTP sink on port `1025` with a web inbox at http://localhost:8025; the app's `MAIL_DRIVER=smtp` default points here.      |
| `migrate` | One-shot job: waits for `db`, then runs `npm run db:deploy` (`prisma migrate deploy`) followed by `npm run db:seed`, then exits. |
| `app`     | Production Next.js server, started after `db` is ready and `migrate` has succeeded; published at http://localhost:3000.          |

```bash
docker compose up --build
curl -fsS http://localhost:3000/api/health  # {"status":"ok","database":"ok",...}
docker compose down                         # keep named volumes
```

Open http://localhost:3000 to sign in and http://localhost:8025 to read captured verification, reset, and invitation mail. `GET /api/health` is the endpoint for container-platform probes: it runs `SELECT 1` against the database, returns `200` with `{ status, database, timestamp }` on success and `503` with `{ status: "error", database: "unavailable" }` on failure, always with `Cache-Control: no-store` and no DSN or raw error in the body. Because it checks the database, treat it as a readiness probe; `tests/health.test.ts` covers both responses and secret redaction.

### Environment matrix

Infrastructure values stay in the environment (`.env.local` locally, Compose `environment` blocks or the platform's secret store elsewhere); they are never runtime settings. See [`identity.md`](identity.md#configuration) for the full auth table and [`.env.example`](../.env.example) for local defaults. `src/core/config/env.ts` and `.env.example` are the source of truth for variable names.

| Variable                                                                                          | Required / local default                                                                      | Docker Compose override                                                                                                                                  | Serverless override                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                                                                    | Required at runtime; `.env.example` points at host PostgreSQL (port `5433` by default).       | Service URL such as `postgresql://<user>:<password>@db:5432/modubex?schema=public`.                                                                      | Provider's **pooled** transaction connection string; a direct URL is only for the one-off migration job, never for the app core.                                                       |
| `BETTER_AUTH_URL`                                                                                 | `http://localhost:3000` locally; runtime auth callback origin.                                | Can be overridden at runtime to the external origin when proxied.                                                                                        | Deployed origin, including scheme; auth callbacks use this value.                                                                                                                      |
| `NEXT_PUBLIC_APP_URL`                                                                             | `http://localhost:3000` by default; **inlined at Next build time**.                           | Compose sets the same value at runtime, so the reference image effectively uses the build-time default; a runtime-only change does not alter the bundle. | Set the real public origin in the Docker build stage/arg and rebuild the image; runtime env alone is ineffective.                                                                      |
| `BETTER_AUTH_SECRET`                                                                              | Development-only example value in `.env.example`; set a real value for any shared deployment. | Supply a real secret via the Compose environment.                                                                                                        | Store a unique secret per environment in the platform secret store.                                                                                                                    |
| `MAIL_DRIVER`, `SMTP_*`                                                                           | `smtp` → `localhost:1025`; `log` records metadata only.                                       | `smtp` → `mailpit:1025`, `SMTP_SECURE=false`, `SMTP_FROM` as desired; inbox on `8025`.                                                                   | Real SMTP host/port/credentials (or `log`) via env only; never runtime settings.                                                                                                       |
| `STORAGE_DRIVER`, `STORAGE_LOCAL_PATH`, `STORAGE_S3_*`                                            | `local` → `.data/uploads`; no bucket needed.                                                  | `local` on a named uploads volume by default; `s3` also works with the `STORAGE_S3_*` values.                                                            | `STORAGE_DRIVER=s3` with bucket, region, credentials, and optional endpoint/path-style for MinIO-style providers; no durable local disk.                                               |
| `SEED_OWNER_EMAIL`, `SEED_OWNER_PASSWORD`                                                         | Local bootstrap defaults in `.env.example`.                                                   | Override for any non-local stack; the seed only creates a missing Owner.                                                                                 | Strong first-boot credentials; change the password at `/profile` afterwards.                                                                                                           |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`, `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`          | Optional, but **both** values are needed to enable a provider; unset means no button.         | Pass both pairs through when configuring providers.                                                                                                      | Same rule; callbacks must be registered for the deployed origin.                                                                                                                       |
| `AUTH_PASSWORD_*`, `AUTH_2FA_REQUIRED`, `AUTH_REQUIRE_EMAIL_VERIFICATION`, `AUDIT_RETENTION_DAYS` | Defaults shown in `.env.example`.                                                             | Pass through as needed; password/2FA/retention values seed runtime settings only when absent.                                                            | Same; after seeding, password rules and 2FA enforcement are changed under **Settings → Security** and retention under **Settings → Audit**, while email verification remains env-only. |

### Volumes, migrations, and seed

- PostgreSQL data is kept in the `db-data` named volume and uploads in the `uploads` named volume mounted at `/app/.data/uploads` (or in S3 when `STORAGE_DRIVER=s3`). `db` is reachable at `db:5432` on the Compose network; no host PostgreSQL port is published by default. `docker compose down` preserves both volumes; `down -v` destroys them.
- `migrate` waits for `db` readiness, then runs `npm run db:deploy` and `npm run db:seed`. `prisma migrate deploy` applies only pending migrations; the seed upserts the Owner, system roles/permissions, license, and settings without creating a second Owner or overwriting edited settings. Re-running `docker compose up --build` is therefore safe.

### Troubleshooting

- **Ports in use** — check `3000` (app), `1025`/`8025` (Mailpit SMTP/inbox), and any host PostgreSQL port you added in an override (`db` is internal only by default). Stop the conflicting process or change the host mapping in a Compose override, then retry `docker compose up --build` and `curl -i http://localhost:3000/api/health`.
- **Public links show `localhost` behind a proxy** — `NEXT_PUBLIC_APP_URL` is inlined at Next build time; the reference image relies on its `http://localhost:3000` default and Compose's runtime value cannot change the bundle. Set the real origin during the image build (build stage/arg) and rebuild. `BETTER_AUTH_URL` remains a runtime value.
- **Mail not arriving** — confirm `MAIL_DRIVER=smtp`, `SMTP_HOST=mailpit`, `SMTP_PORT=1025`, and `SMTP_SECURE=false`, then check http://localhost:8025. With `MAIL_DRIVER=log` only message metadata is logged: tokens and URLs are never written to logs. Failed delivery does not roll back the triggering request; invitation accept links are returned in the action response as a fallback.
- **Logs** — use `docker compose logs -f app` (also `migrate`, `db`, `mailpit`). Health failures log `Health check database probe failed` with no DSN or error details in the HTTP response.
- **DB not ready / health 503** — inspect `docker compose logs db migrate`, verify `DATABASE_URL` matches the Compose service and credentials, wait for `db` readiness, then restart the stack. A `503` from `/api/health` means the `SELECT 1` probe failed, not an authorization problem.

## Health and serverless

The Docker stack is the reference deployment; the core also runs on serverless platforms under these rules:

- **No local disk as a source of truth.** `STORAGE_DRIVER=local` is for local development/Docker with a mounted volume. On serverless set `STORAGE_DRIVER=s3` and supply `STORAGE_S3_*`. Sessions, settings, license, module state, audit, and file metadata live in the database; never write authoritative state to the app filesystem or assume it survives a restart or is shared between instances. The dashboard readiness checklist likewise uses a committed generated snapshot rather than reading repository files at request time.
- **No in-process source of truth.** Sessions and accounts are Better Auth + Prisma; RBAC, settings, entitlements, audit, module state, and auth rate limits are database-backed. `unstable_cache` snapshots are derived and rebuilt with `revalidateTag(...)` on mutation — do not introduce module-level mutable state as the authority for a decision.
- **Pooled connections.** Runtime `DATABASE_URL` points at the provider's pooler (transaction pooling), and the Prisma client is reused. No core path opens per-request or unpooled connections; if a provider requires a direct URL for DDL, confine it to the one-off migration job.
- **Probes.** Use `GET /api/health` for readiness (200/503 as described in [Deployment](#deployment)). It is dynamic, `no-store`, and deliberately reveals no secrets or raw database errors.

## Tests and quality gates

```bash
npm run test          # Vitest, once
npm run test:watch
npm run typecheck
npm run lint          # or npm run lint:fix
npm run ui:check      # zero-fake-UI AST scan; fails CI on placeholder UI
npm run format:check  # or npm run format
npm run i18n:check    # core keys must exist in en/fr/ar; module keys warn only
npm run modules:check # committed module registry must be fresh
npm run readiness:generate # regenerate src/core/foundation/readiness.generated.ts
npm run readiness:check    # fail locally when that snapshot is stale
npm run build
```

CI order is `typecheck → lint → ui:check → test → i18n:check → modules:check → build`, with `npm run modules:check` also failing on a stale registry. Readiness freshness is asserted by `tests/readiness.test.ts` inside the existing `npm run test` CI step; `readiness:check` is a local command and is not a separate CI step, so the order is unchanged. Add tests for guard rejection, custom-role escalation (`roles.assign_owner`), and the last-owner invariant; changing a permission bundle or assignment must invalidate cached reads. For entitlements, test plan mapping (cumulative keys and `settings.advancedPerformance`), `normalizePlan()` fallbacks, guard denials, and that a license mutation audits plan/key-presence changes without the raw key and invalidates the `license` tag. For settings, test registry defaults and validation, direct reads when caching is off, create-only seeding, and the update transaction's audit and cache invalidation. For modules, test manifest validation, generated-registry freshness, lifecycle permission/entitlement/dependency gates, disabled dependents blocking disable/uninstall, both uninstall data paths, and cache invalidation of permissions and messages. For M5, test localized template rendering and secret redaction (no URL or token in logs), mail driver selection and non-throwing failure results, storage key validation and both drivers, upload type/size/SVG rejection and replacement cleanup, file-serving authorization (owner / `users.read` / public logo), overview permission gating, and profile self-only actions including forged session ids.

### Automated zero-fake-UI check (M6)

`npm run ui:check` runs `scripts/check-no-fake-ui.ts`, a TypeScript AST scan of every `.tsx` file under `src/app` and `src/modules`. Rule summary (unit-tested in `tests/check-no-fake-ui.test.ts`):

- `fake-href` / `anchor-without-href` — anchors with `#`, empty, or `javascript:` hrefs, or no href at all.
- `no-op-handler` — `on*` / `formAction` handlers that are empty, `undefined`, `void 0`, or an empty arrow body.
- `button-without-handler` — `button` / `Button` with no `onClick`, `formAction`, submit button inside a handled `<form>` (`onSubmit`, `action`, or `method`), or `disabled` with an explicit reason (`title`, `aria-label`, `aria-describedby`).
- `fake-text` / `todo-in-text` — user-visible JSX text, string children, and `alt` / `aria-description` / `aria-label` / `label` / `placeholder` / `title` attributes containing `coming soon`, `planned`, `lorem ipsum`, `mock`, `dummy`, `fake`, `TODO`, or `FIXME`. Translation keys, the `placeholder` attribute, CSS classes, and ordinary identifiers are not flagged.
- `mock-import` — static or dynamic imports whose path contains `mock`, `fixture`, or `dummy`.

The only exemption is a reasoned `// zero-fake-ui-allow: <reason>` comment on the same or preceding line; it suppresses just that node. Use it sparingly and keep the reason specific. `tests/quality-matrix.test.ts` additionally checks that every generated route has a component key and prefixed sidebar label, so a module cannot register a dead nav entry.

### Consolidated quality tests (M6)

`tests/quality-matrix.test.ts` is the consolidated acceptance suite: RBAC guard denial and page redirects even for an Owner without the key, last-Owner and locked-role invariants, module install/enable entitlements and dependency blocking, both uninstall modes with typed confirmation and cleanup, plan normalization and forged entitlement JSON, settings validation/audit/revalidation, and the zero-fake-UI registry contract. Focused M6 suites cover the FAQ module, module nav selection, per-key i18n fallback, the pre-paint theme script, and the UI checker itself.

### Health and deployment checks (M7)

- `tests/health.test.ts` verifies that `/api/health` returns `200` with a timestamp and `no-store` when the database probe succeeds, `503` when it fails, and never echoes DSNs, secrets, or raw errors.
- `tests/readiness.test.ts` compares the committed readiness snapshot with freshly collected repository facts and asserts that the runtime seam has no filesystem/cwd dependency; it runs in the existing `npm run test` CI step.
- The Docker smoke check is a release-level check (it requires Docker and is separate from the CI gate order above): run `docker compose up --build`, call `curl -fsS http://localhost:3000/api/health`, confirm the app at http://localhost:3000 and the Mailpit inbox at http://localhost:8025, then `docker compose down` (without `-v`) and restart once to confirm the volumes survived. This covers AC13 end to end.
