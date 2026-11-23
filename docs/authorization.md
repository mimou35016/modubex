# Authorization, audit & entitlements (M2–M3)

M2 replaces the temporary `User.role` string with our own RBAC model and extends the audit surface. Better Auth still owns identity and sessions; **RBAC owns authorization**. Every protected page, server action, and API handler checks a **permission key**, never a role name. UI affordances are permission-aware for convenience, but hiding a button is not enforcement.

M3 adds an independent, plan-level check: **entitlements** describe what the current plan allows. A route or action that needs both runs both guards. See [`licensing.md`](licensing.md) for plans, keys, and the single `getEntitlements()` seam; [`identity.md`](identity.md) for sign-in/session behavior and [`developer-guide.md`](developer-guide.md) for code seams.

## Storage and tenancy

| Model / table    | Purpose                                                                                             |
| ---------------- | --------------------------------------------------------------------------------------------------- |
| `Role`           | Named bundle of permissions. `owner`, `admin`, and `member` are system roles; others are custom.    |
| `Permission`     | Persisted mirror of a code-defined catalog key (description, key). Code is the source of truth.     |
| `RolePermission` | Join from role to permission.                                                                       |
| `UserRole`       | Join from user to role; a user may hold more than one role, so effective permissions are the union. |

All four tables carry `workspaceId`, defaulting to `""` for the single-tenant deployment. Guards accept an optional workspace scope, so a future workspace module can add scoping without rewriting core tables or permission logic. There are no per-user permission overrides or resource-level rules in v1 (PRD §2, §8).

`Invitation` stores the selected `Role.id` (plus a mirrored legacy role key and its own `workspaceId`). Acceptance creates the account through Better Auth first (with a compensating delete on failure); the `UserRole` assignment, token consumption, and audit writes then commit in one transaction. The legacy `User.role` mirror is only stamped for an account that has no existing roles, so a multi-role user's more privileged mirror is preserved. Effective permissions are read from `UserRole → Role → RolePermission → Permission` per request, not from a role field on the Better Auth session.

## Permission catalog

The catalog is defined and zod-validated in `src/core/rbac/permissions.ts`. Unknown keys are rejected; keys are stable strings and are referenced by guards, seeds, role bundles, and module manifests.

| Key                                | Meaning                                                                                                               |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `app.access`                       | Base access to session-protected `(app)` pages. Held by Member and by custom roles built for end users.               |
| `users.read`                       | List users and open the profile on `/users/[id]`. Active sessions are a separate key.                                 |
| `users.invite`                     | Create an invitation and choose the initial role for the invitee.                                                     |
| `users.update`                     | Edit user details, activate / deactivate accounts, change a user's role (except Owner), and revoke sessions.          |
| `users.sessions.read`              | View the active sessions on `/users/[id]`.                                                                            |
| `roles.read`                       | View roles, the permission catalog, and role assignments.                                                             |
| `roles.manage`                     | Create, rename, edit the permission bundle of, and delete custom roles.                                               |
| `roles.assign_owner`               | Grant the Owner system role. Reserved for the Owner bundle; custom roles cannot include it.                           |
| `audit.read`                       | View and filter the audit log.                                                                                        |
| `audit.export`                     | Export filtered audit entries to CSV.                                                                                 |
| `audit.manage`                     | Run the retention purge.                                                                                              |
| `settings.read`, `settings.update` | View the settings pages and save runtime settings. Used by the M3 settings layout, pages, and update action.          |
| `license.read`, `license.manage`   | `license.read` shows the `/license` sidebar link; `license.manage` allows plan/license changes and guards the action. |
| `modules.read`, `modules.manage`   | Reserved for M4 store and module management. Defined now; M4 adds module-prefixed keys from manifests.                |

Non-Owner role changes are guarded by `users.update`; the retention purge is guarded by `audit.manage`. An Owner automatically receives every catalog key (including reserved ones); Admin receives every key except `roles.assign_owner`.

