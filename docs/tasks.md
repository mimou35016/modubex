# Milestones & Tasks — Next.js Foundation Boilerplate (v1)

Sequenced by dependency. `ACn` = PRD §9 acceptance criterion. Docs in `docs/` update with every milestone (definition of done).

## M0 — Foundation & quality baseline

**Exit:** fresh clone → running, branded app; gates wired. **Status: complete.**

- [x] M0.1 Pin dependencies and commit `package-lock.json`.
- [x] M0.2 Add scripts: `typecheck`, `test`, `format`, `lint:fix`, `i18n:check`, `db:migrate`, `db:seed`.
- [x] M0.3 CI workflow: typecheck → lint → test → i18n:check → build, in that order.
- [x] M0.4 Prisma + PostgreSQL wiring, versioned migrations, repeatable seed script.
- [x] M0.5 Define folder conventions for core, `src/modules/*`, and shared UI.
- [x] M0.6 shadcn/ui (`vega`) base components + app shell (sidebar, header, breadcrumbs).
- [x] M0.7 Locale registry and theme plumbing (`light`/`dark`/`system`).
- [x] M0.8 Structured server logs and error pages.
- [x] M0.9 Replace stale stock README with real setup steps; add `.env.example`.

## M1 — Identity & sessions

**Exit:** AC1 — seeded Owner, working sign-in. **Status: complete.**

- [x] M1.1 Better Auth + Prisma adapter; migrate User / Session / Account.
- [x] M1.2 Email/password sign-in and sign-up; configurable password rules.
- [x] M1.3 OAuth provider wiring (providers still open in PRD §10).
- [x] M1.4 TOTP 2FA enrollment, challenge, and enforcement policy.
- [x] M1.5 Email verification, password reset, invitation acceptance.
- [x] M1.6 Rate limiting on authentication endpoints.
- [x] M1.7 Audit successful and failed sign-ins via `audit.log()`.
- [x] M1.8 Seed first Owner; sign-in smoke test from a fresh database.

## M2 — Authorization core (RBAC + audit)

**Exit:** AC3, AC4, AC10. **Status: complete.**

- [x] M2.1 Permission catalog in code, zod-validated (`users.read`, `roles.manage`, …).
- [x] M2.2 Role / Permission / RolePermission / UserRole models; seed locked Owner and Admin roles.
- [x] M2.3 Server-side `requirePermission()` guard for routes, server actions, and APIs — check permissions, not role names.
- [x] M2.4 Custom role create/edit/delete and assignment; last-Owner cannot be removed or demoted.
- [x] M2.5 User management: invite, deactivate, reactivate, change role, view sessions.
- [x] M2.6 Append-only `audit.log()` helper + AuditLog model; before/after values.
- [x] M2.7 Audit viewer with filters (user, action, date range, module) and CSV export.
- [x] M2.8 Retention policy (forever / N days) + purge that writes its own audit entry.

## M3 — Settings & entitlements

**Exit:** AC7, AC8. **Status: complete.**

- [x] M3.1 Setting model (key, validated value, scope-ready for workspaces).
- [x] M3.2 Server settings registry with zod schemas; cached reads with invalidation on change.
- [x] M3.3 Runtime settings pages: site/branding, SEO, performance/cache, localization, security, audit retention, workspace prefs.
- [x] M3.4 Infrastructure settings shown read-only; restart/rebuild-required values labeled, not toggled.
- [x] M3.5 Audit every settings change with before and after values.
- [x] M3.6 License model + single plan→entitlement mapping (Free / Pro / Enterprise).
- [x] M3.7 `getEntitlements()` interface and local implementation — the only entitlement seam.
- [x] M3.8 Enforce entitlements on routes, server actions, and module installation (module-install guard is the M4 handoff; no store in M3).
- [x] M3.9 License & Entitlements page; audit plan and license changes.

## M4 — Module system & store

**Exit:** AC5, AC6. **Status: complete.**

