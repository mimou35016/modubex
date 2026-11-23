# Entitlements & licensing (M3–M4)

M3 adds the licensing foundation: one workspace `License` row, a plan-to-entitlement mapping, and a single server-side seam for every plan-gated capability. M4 puts those keys to work in the module store. Better Auth still owns identity and RBAC still owns authorization (see [`identity.md`](identity.md) and [`authorization.md`](authorization.md)); entitlements answer a different question — _what does the current plan allow?_ A route or action that is both permission- and plan-gated runs both checks.

The implementation lives in `src/core/entitlements/` and `src/app/actions/license.ts`. This page is the behavior reference; [`developer-guide.md`](developer-guide.md) covers the code seams and [`modules.md`](modules.md) covers module authorization.

## The single seam: `getEntitlements()`

`src/core/entitlements/service.ts` is the only Prisma access point for license state. Every page, server action, and API handler that needs a plan-gated capability calls `getEntitlements()` instead of reading `License` directly. It returns `{ plan, keys, has(key), hasAll(keys) }`.

Resolution rules:

- **The plan mapping is authoritative.** `License.entitlements` is an informational JSON snapshot written from the plan; it can never grant a key the plan does not include. The seed writes an empty snapshot, yet effective keys still come from the plan.
- A row with no `validUntil` — or with a future one — uses `normalizePlan(row.plan)`. `normalizePlan()` trims and lowercases, and accepts only `free`, `pro`, and `enterprise`.
- **Missing, expired, unknown, or malformed plan values degrade to `free`.** Failed database or settings reads are logged and also fall back to Free; `getEntitlements()` never throws.
- Caching is controlled by the runtime setting `performance.cacheReads` (default `true`): when it is on, the **plan** is cached with the `license` tag and a 300-second revalidation. When it is off, reads go straight to Prisma. Only the plan string is cached — `has`/`hasAll` are rebuilt on every call. `invalidateEntitlements()` calls `revalidateTag("license", { expire: 0 })` after a license mutation so the next request sees the new plan; invalidation failures are logged, not thrown.

As elsewhere in core, the workspace sentinel is `""` for the single-tenant deployment.

## Plans and entitlement keys

`src/core/entitlements/plans.ts` defines the stable, zod-validated vocabulary. Plan bundles are cumulative:

| Plan         | Effective keys (cumulative)                                                         |
| ------------ | ----------------------------------------------------------------------------------- |
| `free`       | `core.access`, `users.management`, `roles.custom`, `audit.viewer`, `settings.basic` |
| `pro`        | all of `free`, plus `audit.export`, `settings.advancedPerformance`, `modules.store` |
| `enterprise` | all of `pro`, plus `modules.premium`                                                |

| Key                            | Purpose                                                                         |
| ------------------------------ | ------------------------------------------------------------------------------- |
| `core.access`                  | Base app access.                                                                |
| `users.management`             | User management.                                                                |
| `roles.custom`                 | Custom roles.                                                                   |
| `audit.viewer`                 | View the audit log.                                                             |
| `audit.export`                 | Export audit entries to CSV.                                                    |
| `settings.basic`               | Basic settings.                                                                 |
| `settings.advancedPerformance` | Advanced performance tuning — **Pro and Enterprise only; unavailable on Free**. |
| `modules.store`                | Module store/install eligibility; checked by module install and enable actions. |
| `modules.premium`              | Premium module eligibility, declared by Enterprise-only module manifests.       |

`settings.advancedPerformance` is the special Pro+ gate: advanced performance tuning is plan-gated separately from the runtime setting itself. `modules.store` is the baseline Pro+ gate for every module install/enable; an individual module can additionally declare `requiredPlan` or `requiredEntitlement` (for example `modules.premium`) in its manifest. All of those checks go through `getEntitlements()`.

## Guards

`src/core/entitlements/guards.ts` provides:

| Function                               | Use                                                                                                       |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `hasEntitlement(entitlements, key)`    | Boolean check against an already-resolved snapshot.                                                       |
| `assertEntitlement(entitlements, key)` | Throws `EntitlementDeniedError` when the key is missing.                                                  |
| `requireEntitlement(key)`              | Resolves entitlements and asserts; guard for server actions and API handlers. Returns the snapshot.       |
| `requirePageEntitlement(key)`          | Same check for React Server Component pages; redirects to `/forbidden` instead of rendering.              |
| `requireModuleInstallEntitlement()`    | Checks `modules.store`; every module install and enable action calls this before manifest-specific gates. |

Entitlements complement RBAC permissions; neither replaces the other. A caller without the required permission is rejected by the RBAC guard, and a caller with the permission but the wrong plan is rejected by the entitlement guard. Unauthenticated access is still handled by `requireSession()` / `requirePagePermission()`.

## License row and update action

`npm run db:seed` creates the single workspace `License` row with **plan `pro`** if none exists and never overwrites an existing row. The seeded plan is therefore Pro.

`updateLicenseAction` in `src/app/actions/license.ts`:

- requires `license.manage` through `requirePermission()`; `license.read` shows the sidebar link, and the page itself is inside the `app.access` shell;
- validates `plan` (`free` / `pro` / `enterprise`), an optional trimmed `licenseKey` (max 120 characters, blank becomes `null`), and an optional ISO `validUntil` (parsed to a `Date` or `null`) with `licenseUpdateSchema` from `src/core/entitlements/schema.ts`;
- upserts by `workspaceId` inside one `prisma.$transaction` (stable id `workspace-license`, so a pre-seeded row is updated in place), writing the plan-derived entitlements snapshot;
- audits `license.plan.changed` when the plan actually changes and `license.key.updated` when key **presence** changes, both with `audit.log({ ..., client: tx, strict: true })`. Snapshots hold only safe values: before/after `plan`, or a `licenseKeySet` boolean. **The raw license key is never written to the append-only log.**
- calls `invalidateEntitlements()` and `revalidatePath("/license")` after commit, so effective features and the page refresh without a restart.

A failed mutation rolls back with its audit write and returns a generic error; failures are logged through the structured logger.

## User-visible behavior

The `/license` page is live. Inside the app shell it shows the current plan badge, active and missing entitlement keys, whether a license key is set, and the validity date. Users with `license.manage` get a working form for plan, optional license key, and optional validity date; the server action validates and audits the change. Pro and Enterprise users also see a link to advanced performance tuning; Free users do not. Changes take effect on the next request. With M4, the `/modules` store uses these same effective keys: Pro+ can install modules, Enterprise unlocks `modules.premium` modules, and a plan downgrade leaves existing module state intact but blocks further install/enable until the plan allows it.

Local environment and infrastructure values remain env-only and read-only in the UI. The license plan and key are database state, not environment variables.
