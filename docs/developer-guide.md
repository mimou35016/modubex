# Developer guide (M2–M4 seams)

M2 adds permission checks, user/role management, and the full audit surface; M3 adds runtime settings and the entitlement/licensing foundation; M4 adds build-time bundled modules, the generated module registry, and the in-app module store. This page is the implementation reference; [`authorization.md`](authorization.md) is the behavior and vocabulary reference, [`licensing.md`](licensing.md) covers plans and entitlements, [`settings.md`](settings.md) covers runtime configuration, [`modules.md`](modules.md) is the module authoring guide, and [`identity.md`](identity.md) covers authentication. Snippets below show the seam contract — follow the exact exported signatures in the source if they evolve.

## File layout

| Path                                                                                                               | Responsibility                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/core/rbac/permissions.ts`                                                                                     | Zod-validated permission catalog, `PermissionKey` type, system role bundles. Single source of truth for keys.                                           |
| `src/core/rbac/service.ts`                                                                                         | DB-backed role/permission queries, effective-permission resolution, custom role mutations, last-owner invariant.                                        |
| `src/core/auth/dal.ts`                                                                                             | `getSession`, `requireSession`, `getCurrentUser`, plus `requirePermission` and `requirePagePermission`.                                                 |
| `src/core/audit/`                                                                                                  | `audit.log()` (`audit.ts`), action vocabulary, query/filter helpers, CSV export, and retention purge; re-exported from `index.ts`.                      |
| `src/core/entitlements/{plans,service,guards,schema}.ts`                                                           | Plan mapping, the single `getEntitlements()` seam, guards, and the license form schema.                                                                 |
| `src/core/settings/{registry,service}.ts`                                                                          | Editable key descriptors, zod schemas, env-derived defaults, cached snapshot, and audited transactional updates.                                        |
| `src/core/modules/` and `src/modules/<id>/`                                                                        | Module manifest schema, generated registry helpers, lifecycle service/actions, and bundled module code (routes, settings, messages, cleanup hook).      |
| `src/modules/registry.generated.ts`                                                                                | Committed, generated list of bundled modules and their manifest metadata; produced by `npm run modules:generate`.                                       |
| `src/app/actions/license.ts`                                                                                       | `license.manage`-guarded, zod-validated, audited license update.                                                                                        |
| `src/app/actions/settings.ts`                                                                                      | `settings.update`-guarded, entitlement-aware, zod-validated settings update.                                                                            |
| `src/app/(app)/settings/` and `src/app/(app)/_components/settings/`                                                | Settings pages and forms, including read-only infrastructure and Pro+ advanced performance.                                                             |
| `src/app/(app)/users/page.tsx`, `src/app/(app)/users/[id]/page.tsx`                                                | User list and detail pages.                                                                                                                             |
| `src/app/(app)/roles/page.tsx`, `src/app/(app)/audit/page.tsx`                                                     | Role management and audit viewer pages.                                                                                                                 |
| `src/app/(app)/modules/`                                                                                           | Module store, generated module settings, and the generic bundled-route runner.                                                                          |
| `src/app/actions/`                                                                                                 | Server actions for user, role, audit export, purge, license, settings, and module lifecycle mutations.                                                  |
| `src/app/api/audit/`                                                                                               | CSV export handler(s), guarded on `audit.export`.                                                                                                       |
| `prisma/schema.prisma`, `prisma/migrations/<timestamp>_rbac/`, `prisma/migrations/<timestamp>_invitation_role_id/` | `Role`, `Permission`, `RolePermission`, `UserRole` (all with `workspaceId` default `""`), audit changes, and the invitation `roleId` relation/backfill. |
| `src/core/i18n/messages/{en,fr,ar}.json`, `tests/`                                                                 | New UI messages (core parity is mandatory) and RBAC/audit tests.                                                                                        |

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

## Modules (M4)

Modules are bundled at build time under `src/modules/<id>/` and discovered through the committed `src/modules/registry.generated.ts`. Installation, enablement, configuration, disablement, and uninstall are audited DB state changes on `ModuleInstall`; no code is loaded at runtime. The full manifest reference, naming rules, lifecycle gates, cleanup contract, and invalidation behavior are in [`modules.md`](modules.md).

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

## Tests and quality gates

```bash
npm run test          # Vitest, once
npm run test:watch
npm run typecheck
npm run lint          # or npm run lint:fix
npm run format:check  # or npm run format
npm run i18n:check    # core keys must exist in en/fr/ar; module keys warn only
npm run modules:check # committed module registry must be fresh
npm run build
```

CI order is `typecheck → lint → test → i18n:check → build`, with `npm run modules:check` also failing on a stale registry. Add tests for guard rejection, custom-role escalation (`roles.assign_owner`), and the last-owner invariant; changing a permission bundle or assignment must invalidate cached reads. For entitlements, test plan mapping (cumulative keys and `settings.advancedPerformance`), `normalizePlan()` fallbacks, guard denials, and that a license mutation audits plan/key-presence changes without the raw key and invalidates the `license` tag. For settings, test registry defaults and validation, direct reads when caching is off, create-only seeding, and the update transaction's audit and cache invalidation. For modules, test manifest validation, generated-registry freshness, lifecycle permission/entitlement/dependency gates, disabled dependents blocking disable/uninstall, both uninstall data paths, and cache invalidation of permissions and messages.
