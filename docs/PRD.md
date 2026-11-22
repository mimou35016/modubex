# Next.js Foundation Boilerplate: Product Requirements Document

Version 1.0 (draft for build) · Status: ready for implementation planning

## 1. Overview

The Next.js Foundation Boilerplate is a production-grade, reusable starting base for web applications, modular platforms, and admin dashboards. It ships a lean core (auth, RBAC, settings, audit, licensing, module store) and lets each deployment enable only the modules it needs. It is built for internal use by our own team and agency, as the base for our own tiered products and for client projects.

**Guiding principles**

- **Lean core, optional everything else.** Day one includes only foundational capabilities. Everything else is a module.
- **Zero fake UI.** Every button, toggle, and metric maps to real logic and persisted state. Nothing is a placeholder.
- **Server-enforced security.** Authorization, entitlements, and validation are always checked on the server, never only in the UI.
- **Adapters over vendors.** Email and file storage sit behind interfaces so each project can plug in its own provider.
- **Living documentation.** Every feature and pattern is documented in `docs/` as part of its definition of done.

## 2. Goals, Non-Goals, and Success Metrics

### Goals

1. A new project goes from clone to a running, branded app quickly and predictably.
2. A developer can build and ship a new module by following the guide, without reading core code.
3. The foundation meets strict quality gates and is verifiably free of fake UI.

### Non-goals (v1)

- A public marketplace or third-party module commerce.
- Runtime loading of untrusted code, or plugin sandboxing.
- Remote license server, billing, or payment processing.
- Dashboard widgets, background jobs, and UI-editable translations.
- Custom per-user permission overrides or resource-level rules.

### Success metrics

Targets are proposals and must be confirmed before launch.

| Dimension       | Metric                                                                          | Proposed target        |
| --------------- | ------------------------------------------------------------------------------- | ---------------------- |
| Speed to start  | Time from clone to running, branded app locally                                 | under 15 minutes       |
| Speed to start  | Time from clone to deployed app via Docker reference setup                      | under 30 minutes       |
| Speed to extend | A developer ships a new working module using only `docs/developer-guide`        | under 1 working day    |
| Quality         | TypeScript `strict`, zero type errors; lint, tests, and i18n checks pass in CI  | 100% of merges         |
| Quality         | Zero fake UI: every interactive element has a real handler and persisted effect | automated check passes |

## 3. Users and Use Cases

**Primary customer:** our own team and agency (internal use).

**Personas**

- **Builder (developer):** clones the boilerplate, configures it for a product or client, writes modules.
- **Owner / Admin (end customer):** runs the deployed app, manages users, roles, settings, modules, and license.
- **Member (end user):** signs in and uses the pages and modules they have permission for.

**Key use cases**

1. A builder launches a client app with only the modules that client paid for.
2. An admin installs, configures, disables, or uninstalls a module from the in-app store.
3. An admin creates a custom role and assigns it to users.
4. A product owner sells Free, Pro, and Enterprise tiers, with modules gated by plan.
5. An admin reviews, filters, and exports the audit log for a compliance request.

## 4. Tech Stack

- **Framework:** Next.js (App Router), TypeScript (`strict`)
- **Database:** PostgreSQL with Prisma
- **UI:** Tailwind CSS and shadcn/ui (`vega` style)
- **Validation:** `zod` for all inputs, settings schemas, and manifests
- **Auth:** Better Auth (identity, sessions, OAuth, TOTP 2FA)
- **i18n:** `next-intl` with `en`, `fr`, `ar` (LTR and RTL)
- **Theming:** `next-themes` (`light`, `dark`, `system`) without hydration flicker
- **Deployment:** Docker with `docker-compose` as the reference setup; core must also work on serverless

## 5. Functional Requirements

### 5.1 Authentication and Sessions

- Sign-in methods: email and password, OAuth providers, and TOTP-based two-factor authentication.
- Email verification, password reset, and invitation acceptance flows.
- Better Auth owns identity and sessions. RBAC, licensing, and audit logging live in our own schema and code.
- Security policies configurable in Settings: password rules, 2FA enforcement, and session lifetime.
- Failed and successful sign-ins are written to the audit log.

### 5.2 Users and Roles (RBAC)

- A **permission catalog** is defined in code (for example `users.read`, `roles.manage`, `modules.install`).
- Modules register their own permissions in their manifest, and these appear in the catalog automatically.
- Admins create **custom roles** in the UI by combining permissions, and assign roles to users.
- **System roles (Owner, Admin) are locked:** they cannot be edited or deleted, and the last Owner cannot be removed or demoted.
- Every route, server action, and API handler checks **permissions, not role names**, on the server.
- User management: invite, deactivate, reactivate, change role, and view sessions.
- All role and permission changes are audit-logged with before and after values.

### 5.3 Module System and App / Plugin Store

**Delivery model:** modules are bundled at build time in `src/modules/*`. Installing a module is a database state change that enables it, applies its configuration, and mounts its routes. There is no runtime code loading.

