# Settings (M3)

Runtime settings are database state and take effect without a restart. Infrastructure values are environment-only, shown as read-only status in the UI, and never stored as settings. See [`developer-guide.md`](developer-guide.md#settings-m3) for the code seams and [`user-guide.md`](user-guide.md#settings-settings) for the admin flow.

## Storage and registry

`Setting` (`prisma/schema.prisma`) has a unique `key`, a JSON `value`, `workspaceId` (default `""` for the single-tenant deployment), optional `updatedById`, and `createdAt` / `updatedAt`. All runtime keys are declared once in `src/core/settings/registry.ts`; each descriptor supplies a category, an i18n label, a zod schema, and a default.

`src/core/settings/registry.ts` defines 13 editable keys in seven categories; the eighth UI category, `infrastructure`, is metadata only:

| Category         | Keys and defaults                                                                                                                                                                                                                        |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `site`           | `site.name` (`Modubex`), `site.tagline` (`The foundation for your next product`)                                                                                                                                                         |
| `seo`            | `seo.description` (`""`), `seo.titleSuffix` (`Modubex`)                                                                                                                                                                                  |
| `performance`    | `performance.cacheReads` (`true`; editing additionally requires the `settings.advancedPerformance` entitlement)                                                                                                                          |
| `localization`   | `localization.defaultLocale` (`en`; validated against the registered `en` / `fr` / `ar` locales)                                                                                                                                         |
| `security`       | `security.passwordMinLength` (env bootstrap, clamped to 8–128), `security.passwordMaxLength` (env bootstrap, clamped to 8–256), `security.requireNumber`, `security.requireSymbol`, `security.requireTwoFactor` (env bootstrap booleans) |
| `audit`          | `audit.retentionDays` (env bootstrap; integer 0–3650, with `0` meaning keep forever)                                                                                                                                                     |
| `workspace`      | `workspace.timeZone` (`UTC`; validated as an IANA name with `Intl.DateTimeFormat`)                                                                                                                                                       |
| `infrastructure` | Metadata only; no editable keys                                                                                                                                                                                                          |

Password, 2FA, and audit-retention defaults come from env values at bootstrap; numeric defaults are clamped into the registry bounds so a permissive environment cannot seed an invalid runtime value. `ensureDefaultSettings()` is create-only (`createMany` with `skipDuplicates`), so `npm run db:seed` preserves edited values.

`infrastructureRegistry` is separate and frozen. It exposes `infrastructure.databaseUrl`, `infrastructure.authUrl`, `infrastructure.authSecret`, `infrastructure.passwordMinBootstrap`, and `infrastructure.auditRetentionBootstrap` with a masked `configured` boolean plus `sensitive` and `restartRequired` flags. No environment value is stored in, or returned by, the registry; `updateSettings()` rejects both infrastructure and unknown keys.

## Reads, writes, and invalidation

- `getSettingValue()` and `getAllSettings()` read one `unstable_cache` snapshot tagged `settings` with a 300-second revalidation window. Missing, invalid, or unreadable rows fall back to registry defaults with a structured log warning; no stored value can bypass its zod schema.
- `performance.cacheReads` is the tuning switch. When it is `false`, settings reads go straight to Prisma and bypass the Next cache; entitlement plan reads also bypass the `license` tag. The default is `true`.
- `updateSettings(values, actor)` zod-parses every value, skips no-op changes, upserts changed rows with `updatedById` in one `prisma.$transaction`, and writes one `settings.updated` audit entry with before/after maps via `audit.log({ ..., client: tx, strict: true })`. It then calls `revalidateTag("settings", { expire: 0 })` plus `revalidatePath("/settings")` and `revalidatePath("/audit")`, so changes apply on the next request. Authorization belongs to the caller.
- `updateSettingsAction` in `src/app/actions/settings.ts` requires `settings.update`, coerces form strings to the descriptor's type, validates them against the registry schema, and requires `settings.advancedPerformance` when `performance.cacheReads` is submitted. Infrastructure metadata never reaches this action.

## Pages

`/settings` redirects to `/settings/site`. The `settings` layout requires `settings.read`; users without `settings.update` see read-only forms.

| Route                            | Contents                                                                                               |
| -------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `/settings/site`                 | Site name and tagline                                                                                  |
| `/settings/seo`                  | SEO description and title suffix                                                                       |
| `/settings/performance`          | Cache-read status and, for Pro/Enterprise, a link to advanced tuning                                   |
| `/settings/performance/advanced` | `performance.cacheReads` editing; requires `settings.advancedPerformance` as well as `settings.update` |
| `/settings/localization`         | Default locale used when the `NEXT_LOCALE` cookie is absent or invalid                                 |
| `/settings/security`             | Password rules and 2FA enforcement, with the currently effective policy shown                          |
| `/settings/audit`                | Audit retention days and a link to `/audit` when the user has `audit.read`                             |
| `/settings/workspace`            | Workspace time zone and its resolved value                                                             |
| `/settings/infrastructure`       | Read-only env status: no values, no toggles, and badges for sensitive / restart-required entries       |

## What the settings actually change

- `site.name` and `site.tagline` appear in the dashboard shell; `site.name`, `seo.description`, and `seo.titleSuffix` drive generated metadata.
- `localization.defaultLocale` supplies the locale in `src/i18n/request.ts` and the root layout when `NEXT_LOCALE` is missing or invalid; registered locales still determine LTR/RTL.
- Password rules are resolved live by Better Auth hooks through `getPasswordRules()`, and `requireSession()` redirects users without 2FA to enrollment when `security.requireTwoFactor` is on. Sign-up and reset forms use the same rules.
- `audit.retentionDays` is read by `/audit` for its retention badge and by the explicit purge action; `0` means nothing is eligible for deletion and the purge writes its own `audit.purged` entry.
- `workspace.timeZone` is shown resolved on its settings page. Infrastructure values remain env-only and read-only, and entries that need a restart are labeled as such.
