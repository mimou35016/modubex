# Modubex

A lean, modular foundation for web applications and admin dashboards. See [`docs/PRD.md`](docs/PRD.md) for the product spec and [`docs/tasks.md`](docs/tasks.md) for the milestone plan.

Current state: **M0–M3 complete**. RBAC, custom roles, user management, audit viewer/export/purge, runtime settings, the single `getEntitlements()` seam, live password/2FA policies, and the audited license action are present. `/settings`, `/license`, and the settings/licensing pages are live; the module store and module installation arrive in M4. Guides: [`docs/identity.md`](docs/identity.md), [`docs/authorization.md`](docs/authorization.md), [`docs/settings.md`](docs/settings.md), [`docs/licensing.md`](docs/licensing.md), [`docs/user-guide.md`](docs/user-guide.md), [`docs/developer-guide.md`](docs/developer-guide.md).

## Requirements

- Node.js 24 and npm 12
- PostgreSQL — required from M1 onward for identity and session tables

## Run locally

```bash
npm ci
cp .env.example .env.local
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

Before starting, set `DATABASE_URL`, `BETTER_AUTH_SECRET`, and `BETTER_AUTH_URL` in `.env.local`. The remaining auth and retention variables are optional and have documented defaults; see [`docs/identity.md#configuration`](docs/identity.md#configuration) and [`docs/authorization.md#audit-viewer-export-and-retention`](docs/authorization.md#audit-viewer-export-and-retention). For a disposable local database, use a Docker PostgreSQL container on port 55432 and point `DATABASE_URL` at it (exact steps in the identity guide).

Open http://localhost:3000 for the readiness overview, which reports readiness from the actual checkout. Public auth pages live outside the dashboard shell in the `(auth)` route group; session-protected pages live in the `(app)` route group.

## Routes added in M2–M3

| Route                          | Purpose                                                                                                        | Required permission                                                                                             |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `/users`                       | List users; invite, activate/deactivate, and change roles                                                      | `users.read` (actions require `users.invite`, `users.update`, `roles.assign_owner` for Owner grants)            |
| `/users/[id]`                  | User detail: profile, roles, active sessions, and user actions                                                 | `users.read` (sessions require `users.sessions.read`; changes require `users.update`)                           |
| `/roles`                       | Permission catalog, custom roles, and role management                                                          | `roles.read` (role changes require `roles.manage`; assignments require `users.update`)                          |
| `/audit`                       | Filter, view, export, and purge audit entries                                                                  | `audit.read` (export/purge require `audit.export` / `audit.manage`)                                             |
| `/settings` → `/settings/site` | Site, SEO, performance, localization, security, audit retention, workspace, and read-only infrastructure pages | `settings.read` (saves require `settings.update`; advanced tuning also requires `settings.advancedPerformance`) |
| `/license`                     | Current plan, effective/missing entitlements, license status, and plan/license form                            | App shell (`app.access`); link shown with `license.read`, form and action require `license.manage`              |

Direct requests are checked on the server; see [`docs/authorization.md`](docs/authorization.md) for the catalog and guards. Settings details are in [`docs/settings.md`](docs/settings.md); license details are in [`docs/licensing.md`](docs/licensing.md). There is no module installation in M3.

## Seeded Owner

`npm run db:seed` is idempotent and creates the first Owner only if no Owner exists:

- Email: `owner@modubex.local` (override with `SEED_OWNER_EMAIL`)
- Password: `Owner!Local2026#` (override with `SEED_OWNER_PASSWORD`)

Sign in on the public sign-in page, then change the password in any real deployment. The Owner's authorization now comes from an RBAC `UserRole` assignment, not the legacy Better Auth `role` field (see [`docs/authorization.md`](docs/authorization.md)); the seed remains idempotent. The same seed creates the default `Setting` rows and the single workspace `License` row on the **Pro** plan if none exists; existing rows are never overwritten (see [`docs/settings.md`](docs/settings.md) and [`docs/licensing.md`](docs/licensing.md)).

## Commands

| Command                                   | Purpose                                               |
| ----------------------------------------- | ----------------------------------------------------- |
| `npm run dev`                             | Development server (Turbopack)                        |
| `npm run build` / `npm run start`         | Production build / serve                              |
| `npm run typecheck`                       | `tsc --noEmit`                                        |
| `npm run lint` / `npm run lint:fix`       | ESLint flat config                                    |
| `npm run format` / `npm run format:check` | Prettier                                              |
| `npm run test` / `npm run test:watch`     | Vitest                                                |
| `npm run i18n:check`                      | Core message parity (fails) and module parity (warns) |
| `npm run db:generate`                     | Generate Prisma client                                |
| `npm run db:migrate`                      | Create and apply a migration in development           |
| `npm run db:deploy`                       | Apply migrations in production                        |
| `npm run db:seed`                         | Repeatable seed: creates the first Owner if absent    |

CI runs `typecheck → lint → test → i18n:check → build`, in that order. Run the same sequence before opening a pull request.

## Layout

- `src/app/(auth)/` — public identity pages (sign-in, sign-up, 2FA, invitation acceptance); no dashboard shell
- `src/app/(app)/` — session-protected pages, including the M0 readiness overview and `/invite`
- `src/core/` — cross-cutting code (i18n registry, structured logger, config, readiness, auth DAL seam, `core/rbac/`, `core/audit/`, `core/entitlements/`, `core/settings/`)
- `src/components/ui/` — shadcn-style primitives; `src/components/layout/` — app shell
- `src/modules/` — bundled modules (populated in M4)
- `prisma/` — schema, versioned migrations, seed
- `scripts/` — repository checks; `tests/` — unit tests

Import with the `@/*` alias, which maps to `src/*`.

## i18n and theming

`en`, `fr`, and `ar` are registered in `src/core/i18n/locales.ts`; `ar` switches the document to RTL. Language choice is persisted in the `NEXT_LOCALE` cookie. Theme (`light`, `dark`, `system`) is persisted by `next-themes` and applies without a hydration flash.

Messages live in `src/core/i18n/messages/`. Core keys must exist in every locale; missing module keys only warn.

## Environment

Copy `.env.example` to `.env.local`; `.env*` files are gitignored. Secrets and infrastructure values are env-only and read-only in the UI by design. Authentication needs `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL` in addition to `DATABASE_URL`; OAuth providers activate only when both their client ID and secret are set. `AUDIT_RETENTION_DAYS` seeds the runtime `audit.retentionDays` setting (`0`, the default, means keep forever); change retention under `/settings/audit` instead. Other env-derived defaults seed the password and 2FA settings; locale starts as `en`. Runtime database values win after seeding. The license plan/key is DB state, and no infrastructure value is editable in the UI. See [`docs/settings.md`](docs/settings.md).

## Deployment

Docker and the health check are scheduled for M7. Until then, `npm run build && npm run start` is the only production path.
