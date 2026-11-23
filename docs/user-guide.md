# User guide

This guide covers the day-to-day admin flows available through M3: users, roles, invitations, settings, the audit log, and licensing. Sign-in, two-factor authentication, password reset, and invitation acceptance are described in [`identity.md`](identity.md); plan mappings and server guards are in [`licensing.md`](licensing.md), and runtime settings are detailed in [`settings.md`](settings.md). The module store and profile pages arrive in later milestones.

Every page is permission-gated. **UI actions are permission-aware**: controls you are not allowed to use are hidden or disabled, but the server checks the permission again for every action and direct request. Hiding a control never grants or removes access by itself.

## Roles in plain language

- **Owner** — full access, including granting the Owner role to someone else. Locked: it cannot be edited or deleted.
- **Admin** — everything an Owner can do except granting the Owner role. Locked: it cannot be edited or deleted.
- **Member** — everyday access to the dashboard; no user, role, or audit administration.
- **Custom roles** — created by an Admin or Owner from a chosen set of permissions; editable and deletable like any custom role.

An account can hold more than one role; its access is the combination of those roles' permissions.

## Users: `/users` and `/users/[id]`

Open **Users** from the sidebar (`/users`) with the `users.read` permission. The list shows real user records, their roles, and account status; search/filtering operates on that data.

From `/users` you can:

- **Invite a user** (`users.invite`): enter the email and choose the initial role, then submit. The invitation link is created and delivered through the logging callback used in M1/M2 (no mail service until M5.1); in local development, read the link from the server log. The invitee opens `/accept-invitation?token=...` and submits a name and password; the account is created (or an existing email reused), the chosen role is assigned, and the token is consumed. An expired or already-used token cannot be accepted. The role takes effect on the next request without a re-login. Granting Owner is additionally gated by `roles.assign_owner`. The flow is recorded as `auth.invitation.created`, `auth.invitation.accepted`, and `users.invited`.
- **Deactivate or reactivate an account** (`users.update`): a deactivated user cannot use their session until reactivated. These changes are recorded as `users.deactivated` and `users.activated`.
- **Change a role** (`users.update`): pick a role from the available roles. The change is recorded as `users.role.changed`. Granting Owner requires `roles.assign_owner` and is therefore Owner-only.

Open a row to reach `/users/[id]` for that user's detail: identity/profile fields and current role assignments require `users.read`; active sessions require `users.sessions.read`, and revoking one requires `users.update` (recorded as `users.session.revoked`). Role assignments and status changes take effect on the next request; no restart is needed.

The **last active Owner** cannot be demoted, deactivated, or deleted. If you are the only Owner, promote someone else first. System roles cannot be renamed or given a different permission bundle.

## Roles: `/roles`

`/roles` (requires `roles.read`) shows the permission catalog and the roles in use, including which permissions each role grants.

- **Create a custom role** (`roles.manage`): give it a name and select permissions. `roles.assign_owner` is reserved for the Owner role and cannot be added to a custom role.
- **Edit or delete a custom role** (`roles.manage`): changing a role affects every user assigned to it immediately. Deleting a role must leave its users with a valid remaining role, so assign a replacement first if prompted.
- **Assign roles** (`users.update`) from the role page or the user detail page; granting Owner additionally requires `roles.assign_owner`.

Owner, Admin, and Member roles are shown as locked: no edit or delete action is offered for them, and a direct request is rejected by the server. Role lifecycle events are recorded as `roles.created`, `roles.updated`, and `roles.deleted`; assignments are recorded as `users.role.changed`, with before/after role and permission snapshots.

## Settings: `/settings`

`/settings` redirects to **Site**. The settings layout requires `settings.read`; users without `settings.update` see read-only forms. Each save is validated, recorded as `settings.updated` with before/after values, and takes effect without a restart. See [`settings.md`](settings.md) for the full key list and service behavior.

- **Site / SEO** — app name, tagline, and metadata defaults used across the shell and page titles.
- **Performance** — shows whether cached settings reads are active. Pro and Enterprise users can open **Advanced** to change that switch; Free users cannot.
- **Localization** — sets the default locale used when no `NEXT_LOCALE` cookie is set. The cookie still wins when present.
- **Security** — sets password length and complexity rules and 2FA enforcement. Better Auth applies password rules immediately, and `requireSession()` sends users without 2FA to enrollment when enforcement is on.
- **Audit** — sets the retention window shown and used by `/audit`.
- **Workspace** — sets and displays the workspace time zone.
- **Infrastructure** — read-only env status only: secrets and URLs are masked, non-secret bootstrap numbers are shown, and restart-required values are labeled. There are no toggles here.

## Audit: `/audit`

`/audit` (requires `audit.read`) is a live, read-only view of security and admin events. Filter by:

- **User** — actor id or email.
- **Action** — for example `auth.sign_in.failed`, `users.role.changed`, `users.deactivated`, `audit.exported`, `audit.purged`, `license.plan.changed`, `license.key.updated`.
- **Date range** — inclusive from/to timestamps.
- **Module** — events attributed to a module.

The table shows when the event happened, who performed it, the action, the target, and the before/after snapshots when present. Entries cannot be edited or deleted from the UI.

**Export CSV** (requires `audit.export`) downloads the currently filtered result. Cells that could be interpreted as spreadsheet formulas (starting with `=`, `+`, `-`, `@`, tab, or carriage return) are escaped so they stay text. The export itself is recorded as an `audit.exported` entry with the filters and row count, not the exported content.

**Purge** (requires `audit.manage`) deletes entries older than the retention window in `audit.retentionDays` and writes an `audit.purged` entry describing what was removed. The default `0` means keep forever, so there is nothing to purge. Change the window under **Settings → Audit**; the env variable is now only the initial seed value.

## License: `/license`

The `/license` page is live. The sidebar link is shown with `license.read`; the page itself is inside the app shell (`app.access`). It shows the current plan, active and missing entitlement keys, whether a license key is set, and its validity date. Users with `license.manage` get a working form for the plan, an optional license key (leave blank to remove the stored key), and an optional validity date. Changes are validated, audited, and take effect on the next request. Pro and Enterprise users also get a link to advanced performance tuning; Free users do not.

A fresh workspace is seeded on the **Pro** plan. Free covers core access, users, custom roles, audit viewing, and basic settings; Pro adds audit export, advanced performance tuning, and module-store eligibility; Enterprise adds premium-module eligibility. Plans are cumulative. **Advanced performance tuning is unavailable on Free.** No module installation exists in M3.

Changing the plan writes `license.plan.changed` to the audit log; adding or clearing a license key writes `license.key.updated` with only key _presence_ recorded — never the key itself. Local environment and infrastructure values stay env-only and read-only in the UI; the license plan and key are database state.

## What "Forbidden" means

**Forbidden (403)** means you are signed in, but either your roles do not include the permission required or your plan lacks the entitlement required for that page or action. Nothing was changed and no data was shown. Sign in with an account that has the right role, or ask an Owner/Admin to assign it to you; for a plan gate, an Owner with `license.manage` can change the plan on `/license`. If you are not signed in, you are sent to the sign-in page instead. A forbidden result from a direct request is enforced by the server exactly as it is in the UI.
