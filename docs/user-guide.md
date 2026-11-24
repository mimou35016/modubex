# User guide

This guide covers the day-to-day flows in the delivered v1 app: signing in and account security, users, roles, invitations, the module store, the bundled FAQ module, settings, the audit log, licensing, your profile, image uploads, language/theme, mail delivery, and the dashboard overview. Full authentication configuration (env variables, providers, and policies) is in [`identity.md`](identity.md); plan mappings and server guards are in [`licensing.md`](licensing.md), runtime settings are detailed in [`settings.md`](settings.md), module authoring (including the FAQ reference implementation) is in [`modules.md`](modules.md), and deployment/health checks are in [`developer-guide.md`](developer-guide.md#deployment).

Every page is permission-gated. **UI actions are permission-aware**: controls you are not allowed to use are hidden or disabled, but the server checks the permission again for every action and direct request. Hiding a control never grants or removes access by itself.

## Signing in and account security

- **Email and password sign-in** — open the public sign-in page and enter your email and password. Better Auth verifies the credentials and issues the session cookie; successful and failed sign-ins are written to the audit log. Sign-up accepts email and password with the same rules.
- **First Owner (bootstrap)** — a fresh database is prepared with `npm run db:seed`, which creates one Owner using `SEED_OWNER_EMAIL` / `SEED_OWNER_PASSWORD` (defaults `owner@modubex.local` / `Owner!Local2026#` in `.env.example`). Sign in with that account and change its password on `/profile` before doing real work. Re-running the seed does not create a second Owner or overwrite changes. Bootstrap steps are in [`identity.md`](identity.md#smoke-test-from-a-fresh-database).
- **OAuth (GitHub / Google)** — a provider button appears only when both its client id and client secret are set in the environment; if they are unset there is no dead button, so use email/password instead. Exact variable names and callback setup are in [`identity.md`](identity.md#configuration).
- **Two-factor authentication (TOTP)** — enroll at `/two-factor/enroll` (also linked from `/profile`): scan the QR code or enter the key in an authenticator app, then confirm a current code. Once enabled, sign-in pauses at the 2FA challenge before a session is established; `/two-factor` completes a pending challenge. The runtime setting `security.requireTwoFactor` under **Settings → Security** can make enrollment mandatory: when it is on, `requireSession()` sends users without TOTP to enrollment. `AUTH_2FA_REQUIRED` is only the initial default for that setting.
- **Password reset and email verification** — `/forgot-password` requests a reset link and `/reset-password` completes the change; `/verify-email` completes verification when it is required. Messages are delivered by the mail adapter and are best-effort (see [Mail delivery](#mail-delivery)). Email verification is an environment policy (`AUTH_REQUIRE_EMAIL_VERIFICATION`), while password rules and 2FA enforcement are database-backed runtime settings; the related env values only seed those settings. See [`identity.md`](identity.md#email-verification-and-password-reset-m1-logging--m5-delivery) for the full flow.
- **Invitation acceptance** — an Admin/Owner invites you from `/users`; open the tokenized `/accept-invitation?token=...` link, choose a name and password, and the account, role assignment, and audit entries are committed together. No separate sign-up or sign-in step is needed. See [Users](#users-users-and-usersid).

## Roles in plain language

- **Owner** — full access, including granting the Owner role to someone else. Locked: it cannot be edited or deleted.
- **Admin** — everything an Owner can do except granting the Owner role. Locked: it cannot be edited or deleted.
- **Member** — everyday access to the dashboard; no user, role, or audit administration.
- **Custom roles** — created by an Admin or Owner from a chosen set of permissions; editable and deletable like any custom role.

An account can hold more than one role; its access is the combination of those roles' permissions. Installed modules contribute their own `<module-id>.*` permissions to the catalog, and their defaults are added to the system roles on install/enable.

## Users: `/users` and `/users/[id]`

Open **Users** from the sidebar (`/users`) with the `users.read` permission. The list shows real user records, their roles, and account status; search/filtering operates on that data.

From `/users` you can:

- **Invite a user** (`users.invite`): enter the email and choose the initial role, then submit. The invitation is persisted first, then its link is delivered by `sendMail()` through the configured mail driver (SMTP by default, or `log` for local capture). Delivery is best-effort: if it fails, the invitation still exists and the accept URL is returned in the form response as a fallback, so you can copy it from the invite page and send it yourself. The invitee opens `/accept-invitation?token=...` and submits a name and password; the account is created (or an existing email reused), the chosen role is assigned, and the token is consumed. An expired or already-used token cannot be accepted. The role takes effect on the next request without a re-login. Granting Owner is additionally gated by `roles.assign_owner`. The flow is recorded as `auth.invitation.created`, `auth.invitation.accepted`, and `users.invited`.
- **Deactivate or reactivate an account** (`users.update`): a deactivated user cannot use their session until reactivated. These changes are recorded as `users.deactivated` and `users.activated`.
- **Change a role** (`users.update`): pick a role from the available roles. The change is recorded as `users.role.changed`. Granting Owner requires `roles.assign_owner` and is therefore Owner-only.

Open a row to reach `/users/[id]` for that user's detail: identity/profile fields and current role assignments require `users.read`; active sessions require `users.sessions.read`, and revoking one requires `users.update` (recorded as `users.session.revoked`). Role assignments and status changes take effect on the next request; no restart is needed.

The **last active Owner** cannot be demoted, deactivated, or deleted. If you are the only Owner, promote someone else first. System roles cannot be renamed or given a different permission bundle.

## Mail delivery

Verification, password-reset, and invitation messages are rendered from localized templates (`mail.subject.*` and `mail.body.*` in `en`, `fr`, and `ar`) and sent through the `sendMail()` adapter. The driver is infrastructure-only: `MAIL_DRIVER=smtp` (the default) sends through the configured SMTP server, while `MAIL_DRIVER=log` records only message metadata in the application log instead of sending. Tokens and links are never written to logs, and delivery errors are logged with URLs and tokens redacted. A failed delivery never rolls back the request that triggered it: for invitations, the saved invitation and its accept link returned in the invite form remain the fallback. See [`developer-guide.md`](developer-guide.md#mail-adapter-m5) for the adapter contract.

## Roles: `/roles`

`/roles` (requires `roles.read`) shows the permission catalog and the roles in use, including which permissions each role grants.

- **Create a custom role** (`roles.manage`): give it a name and select permissions. `roles.assign_owner` is reserved for the Owner role and cannot be added to a custom role.
- **Edit or delete a custom role** (`roles.manage`): changing a role affects every user assigned to it immediately. Deleting a role must leave its users with a valid remaining role, so assign a replacement first if prompted.
- **Assign roles** (`users.update`) from the role page or the user detail page; granting Owner additionally requires `roles.assign_owner`.

Owner, Admin, and Member roles are shown as locked: no edit or delete action is offered for them, and a direct request is rejected by the server. Role lifecycle events are recorded as `roles.created`, `roles.updated`, and `roles.deleted`; assignments are recorded as `users.role.changed`, with before/after role and permission snapshots.

## Profile: `/profile`

Every signed-in user has a profile page at `/profile` (linked from the header and sidebar). It shows your avatar (or initials), email, and 2FA status, with working forms for:

- **Name** — change your display name; the change is validated, audited, and reflected in the shell immediately.
- **Avatar** — upload or remove your profile photo (see [Avatars and site logo](#avatars-and-site-logo)).
- **Password** — enter your current password and a new one that satisfies the live security policy. Other sessions stay signed in.
- **Two-factor authentication** — see whether TOTP is enabled, then follow the links to enroll/manage it or to run a challenge.
- **Active sessions** — the most recent unexpired sessions with IP address, user agent, and dates; your current session is labeled. **Revoke** ends a session immediately and is audited.

All of these actions are self-only: the session is the identity source, so crafting a request with someone else's user or session id cannot change their profile.

## Avatars and site logo

On `/profile`, **Profile photo** accepts a PNG, JPEG, WebP, or AVIF image up to 2 MB; uploading replaces your current avatar and **Remove** deletes it. On `/settings/site`, users with `settings.update` get the same controls for the **site logo** (same formats, up to 1 MB). SVG files are rejected even when renamed or given a safe content type.

Uploads are validated on the server, stored through the configured storage adapter, and tracked as `FileAsset` records; replacing an image removes the previous object. Audit entries (`files.uploaded` and `files.deleted`) record metadata only — never file bytes or storage keys. Images are served by `/api/files/<id>` using an opaque asset id: the site logo is public branding, while avatars require a session and either ownership of the avatar or the `users.read` permission.

## Settings: `/settings`

`/settings` redirects to **Site**. The settings layout requires `settings.read`; users without `settings.update` see read-only forms. Each save is validated, recorded as `settings.updated` with before/after values, and takes effect without a restart. See [`settings.md`](settings.md) for the full key list and service behavior.

- **Site / SEO** — app name, tagline, and metadata defaults used across the shell and page titles, plus the site-logo upload (stored as a `FileAsset`, not a runtime setting).
- **Performance** — shows whether cached settings reads are active. Pro and Enterprise users can open **Advanced** to change that switch; Free users cannot.
- **Localization** — sets the default locale used when no `NEXT_LOCALE` cookie is set. The cookie still wins when present.
- **Security** — sets password length and complexity rules and 2FA enforcement. Better Auth applies password rules immediately, and `requireSession()` sends users without 2FA to enrollment when enforcement is on.
- **Audit** — sets the retention window shown and used by `/audit`.
- **Workspace** — sets and displays the workspace time zone.
- **Infrastructure** — read-only env status only: secrets and URLs are masked, non-secret bootstrap numbers are shown, and restart-required values are labeled. There are no toggles here.

## Modules: `/modules` (App store)

Open **App store** from the sidebar (`/modules`, requires `modules.read`; management actions require `modules.manage`). The list shows the modules bundled with this build and their **real** state — `available`, `installed`, `enabled`, or `disabled` — plus version, required plan/entitlement, and dependencies. A module you have never installed is shown as `available` because no `ModuleInstall` row exists yet.

- **Install** (`modules.manage`): the plan must include `modules.store` and any key the module requires, and every dependency must already be enabled. Installation records the version and you as the installer; it does not make the module live yet.
- **Enable** (`modules.manage`): runs the same plan and dependency checks, then makes the module's pages, sidebar entries, and permissions available immediately. Its messages join the UI with English fallback; disabling removes them again.
- **Configure**: an installed module (enabled or disabled) has a **Settings** action at `/modules/<module-id>/settings`, which also requires the `modules.store` entitlement. The form is generated from the module's validated schema; save validates input before persisting and takes effect without a restart. Invalid values are rejected and nothing is stored.
- **Use** module pages from the module's sidebar/mobile-nav entries or directly at `/modules/run/<module-id>/…`. An enabled module's declared sidebar links appear in the desktop sidebar and the mobile navigation bar only while you hold the route's permission; links and pages are still permission-gated on the server, and a disabled module's routes are unavailable even if you know the URL.
- **Disable** (`modules.manage`): removes routes and sidebar entries immediately but keeps configuration and data, so you can re-enable later. You cannot disable a module while another **enabled** module depends on it; the store names the blockers.
- **Uninstall** (`modules.manage`): choose **Uninstall and keep data** or **Uninstall and delete data**. Keeping data preserves the module's rows and configuration and returns it to `available`, so reinstalling restores your setup. Deleting data requires typing the exact module id to confirm; it then runs the module's cleanup hook and removes that data permanently. Both options are blocked by enabled dependents and are recorded in the audit log with the option you chose.

Installing, enabling, disabling, changing settings, and both uninstall paths write strict before/after audit entries with module-prefixed actions. On a Free plan the store is not eligible (`modules.store` is Pro+), and Enterprise-only modules also require `modules.premium`. A forbidden result means either the permission or the plan check failed; nothing was changed. See [`licensing.md`](licensing.md) and [`modules.md`](modules.md).

## FAQ module: `/modules/run/faq`

The bundled **FAQ** module is a working store module. A user with `modules.manage` installs and enables it from the App store (Pro plan; no dependencies). Once it is enabled, **Questions** and **Manage questions** appear in the desktop sidebar and mobile nav only for users who hold `faq.read` and `faq.manage` respectively; direct URLs are gated by the same permissions, and a disabled module's routes are unavailable.

- **View questions** (`faq.read`, `/modules/run/faq`): published questions appear in order of position, then creation. Only as many as **Questions per page** are shown; the module setting accepts 1–50 and defaults to 10. When no questions are published, the page shows the configured **Empty state message** (default: “No questions yet.”).
- **Manage questions** (`faq.manage`, `/modules/run/faq/manage`): add a question with text, answer, and position (0–10000), edit any entry, publish or unpublish it, or delete it after ticking the confirmation checkbox. The list shows drafts as well as published questions. Every create, edit, publication change, and delete is validated on the server, written with before/after `faq.question.*` audit entries, and reflected on the questions page immediately; invalid input or missing permission changes nothing.
- **Configure** (`modules.manage` plus the `modules.store` entitlement, `/modules/faq/settings`): set **Questions per page** and the **Empty state message** shown on the FAQ page. The generic module settings form saves valid values immediately, and works whether the module is enabled or disabled.

Uninstalling with **delete data** requires typing the module id `faq` and permanently removes its questions through the module's cleanup hook. **Keep data** preserves them so reinstalling restores your setup.

## Audit: `/audit`

`/audit` (requires `audit.read`) is a live, read-only view of security and admin events. Filter by:

- **User** — actor id or email.
- **Action** — for example `auth.sign_in.failed`, `auth.password.changed`, `profile.updated`, `users.role.changed`, `users.deactivated`, `files.uploaded`, `files.deleted`, `faq.question.created`, `faq.question.published`, `audit.exported`, `audit.purged`, `license.plan.changed`, `license.key.updated`, `modules.installed`, `modules.uninstalled`.
- **Date range** — inclusive from/to timestamps.
- **Module** — events attributed to a module.

The table shows when the event happened, who performed it, the action, the target, and the before/after snapshots when present. Entries cannot be edited or deleted from the UI.

**Export CSV** (requires `audit.export`) downloads the currently filtered result. Cells that could be interpreted as spreadsheet formulas (starting with `=`, `+`, `-`, `@`, tab, or carriage return) are escaped so they stay text. The export itself is recorded as an `audit.exported` entry with the filters and row count, not the exported content.

**Purge** (requires `audit.manage`) deletes entries older than the retention window in `audit.retentionDays` and writes an `audit.purged` entry describing what was removed. The default `0` means keep forever, so there is nothing to purge. Change the window under **Settings → Audit**; the env variable is now only the initial seed value.

## License: `/license`

The `/license` page is live. The sidebar link is shown with `license.read`; the page itself is inside the app shell (`app.access`). It shows the current plan, active and missing entitlement keys, whether a license key is set, and its validity date. Users with `license.manage` get a working form for the plan, an optional license key (leave blank to remove the stored key), and an optional validity date. Changes are validated, audited, and take effect on the next request. Pro and Enterprise users also get a link to advanced performance tuning; Free users do not.

A fresh workspace is seeded on the **Pro** plan. Free covers core access, users, custom roles, audit viewing, and basic settings; Pro adds audit export, advanced performance tuning, and module-store eligibility; Enterprise adds premium-module eligibility. Plans are cumulative. **Advanced performance tuning is unavailable on Free.** Module installation is gated by `modules.store` (Pro+) and each module's own plan/entitlements (see [Modules](#modules-modules-app-store)).

Changing the plan writes `license.plan.changed` to the audit log; adding or clearing a license key writes `license.key.updated` with only key _presence_ recorded — never the key itself. Local environment and infrastructure values stay env-only and read-only in the UI; the license plan and key are database state.

## Dashboard overview: `/`

The dashboard home (`/`) is live data, not a mock. It shows the current plan, site name, default locale, audit retention, and module counts from the database and the generated registry, plus a readiness checklist. With `users.read` you also see the total user count and active sessions; with `audit.read` you see the five most recent audit entries with links to the full viewer. Sections you lack permission for are omitted entirely rather than shown as empty placeholders.

## Language and appearance

The default locale is set under **Settings → Localization**; an existing `NEXT_LOCALE` cookie wins over that default, so you can switch language without changing the workspace default. `en`, `fr`, and `ar` are supported, and `ar` switches the app to a right-to-left layout. Choose **Light**, **Dark**, or **System** from the theme control in the shell; the choice is applied before first paint and follows your system setting while **System** is selected.

## What "Forbidden" means

**Forbidden (403)** means you are signed in, but either your roles do not include the permission required or your plan lacks the entitlement required for that page or action. Nothing was changed and no data was shown. Sign in with an account that has the right role, or ask an Owner/Admin to assign it to you; for a plan gate, an Owner with `license.manage` can change the plan on `/license`. If you are not signed in, you are sent to the sign-in page instead. A forbidden result from a direct request is enforced by the server exactly as it is in the UI.