**Module manifest** (validated with `zod`) declares:

- id, name, description, version, author, and icon
- routes and sidebar entries
- permissions it registers
- a `zod` settings schema
- Prisma models and migrations it owns
- translation message files
- required plan tier or entitlement
- declared dependencies on other modules
- a cleanup hook for uninstall

**Store behavior**

- Discover: list all bundled modules with state (available, installed, enabled, disabled), required plan, and dependencies.
- Install and enable: allowed only if the license permits it, the user has permission, and all dependencies are enabled.
- Configure: the core renders a settings panel automatically from the module's `zod` schema; values persist in the database.
- Disable: removes routes and sidebar entries immediately. Blocked while other enabled modules depend on it.
- Uninstall: the admin chooses **Uninstall and keep data** or **Uninstall and delete data**. Deletion requires a typed confirmation and runs the module's cleanup hook. Reinstalling after keep-data restores prior data.
- Every state change is audit-logged, including which uninstall option was chosen.
- v1 modules may contribute pages, settings, and their own data. Widgets and background jobs are out of scope.

### 5.4 Licensing and Entitlements

- Purpose: gate our own products by tier (Free, Pro, Enterprise). The plan decides which modules and features a deployment gets.
- **Validation is local:** the plan or license key is stored in the app's database.
- A single `getEntitlements()` interface is the only way code checks entitlements, so a signed-file or remote-server implementation can replace the local one later without touching modules.
- A plan-to-entitlement mapping is defined once and referenced by module manifests.
- The License and Entitlements page shows the current plan, enabled features, and which installed modules each entitlement unlocks.
- Entitlement checks apply to routes, server actions, and module installation.
- Plan and license changes are audit-logged.

### 5.5 Audit Logs

- The core records security and admin events: sign-ins and failures, role and permission changes, user changes, module lifecycle events, settings changes, license changes, and exports.
- Modules write their own entries through a shared `audit.log()` helper.
- Before and after values are stored for settings and role changes.
- Admins can **view, filter** (user, action, date range, module), and **export to CSV**.
- **Retention policy** is configurable in Settings: keep forever (default) or auto-delete after N days. A retention purge is itself written to the audit log.
- Audit entries are append-only through the application: no UI path edits an entry.

### 5.6 Settings

Settings are persisted and apply at runtime, with a clear separation between runtime and infrastructure values.

- **Runtime settings (database, editable in the UI):** site name, branding and logo, SEO metadata defaults, performance and caching tuning, localization and regional defaults, authentication and security policies, audit retention, and workspace preferences.
- **Infrastructure settings (environment variables):** database URL, secrets, base URL, and provider credentials. These are shown in the UI as **read-only status** and are never editable there.
- Anything that genuinely requires a restart or rebuild is labeled as such and is not presented as an editable toggle.
- All settings are validated with `zod` on the server and audit-logged on change.

### 5.7 Localization and Theming

- Locales: `en`, `fr`, `ar`, with automatic `dir` handling for RTL.
- A centralized **locale registry** makes adding a language a minimal change.
- Translations are message files in the repo. Modules ship their own message files.
- **CI i18n check:** the build **fails** if a core key in `en` is missing from `fr` or `ar`. For module message files, missing keys produce a **warning only**.
- At runtime, missing keys fall back to `en` so users never see raw keys.
- Theme switching between `light`, `dark`, and `system` with no hydration mismatch or flash.

### 5.8 Transactional Email

- The core defines a `sendMail()` adapter interface. **SMTP is the default adapter**; other providers can be added as adapters.
- Required templates: email verification, password reset, and user invitation, all localized.
- Local development uses a mail catcher (for example Mailpit) documented in the developer guide.
- Send failures are surfaced and logged, never silently swallowed.

### 5.9 File Uploads and Storage

- A storage adapter interface (`put`, `get`, `delete`) with two implementations: **local disk** and **S3-compatible** storage.
- v1 use cases: user avatars and the site logo.
- Server-side validation of file type and size. Files are served through a permission-aware route where required.
- Modules can reuse the same storage contract.

### 5.10 Dashboard Pages

All pages are responsive, permission-gated, and backed by real data.

| Page                     | Purpose                                                                                             |
| ------------------------ | --------------------------------------------------------------------------------------------------- |
| Overview                 | Real summary from live data (users, installed modules, plan, recent audit events). No mock metrics. |
| App / Plugin Store       | Discover, install, configure, enable, disable, and uninstall modules.                               |
| Users and Roles          | Manage users, custom roles, and the permission catalog.                                             |
| License and Entitlements | Plan, entitlements, and what they unlock.                                                           |
| Audit Logs               | View, filter, export, and configure retention.                                                      |
| Settings                 | Site, SEO, performance, localization, security, and workspace settings.                             |
| Profile                  | Name, avatar, password, 2FA, and active sessions.                                                   |
| Module routes            | Dynamically mounted routes from enabled modules.                                                    |