## System role bundles

| Role   | Permissions                                              | Editable?                                |
| ------ | -------------------------------------------------------- | ---------------------------------------- |
| Owner  | Every key in the catalog, including `roles.assign_owner` | **Locked** — cannot be edited or deleted |
| Admin  | Every key except `roles.assign_owner`                    | **Locked** — cannot be edited or deleted |
| Member | `app.access`                                             | **Locked** — cannot be edited or deleted |

Custom roles are created by an admin from any subset of the catalog **except** `roles.assign_owner`; that key must never become reachable through a custom role. The editable forms omit it, the role service and actions reject it, and invitations/assignments check the permissions a role actually grants rather than only its key. System roles are locked in the UI and in the service layer: a direct request to rename, re-bundle, or delete them fails even if it bypasses the UI. `UserRole` assignments to system roles are still manageable, subject to the invariant below.

### Last-owner invariant

The service enforces, inside the same transaction as the mutation:

- The **last active Owner** cannot be demoted (Owner role removed), deactivated, or deleted.
- Granting Owner is gated by `roles.assign_owner`, so only an Owner can create another Owner. Every other role change is gated by `users.update`.
- The seed is idempotent: it never creates a second Owner and never leaves an Owner without an Owner `UserRole`.

If an operation would leave zero active Owners, it is rejected and nothing is written.

## Guards

Both guards live in `src/core/auth/dal.ts` and resolve effective permissions through `src/core/rbac/service.ts`; `requireSession()` remains the identity seam underneath them.

- `requirePermission(key)` — for server actions and API handlers. It requires a session, resolves the caller's effective permission set, and throws a forbidden error (surfaced as 403) when the key is absent. On success it returns the session/actor so the caller can populate audit entries.
- `requirePagePermission(key)` — for React Server Component pages. It uses the same check, but redirects unauthenticated callers to sign-in and sends callers without the permission to the app's forbidden (403) state instead of rendering the protected page.

Both check the permission key on the server on every request, including direct requests that skip the UI. Reads are request-cached; role and permission changes invalidate that cache. A user can hold several roles, so the check is against the union of all assigned roles' permissions.

## Audit

`src/core/audit/` is the only write seam. Entries are append-only through the application: there is no edit or delete path for an individual entry.

### Action vocabulary

Actions are dot-namespaced strings. M2 and M3 use:

| Action                                            | Meaning                                                                           |
| ------------------------------------------------- | --------------------------------------------------------------------------------- |
| `auth.sign_in.success`, `auth.sign_in.failed`     | Sign-in outcomes from the Better Auth hook (retained from M1).                    |
| `auth.sign_out`                                   | A session was ended by sign-out.                                                  |
| `auth.invitation.created`                         | An invitation token was created.                                                  |
| `auth.invitation.accepted`                        | An invitee accepted an invitation token and received its role.                    |
| `users.invited`                                   | The user-management side of that acceptance (invitee, inviter, and granted role). |
| `users.activated`, `users.deactivated`            | Account status changes.                                                           |
| `users.role.changed`                              | A user's role assignment changed, including Owner grants (role key in metadata).  |
| `users.session.revoked`                           | An active user session was revoked.                                               |
| `roles.created`, `roles.updated`, `roles.deleted` | Custom role lifecycle.                                                            |
| `audit.exported`                                  | A filtered CSV export was produced.                                               |
| `audit.purged`                                    | A retention purge ran.                                                            |
| `settings.updated`                                | Runtime settings changed, with before/after values per key.                       |
| `license.plan.changed`                            | The workspace plan changed (before/after `plan`).                                 |
| `license.key.updated`                             | License key presence changed (boolean only; never the raw key).                   |

Later milestones add their own actions using the same dot-namespaced convention; module-authored actions use the module id as their prefix.

### Before/after snapshots and metadata