- [x] M4.1 zod manifest schema + build-time discovery of `src/modules/*`; define module id/model prefix convention. The generated registry is refreshed with `npm run modules:generate` and checked in CI with `npm run modules:check`.
- [x] M4.2 ModuleInstall model and states (available, installed, enabled, disabled); available is derived for bundled modules without a row.
- [x] M4.3 Install/enable gated by `modules.manage`, `requireModuleInstallEntitlement()`, manifest plan/entitlements, and enabled dependencies.
- [x] M4.4 Disable removes routes/sidebar immediately; blocked while enabled modules depend on it.
- [x] M4.5 Auto-rendered settings panel from manifest zod schema; persist config in DB with field labels from module messages.
- [x] M4.6 Uninstall keep-data vs delete-data, typed confirmation, cleanup hook, audit both paths.
- [x] M4.7 Aggregate module permissions into the central catalog with `<module-id>.*` keys and system-role defaults.
- [x] M4.8 Load enabled-module message files into the i18n registry with English fallback.
- [x] M4.9 Store UI: discover modules with state, required plan, and dependencies; generic module settings and route runner pages are live.

## M5 — Dashboard & adapters

**Exit:** AC11; no fake UI in shipped pages. **Status: complete. Next: M6 — Example module & quality gates.**

- [x] M5.1 `sendMail()` adapter interface + SMTP default; localized verification/reset/invitation templates; log failures.
- [x] M5.2 Storage adapter (`put`/`get`/`delete`) with local disk and S3-compatible implementations.
- [x] M5.3 Avatar and logo uploads with server-side type/size validation and permission-aware serving.
- [x] M5.4 Overview page from live data (users, modules, plan, recent audit) — no mock metrics.
- [x] M5.5 Profile page: name, avatar, password, 2FA, active sessions.
- [x] M5.6 Permission-gate every page and interaction; responsive and keyboard/RTL accessibility pass.
- [x] M5.7 Manual zero-fake-UI sweep: every control has a real handler and persisted effect.

## M6 — Example module & quality gates

**Exit:** AC2, AC9, AC12. **Status: complete. Next: M7 — Reference deployment & docs.**

- [x] M6.1 Example module manifest: routes, sidebar, permissions, settings schema, plan tier, dependencies.
- [x] M6.2 Example module Prisma model + migration, `en`/`fr`/`ar` messages, cleanup hook, `audit.log()` entries.
- [x] M6.3 `i18n:check`: missing core keys in `fr`/`ar` fail CI; missing module keys warn only.
- [x] M6.4 Runtime fallback to `en`; automatic RTL `dir`; flicker-free theme switching.
- [x] M6.5 CI enforces i18n check and automated zero-fake-UI check.
- [x] M6.6 Tests for RBAC guards, last-Owner rule, module lifecycle, entitlements, settings invalidation.

## M7 — Reference deployment & docs

**Exit:** AC13, AC14; all 14 acceptance criteria green. **Status: complete. Next: none — v1 delivered.** AC13 (Docker reference setup + health check) and AC14 (user/developer guides cover every v1 feature) are green.

- [x] M7.1 Dockerfile + docker-compose (app, PostgreSQL, Mailpit) reference setup.
- [x] M7.2 Health check endpoint; generated foundation readiness snapshot (no runtime filesystem reads); serverless pass — no local disk, in-process state, or unpooled connections in core.
- [x] M7.3 `docs/user-guide`: sign-in, roles, store, settings, license, audit.
- [x] M7.4 `docs/developer-guide`: architecture, module authoring, manifest reference, adapters, i18n, deployment, testing.
- [x] M7.5 Final acceptance run against all 14 criteria; close gaps.

**Late M7 details folded in:** `npm run readiness:generate` / `npm run readiness:check` maintain the committed readiness snapshot, with freshness asserted by `tests/readiness.test.ts` in the existing `npm run test` CI step (CI order unchanged). `NEXT_PUBLIC_APP_URL` is inlined at Next build time, so the Docker reference image uses its `http://localhost:3000` default and a proxied public origin requires a build-time value and image rebuild.

**Open inputs to resolve during M0–M1 (PRD §10):** OAuth providers, Admin role's default permissions, Better Auth plugins, numeric metric targets.