### 5.11 Tenancy

- **Default: single-tenant**, one organization per deployment.
- **Multi-workspace is an optional module** that can be switched on later.
- Architectural requirement: data model, RBAC checks, settings, and licensing must be designed so a workspace scope can be added without rewriting core tables or permission logic.

### 5.12 Example Module

v1 ships one fully working example module that proves the module system end to end. It must include:

- its own routes and sidebar entry
- a `zod` settings schema rendered by the core
- its own Prisma models and migration
- translations in `en`, `fr`, and `ar`
- registered permissions
- an uninstall cleanup hook
- audit log entries through `audit.log()`

It also serves as the template referenced by the developer guide.

### 5.13 Documentation

- `docs/user-guide`: for admins and end users (sign-in, roles, store, settings, license, audit).
- `docs/developer-guide`: architecture, module authoring, manifest reference, adapters, i18n, deployment, and testing.
- A feature is not done until its documentation is updated.

## 6. Non-Functional Requirements

- **Security:** server-side authorization on every mutation; `zod` validation on all inputs; secrets only in environment variables; CSRF and session protections via Better Auth; rate limiting on authentication endpoints.
- **Type safety:** TypeScript `strict` everywhere, with no `any` in core code.
- **Performance:** server components by default; cached reads for settings and entitlements with correct invalidation on change; configurable cache tuning exposed in Settings.
- **Accessibility:** keyboard navigable and screen-reader friendly, including RTL layouts.
- **Reliability:** database migrations are versioned; seed script creates the first Owner and default settings; safe to run repeatedly.
- **Portability:** works in Docker on a VPS or container platform, and does not rely on local disk, in-process state, or unpooled database connections in the core.
- **Observability:** structured server logs; clear error pages; health check endpoint for container platforms.
- **Maintainability:** consistent folder conventions, lint and format rules, and CI that runs type checks, lint, tests, and the i18n check.

## 7. High-Level Data Model

- **User, Session, Account** (managed by Better Auth)
- **Role, Permission, RolePermission, UserRole**
- **Setting** (key, validated value, scope-ready for future workspaces)
- **ModuleInstall** (module id, state, version, config, installed by, timestamps)
- **License** (plan, key, entitlements snapshot, validity)
- **AuditLog** (actor, action, target, module, before, after, metadata, timestamp)
- **FileAsset** (storage key, owner, purpose, size, type)
- **Invitation**
- Module-owned models live in the shared Prisma schema and are removed only by the module's cleanup hook when the admin chooses to delete data.

## 8. Release Scope

### In v1

Authentication (email and password, OAuth, TOTP 2FA); Users and Roles; App / Plugin Store with dependencies; local licensing with three tiers; Audit Logs with export and retention; Settings; Profile and Overview; `en`, `fr`, `ar` with RTL and dark mode; transactional email; avatar and logo uploads; one complete example module; Docker reference deployment; `docs/` user and developer guides.

### Out of v1

Dashboard widgets; background jobs; UI translation overrides; remote license server; marketplace and third-party commerce; runtime plugin loading; custom permission overrides and resource-level rules; multi-workspace module itself (the architecture must allow it).

## 9. Acceptance Criteria

1. A fresh clone with the documented steps produces a running app, a seeded Owner, and a working sign-in.
2. No UI element exists without a real handler and persisted effect; an automated check enforces this.
3. A user without a permission cannot perform the action through the UI, a server action, or a direct request.
4. The last Owner cannot be removed, demoted, or deleted; system roles cannot be edited.
5. A module with unmet dependencies cannot be installed; a module that others depend on cannot be disabled.
6. Uninstall offers keep-data and delete-data paths; delete runs the cleanup hook; both are audit-logged.
7. Entitlement checks block routes and module installation that the current plan does not allow.
8. Changing a runtime setting takes effect without a restart; infrastructure values are visible but read-only.
9. CI fails when a core translation key is missing in `fr` or `ar`, and only warns for modules.
10. The audit log can be filtered and exported, and a retention purge produces its own audit entry.
11. Email and storage work through adapters, with SMTP and local disk working out of the box.
12. The example module exercises routes, settings, models, translations, permissions, audit logging, and cleanup, end to end.
13. The app runs from the Docker reference setup and passes a health check.
14. `docs/user-guide` and `docs/developer-guide` cover every v1 feature.

## 10. Risks and Open Questions

- **Shared schema growth:** modules add models to one Prisma schema, so disabled modules still contribute tables. Mitigation: strict module naming and prefix conventions.
- **Local license tampering:** a customer controlling their own deployment can edit a local license. Accepted for v1; the `getEntitlements()` interface keeps a signed-file or remote option open.
- **Serverless compatibility:** some adapters and caching behavior need care; the reference setup is Docker.
- **Open:** exact numeric targets for the success metrics, the initial OAuth providers to support, the default permission set for the Admin system role, and the set of Better Auth plugins to enable.