`AuditLog.before` and `AuditLog.after` are JSON snapshots of the **safe** fields that changed: role keys, permission key lists, user status, and display names. Creates have `after` only; deletes have `before` only; updates and assignments have both. Never put passwords, tokens, secrets, or raw exported rows in a snapshot. `metadata` carries context such as target id, role key, export filters and row count, or purge outcome; `userId`, `email`, `ip`, and `userAgent` identify the actor.

### Strict transactional writes

For a mutation, the audit entry and the data change are written in the **same `prisma.$transaction`** by passing the transaction client in the entry: `audit.log({ ..., client: tx, strict: true })`. `client` selects the Prisma transaction client and `strict: true` makes an audit write failure roll the transaction back, so a change can never exist without its audit record. Entries are still zod-validated before writing. The standalone form (without `client` / `strict`) remains appropriate for events that must not break a request, such as the M1 sign-in hook; its write failures are logged rather than thrown.

## Audit viewer, export, and retention

`GET /audit` is gated by `audit.read`; the viewer filters by **user, action, date range, and module**, and reads live `AuditLog` data. CSV export is a separate action behind `audit.export`; it applies the current filters and logs `audit.exported` with the filter summary and row count.

CSV handling:

- Columns: timestamp (ISO), actor id/email, action, target, module, before, after. JSON snapshots are serialized compactly.
- Fields are RFC-4180 quoted and embedded quotes doubled.
- Formula injection is neutralized: any cell starting with `=`, `+`, `-`, `@`, tab, or carriage return is prefixed with a single quote (`'`) **before** quoting, so spreadsheets treat it as text.
- The response is `text/csv; charset=utf-8` with an attachment filename; a UTF-8 BOM is used for spreadsheet compatibility.

Retention in M2 was an infrastructure value, `AUDIT_RETENTION_DAYS` (default `0` = keep forever). Purge is an explicit operation gated by `audit.manage`, not a background job: it deletes entries older than the configured window and then writes its own `audit.purged` entry with the day count, cutoff, and number deleted. With `0`, no entry is eligible for deletion. **M3 moved the value into the validated runtime setting `audit.retentionDays`** with the same `0 = forever` semantics; the env value is now only the seed default. See [`settings.md`](settings.md).

## Entitlements (M3)

Entitlements are plan-level capability keys (`core.access`, `users.management`, `roles.custom`, `audit.viewer`, `audit.export`, `settings.basic`, `settings.advancedPerformance`, `modules.store`, `modules.premium`) mapped cumulatively to `free`, `pro`, and `enterprise`. They are **not** permissions: RBAC says who a user is, entitlements say what the plan allows. Use both when a feature is gated twice.

All plan reads go through `getEntitlements()` in `src/core/entitlements/service.ts`; the plan mapping is authoritative and the persisted `License.entitlements` JSON is informational. Missing, expired, unknown, or failed reads degrade to Free. `performance.cacheReads = false` bypasses the `license` cache. Guards in `src/core/entitlements/guards.ts` are `requireEntitlement()` for actions/APIs, `requirePageEntitlement()` (redirects to `/forbidden`) for pages, and `requireModuleInstallEntitlement()` — the mandatory `modules.store` check M4 must call before any module install or enable. See [`licensing.md`](licensing.md) for the full vocabulary, cache behavior, and the audited license update action.

## Module handoff (M4)

Modules are bundled at build time and declare their permissions in their zod-validated manifest with a module-id prefix. M4 aggregates those keys into this same catalog, so system-role bundles and guards need no special cases: `Owner` receives them automatically, `Admin` receives all except `roles.assign_owner`, and module routes/actions call the same guards and `audit.log()` (installation and uninstallation are DB state changes with module-prefixed audit actions). Before any install or enable, M4 must also call `requireModuleInstallEntitlement()` so entitlement checks stay centralized. No runtime code loading is involved, and there is no module installation in M3.
