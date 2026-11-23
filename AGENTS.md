# AGENTS.md

## Current state

- M0–M5 are complete: foundation, identity & sessions, authorization core, settings & entitlements, module system & store, and dashboard & adapters. The app shell, CI, lockfile, Prisma baseline, locale registry, theming, Better Auth identity/sessions, TOTP 2FA, invitations, and the Owner seed exist; M2 adds the permission catalog, Role/Permission/RolePermission/UserRole models, `requirePermission`/`requirePagePermission` guards, custom role and user management, last-Owner protection, expanded append-only audit, the audit viewer with CSV export, and retention purge. M3 adds 13 database-backed runtime settings with live invalidation, the single `getEntitlements()` seam and licensing pages, live password/2FA policies, and the settings and license/entitlements dashboard pages. M4 adds build-time bundled modules discovered through a committed generated registry, `ModuleInstall` state (available/installed/enabled/disabled), audited lifecycle actions gated by `modules.manage`, `requireModuleInstallEntitlement()`, manifest plan/entitlements and enabled dependencies, module-prefixed permissions aggregated into the RBAC catalog, merged module messages with English fallback, and the `/modules` store with generic module settings and route pages. M5 adds the `sendMail()` adapter (SMTP default + log driver) with localized verification/reset/invitation templates and secret redaction; the storage adapter (`put`/`get`/`delete`, local disk default + S3-compatible option); the `FileAsset` model with validated avatar/site-logo uploads and permission-aware `/api/files/[id]` serving; live overview data; `/profile` (name, avatar, password, 2FA, sessions); and a permission/accessibility sweep. M6 is next.
- `docs/PRD.md` is the target spec, not a description of current code. `docs/tasks.md` is the milestone plan. If a rule conflicts with executable config, trust the config.
- `package.json` is the source of truth for available tooling. Do not invent `npm test`-style commands without adding them there.

## Commands

- `npm run dev` → http://localhost:3000
- `npm run build` / `npm run start` — production build / serve
- `npm run typecheck`, `npm run lint` (`lint:fix`), `npm run format` (`format:check`), `npm run test` (`test:watch`)
- `npm run i18n:check` — core message parity fails CI; module parity warns only
- `npm run modules:generate`, `npm run modules:check` — regenerate the committed module registry / fail CI when it is stale
- `npm run db:generate`, `npm run db:migrate`, `npm run db:deploy`, `npm run db:seed`
- CI order: `typecheck → lint → test → i18n:check → build`, with `modules:check` also failing on a stale registry. Run them before a PR.

## Layout & toolchain quirks

- App Router entrypoints: `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`. Alias `@/*` → `./src/*`.
- Auth pages live outside the dashboard shell: `src/app/(auth)/` for public identity pages, `src/app/(app)/` for session-protected pages; `requireSession()` is the DAL seam gating the latter.
- Tailwind 4 is CSS-first: styles live in `globals.css`; there is no `tailwind.config.*` or `postcss.config.*`. `next.config.ts` maps `*.css` to `@tailwindcss/turbopack` — preserve it, and keep the `next-intl` plugin wrapper.
- Next 16 generates `LayoutProps<...>` types only after `next dev`/`build`. CI typechecks before building, so layouts use explicit props instead of `LayoutProps` — don't reintroduce it without changing CI order.
- Locale is a `NEXT_LOCALE` cookie read in `src/i18n/request.ts` and the root layout (`lang`/`dir`). `ar` is RTL. Theme uses `next-themes` with `class` on `<html>`.
- Modules live in `src/modules/<id>/`; `src/modules/registry.generated.ts` is committed, generated, and never hand-edited. Run `npm run modules:generate` after manifest changes.
- `.env*` is gitignored; infrastructure values are env-only and read-only in the UI (no toggles). This includes `DATABASE_URL`, auth/OAuth secrets, and the M5 mail/storage variables (`MAIL_DRIVER`, `SMTP_*`, `STORAGE_DRIVER`, `STORAGE_*`), which are not runtime settings.

## PRD rules that constrain implementation

- **Server-enforced security:** every route, server action, and API handler checks permissions (not role names) and entitlements. Better Auth owns identity/sessions; RBAC, licensing, and audit are ours. Zod-validate all inputs, settings, and manifests; no `any` in core.
- **Modules:** `src/modules/*`, bundled at build time. Install is a DB state change; no runtime code loading. Manifests declare permissions, zod settings schema, Prisma models/migrations, messages, plan tier, dependencies, cleanup hook. Use module prefixes for shared-schema models.
- **Single entitlement seam:** all checks go through `getEntitlements()`.
- **Adapters over vendors:** `sendMail()` (SMTP default) and storage `put/get/delete` (local disk default, S3 option); log failures.
- **Settings split:** runtime settings in DB (zod, live invalidation, audited); infrastructure values env-only and read-only in UI.
- **i18n:** `en`/`fr`/`ar` with RTL, runtime fallback to `en`; core keys fail CI, module keys warn.
- **Audit:** append-only via `audit.log()`, before/after values, sign-ins, role/user/module/settings/license changes, exports, retention purges.
- **RBAC guards:** Owner/Admin system roles locked; last Owner cannot be removed or demoted.
- **Zero fake UI:** every interactive element has a real handler and persisted effect. Docs in `docs/` are part of the definition of done.
- **Tenancy:** single-tenant default, but workspace-scope-ready.

## References

- `docs/PRD.md` — spec of record (v1 scope, data model, acceptance criteria)
- `docs/tasks.md` — milestone and task plan
- `docs/modules.md` — module manifest, lifecycle, and store authoring guide

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
