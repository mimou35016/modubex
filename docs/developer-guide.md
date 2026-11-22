# Developer guide (M2 seams)

M2 adds permission checks, user/role management, and the full audit surface. This page is the implementation reference; [`authorization.md`](authorization.md) is the behavior and vocabulary reference, and [`identity.md`](identity.md) covers authentication. Snippets below show the seam contract — follow the exact exported signatures in the source if they evolve.

## File layout

| Path | Responsibility |
| --- | --- |
| `src/core/rbac/permissions.ts` | Zod-validated permission catalog, `PermissionKey` type, system role bundles. Single source of truth for keys. |
| `src/core/rbac/service.ts` | DB-backed role/permission queries, effective-permission resolution, custom role mutations, last-owner invariant. |
| `src/core/auth/dal.ts` | `getSession`, `requireSession`, `getCurrentUser`, plus `requirePermission` and `requirePagePermission`. |
| `src/core/audit/` | `audit.log()` (`audit.ts`), action vocabulary, query/filter helpers, CSV export, and retention purge; re-exported from `index.ts`. |
| `src/app/(app)/users/page.tsx`, `src/app/(app)/users/[id]/page.tsx` | User list and detail pages. |
| `src/app/(app)/roles/page.tsx`, `src/app/(app)/audit/page.tsx` | Role management and audit viewer pages. |
| `src/app/actions/` | Server actions for user, role, audit export, and purge mutations. |
| `src/app/api/audit/` | CSV export handler(s), guarded on `audit.export`. |
| `prisma/schema.prisma`, `prisma/migrations/<timestamp>_rbac/` | `Role`, `Permission`, `RolePermission`, `UserRole` (all with `workspaceId` default `""`) and audit changes. |
| `src/core/i18n/messages/{en,fr,ar}.json`, `tests/` | New UI messages (core parity is mandatory) and RBAC/audit tests. |

## Effective permissions

`src/core/rbac/service.ts` resolves a user's permissions by joining `UserRole → Role → RolePermission → Permission` for the relevant `workspaceId` (default `""`). A user may hold several roles; the effective set is their union. `requireSession()` establishes identity first; the permission guards layer on top. Requests cache the resolved set, and role/permission mutations invalidate the cache so changes apply on the next request.

## Adding a new permission

1. Add the key and a short meaning to the catalog in `src/core/rbac/permissions.ts`. Module keys must use the module-id prefix and are aggregated at build time in M4.
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

The seed upserts rather than duplicates: it does not create a second Owner, and it assigns the Owner through `UserRole` (not the legacy `User.role` string). In M2, retention comes from `AUDIT_RETENTION_DAYS` (`0` = keep forever); M3 moves it into a validated runtime Setting. Infrastructure values stay env-only and read-only in the UI.

## Tests and quality gates

```bash
npm run test          # Vitest, once
npm run test:watch
npm run typecheck
npm run lint          # or npm run lint:fix
npm run format:check  # or npm run format
npm run i18n:check    # core keys must exist in en/fr/ar
npm run build
```

CI order is `typecheck → lint → test → i18n:check → build`. Add tests for guard rejection, custom-role escalation (`roles.assign_owner`), and the last-owner invariant; changing a permission bundle or assignment must invalidate cached reads.
