# User guide

This guide covers the day-to-day admin flows available after M2: users, roles, invitations, and the audit log. Sign-in, two-factor authentication, password reset, and invitation acceptance are described in [`identity.md`](identity.md). Store, license, settings, and profile pages arrive in later milestones.

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

- **Invite a user** (`users.invite`): enter the email and choose the initial role, then submit. The invitation link is created and delivered through the logging callback used in M1/M2 (no mail service until M5.1); in local development, read the link from the server log. The invitee opens `/accept-invitation?token=...`, signs in or signs up if needed, and accepts. An expired or already-used token cannot be accepted. The flow is recorded as `auth.invitation.created`, `auth.invitation.accepted`, and `users.invited`.
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

## Audit: `/audit`

`/audit` (requires `audit.read`) is a live, read-only view of security and admin events. Filter by:

- **User** — actor id or email.
- **Action** — for example `auth.sign_in.failed`, `users.role.changed`, `users.deactivated`, `audit.exported`, `audit.purged`.
- **Date range** — inclusive from/to timestamps.
- **Module** — events attributed to a module.

The table shows when the event happened, who performed it, the action, the target, and the before/after snapshots when present. Entries cannot be edited or deleted from the UI.

**Export CSV** (requires `audit.export`) downloads the currently filtered result. Cells that could be interpreted as spreadsheet formulas (starting with `=`, `+`, `-`, `@`, tab, or carriage return) are escaped so they stay text. The export itself is recorded as an `audit.exported` entry with the filters and row count, not the exported content.

**Purge** (requires `audit.manage`) deletes entries older than the retention window configured by `AUDIT_RETENTION_DAYS` and writes an `audit.purged` entry describing what was removed. The default `0` means keep forever, so there is nothing to purge; M3 moves this setting into the runtime Settings page.

## What "Forbidden" means

**Forbidden (403)** means you are signed in, but your roles do not include the permission required for that page or action. Nothing was changed and no data was shown. Sign in with an account that has the right role, or ask an Owner/Admin to assign it to you. If you are not signed in, you are sent to the sign-in page instead. A forbidden result from a direct request is enforced by the server exactly as it is in the UI.
