# Foundation notes (M0)

Short record of decisions a builder needs before M1. Setup commands are in the root `README.md`.

## What exists

- Next.js 16 App Router, React 19, TypeScript strict, Tailwind 4 (CSS-first), ESLint 9 flat config, Prettier, Vitest.
- Prisma 6 with PostgreSQL, a baseline migration, and a repeatable seed that currently writes no domain data.
- shadcn-style primitives in `src/components/ui/` and an app shell in `src/components/layout/`.
- A readiness page that reads real checkout state (lockfile, scripts, CI, `DATABASE_URL`, locale count, generated Prisma client). It is not a mock dashboard.

## Decisions worth keeping

- **Locale is a cookie, not a route prefix.** `NEXT_LOCALE` is read in `src/i18n/request.ts` and the root layout, which sets `lang` and `dir`. A cookie switch is a server action plus `router.refresh()`. M6 did not add URL-based locale routing; core and module messages now fall back to English per key when a translation is missing.
- **CI typechecks before it builds.** Next 16 generates `LayoutProps` only after `next dev`/`build`, so layouts use explicit props. Do not switch back to generated types without changing the gate order.
- **Theme uses `next-themes` with `class` on `<html>`**, plus `suppressHydrationWarning`. M6 adds `themeInitScript` (injected in `<head>` by the root layout) to read the stored/system theme and set the `dark` class and `colorScheme` before first paint, so there is no light-mode flash; `next-themes` reconciles after hydration. The toggle uses `useSyncExternalStore` for the mounted check so it does not trip the `set-state-in-effect` lint rule.
- **Logs are structured JSON** from `src/core/logging/logger.ts`. Use `logger` instead of raw `console.*` in server code.
- **No fake UI.** Module entries in the desktop sidebar and mobile nav are real links generated only for enabled modules whose route permission the caller holds. `npm run ui:check` now enforces this automatically across TSX in `src/app` and `src/modules`; reasoned `// zero-fake-ui-allow:` exemptions are the only escape hatch.

## M1 additions

- **Auth route groups.** Public identity pages live in `src/app/(auth)/` and session-protected pages in `src/app/(app)/`; only the latter use the dashboard shell.
- **DAL seam.** `requireSession()` is the single server-side gate for protected pages and redirects unauthenticated users to sign-in; M2 will add `requirePermission()` on top of it.
- **Audit seam.** A minimal append-only `AuditLog` plus `audit.log()` now records sign-ins (success and failure); M2 extends the helper with before/after values and the full event catalog.
- **Env-only secrets.** `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, and all auth/OAuth settings are environment-only and never surface in the UI.
- **Mail was logging-only at M1.** Verification, reset, and invitation callbacks logged their link/token through the structured logger, redacted in production. M5 supersedes this with the `sendMail()` adapter (see M5 additions below).

## M2 additions

- **RBAC owns authorization.** The code-defined, zod-validated catalog lives in `src/core/rbac/permissions.ts`; `src/core/rbac/service.ts` resolves effective permissions from `UserRole → Role → RolePermission → Permission`. `User.role` is legacy and no longer authoritative. `requirePermission()` / `requirePagePermission()` sit on top of `requireSession()` in `src/core/auth/dal.ts`; checks are by permission key, never role name.
- **Workspace-ready tables.** `Role`, `Permission`, `RolePermission`, and `UserRole` carry `workspaceId` with default `""` for the single-tenant deployment. Owner, Admin, and Member are locked system roles; the last active Owner cannot be demoted, deactivated, or removed.
- **Strict audit seam.** `src/core/audit/` now writes before/after snapshots via `audit.log({ ..., client: tx, strict: true })` inside the same transaction as the mutation, so a change cannot exist without its audit record. The viewer supports user/action/date/module filters, formula-safe CSV export, and an explicit retention purge gated by `audit.manage`. `AUDIT_RETENTION_DAYS=0` (default) means keep forever; M3 moves retention into validated runtime Settings.
- **Permission-aware UI.** `/users`, `/users/[id]`, `/roles`, and `/audit` are gated on the server; controls the caller lacks permission for are hidden or disabled. Behavior and developer seams are documented in [`authorization.md`](authorization.md), [`user-guide.md`](user-guide.md), and [`developer-guide.md`](developer-guide.md).

## M5 additions

- **Adapters over vendors.** `src/core/mail/` provides `sendMail()` (SMTP default + log driver, localized verification/reset/invitation templates, URL/token redaction); `src/core/storage/` provides `put`/`get`/`delete` with local disk default and an S3-compatible option. Driver selection is env-only, not a runtime setting.
- **File uploads.** The `FileAsset` model tracks storage keys and metadata for PNG/JPEG/WebP/AVIF avatar and site-logo uploads (2 MB / 1 MB limits); bytes live in the storage adapter, and `/api/files/[id]` serves them by opaque id with owner / `users.read` checks for avatars and public site branding.
- **Live dashboard and profile.** The overview reads users, sessions, plan, module state, and recent audit from real sources; `/profile` offers working name, password, 2FA, session-revocation, and avatar controls. A permission and accessibility sweep covers the shipped pages.

See [`identity.md`](identity.md) for the M1 configuration reference and flows, and [`developer-guide.md`](developer-guide.md#mail-adapter-m5) for the M5 adapter contracts.

## Verification

Run `npm run typecheck`, `npm run lint`, `npm run ui:check`, `npm run test`, `npm run i18n:check`, `npm run modules:check`, `npm run build` — that is the M6 CI order. The overview page was also checked in the browser at desktop and mobile widths, in light/dark themes and in `en`/`fr`/`ar` (RTL), with no console errors.
