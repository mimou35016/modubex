# Identity & sessions (M1)

This milestone establishes identity with **Better Auth 1.7.27 (pinned)**. The server is built with `betterAuth` from `better-auth/minimal` plus the Prisma adapter, with plugins `twoFactor` (TOTP), `admin`, and `nextCookies` (registered last). Better Auth owns identity and sessions; licensing remains ours. Public identity pages live in the `(auth)` route group; session-protected pages live in `(app)` and are gated by `requireSession()`.

**M2 update:** `User.role` is no longer authoritative. RBAC now owns authorization through `Role` / `Permission` / `RolePermission` / `UserRole` plus the guards in `src/core/auth/dal.ts`; the seeded Owner is assigned through `UserRole`. See [`authorization.md`](authorization.md).

## Configuration

`DATABASE_URL` (already in `.env.example`) is required. Set `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL` before starting the app. All values are environment-only, read from `.env`/`.env.local`, which are gitignored; never commit real secrets.

| Variable                          | Required | Default               | Purpose                                                                               |
| --------------------------------- | -------- | --------------------- | ------------------------------------------------------------------------------------- |
| `BETTER_AUTH_SECRET`              | Yes      | —                     | Secret used to sign/encrypt cookies and tokens. Use a long random value.              |
| `BETTER_AUTH_URL`                 | Yes      | —                     | Canonical app URL used for auth callbacks (e.g. `http://localhost:3000`).             |
| `AUTH_PASSWORD_MIN_LENGTH`        | No       | `12`                  | Minimum password length.                                                              |
| `AUTH_PASSWORD_MAX_LENGTH`        | No       | `128`                 | Maximum password length.                                                              |
| `AUTH_PASSWORD_REQUIRE_NUMBER`    | No       | `true`                | Require at least one digit.                                                           |
| `AUTH_PASSWORD_REQUIRE_SYMBOL`    | No       | `false`               | Require at least one symbol.                                                          |
| `AUTH_REQUIRE_EMAIL_VERIFICATION` | No       | `false`               | Require email verification before a usable session.                                   |
| `AUTH_2FA_REQUIRED`               | No       | `false`               | Force TOTP enrollment for users without it.                                           |
| `AUTH_GITHUB_CLIENT_ID`           | No       | —                     | GitHub OAuth client ID; the provider is enabled only when both ID and secret are set. |
| `AUTH_GITHUB_CLIENT_SECRET`       | No       | —                     | GitHub OAuth client secret.                                                           |
| `AUTH_GOOGLE_CLIENT_ID`           | No       | —                     | Google OAuth client ID; the provider is enabled only when both ID and secret are set. |
| `AUTH_GOOGLE_CLIENT_SECRET`       | No       | —                     | Google OAuth client secret.                                                           |
| `SEED_OWNER_EMAIL`                | No       | `owner@modubex.local` | Email of the first Owner created by the seed.                                         |
| `SEED_OWNER_PASSWORD`             | No       | `Owner!Local2026#`    | Password of the first Owner created by the seed.                                      |

Boolean variables accept `true`/`false` strings. No OAuth button is rendered for a provider that is not fully configured, so there are no dead buttons.

## Sign-up and sign-in

- **Sign-up** (public `(auth)` page) accepts email + password. Passwords are validated against the four `AUTH_PASSWORD_*` rules above on the server. The account is created through Better Auth; by default a session is issued immediately. With `AUTH_REQUIRE_EMAIL_VERIFICATION=true` the account must be verified first (see below).
- **Sign-in** (public `(auth)` page) accepts email + password, or a configured OAuth provider. Better Auth verifies credentials and issues a session cookie; `nextCookies` is the last plugin so cookies are set correctly from server actions.
- Better Auth `hooks.after` records **successful sign-in** (`auth.sign_in.success`) and **failed sign-in** (`auth.sign_in.failed`) events through `audit.log()`.
- If TOTP is enabled for the account, sign-in pauses at the 2FA challenge before a session is established.
- With `AUTH_2FA_REQUIRED=true`, `requireSession()` sends any signed-in user without TOTP to `/two-factor/enroll` before allowing access to `(app)` pages.

## Two-factor authentication (TOTP)

- **Enrollment** at `/two-factor/enroll`: generate a TOTP secret, display the QR code / manual key, and confirm with a current authenticator code before enabling it.
- **Challenge** during sign-in: when TOTP is enabled, the user must enter a current code from their authenticator app.
- **Enforcement** is controlled by `AUTH_2FA_REQUIRED`. With the default `false`, 2FA is opt-in; with `true`, enrollment is mandatory via the `requireSession()` redirect described above.

## Email verification and password reset (M1 logging → M5 delivery)

In M1 there was deliberately **no mail adapter**: Better Auth (or the invitation code) generated the link/token and the delivery callback wrote it to the structured logger (`src/core/logging/logger.ts`), with the token redacted in production. That was an intentional bootstrap trade-off, not the current behavior.

**M5 now delivers these messages through `sendMail()`** in `src/core/mail/`. `MAIL_DRIVER=smtp` (the default) sends via the configured SMTP server; `MAIL_DRIVER=log` records only message metadata in the application log. Verification, password-reset, and invitation messages use localized templates (`mail.subject.*` / `mail.body.*` in `en`, `fr`, `ar`, with an English fallback). Tokens and URLs are **never logged**: the auth bridge logs `[redacted]` placeholders for link and token, the log driver records only subject/length/HTML presence, and delivery errors pass through `redactMailSecrets()`. Delivery is best-effort and never rolls back the request that triggered it; invitation links remain available as a fallback in the action response when mail is unavailable. See [`developer-guide.md`](developer-guide.md#mail-adapter-m5) for the adapter contract and local Mailpit setup.

Verification and reset links can be exercised locally with Mailpit on `localhost:1025` (the SMTP default) or by setting `MAIL_DRIVER=log` to confirm that delivery was attempted.

## Invitations

Invitations use a **custom Invitation model**, not the Better Auth organization plugin.

1. A signed-in user creates an invitation at `/invite` (session-protected, in the `(app)` group).
2. The invitation produces a tokenized link, delivered through the mail adapter described above. The invitation is persisted before delivery, and the accept URL is also returned in the action response as a fallback if delivery fails.
3. The recipient opens `/accept-invitation?token=...` and submits a name and password. Acceptance creates the account through Better Auth when the email is new (or reuses an existing email); that sign-up happens first, with a compensating delete if the later step fails. Role assignment, invitation consumption, and the audit entries are then committed in one transaction — no separate sign-up or sign-in step is needed.

The invitation stores the selected `Role.id` (with the legacy role key mirrored for compatibility), so custom roles are granted correctly and role key changes do not affect pending invitations. Permissions are derived from `UserRole` rows on every request, so the invitee's access applies immediately after sign-in without a re-login. The app is single-tenant by default but the data model remains workspace-scope-ready.

## Audit events (M1)

- The `AuditLog` model is minimal and **append-only**.
- `audit.log()` is the only write seam. In M1 it records **successful sign-in** (`auth.sign_in.success`) and **failed sign-in** (`auth.sign_in.failed`), captured from Better Auth's `hooks.after`.
- M2 extends the helper with the full event catalog (`auth.sign_out`, the invitation actions, user/role changes, `audit.exported`, `audit.purged`), before/after values, a viewer, and retention. See [`authorization.md`](authorization.md#audit).

## Rate limiting

Rate limiting is **database-backed**, not in-process, so counters survive restarts and are consistent across instances. Sign-in, sign-up, 2FA endpoints (enrollment and challenge), and password-reset endpoints use **stricter** limits than general authentication endpoints. The exact counters live in the auth configuration; do not duplicate them as magic numbers elsewhere.

## Open inputs and next milestone

The PRD §10 choices that affect this milestone are implemented as defaults rather than fixed product decisions:

- **OAuth providers chosen:** GitHub and Google, but only when both client ID and secret are present.
- **2FA default off** (`AUTH_2FA_REQUIRED=false`); it is opt-in until configured otherwise.
- **Password rules:** minimum 12, maximum 128, number required, symbol not required — all overridable by env.

Confirm these defaults with the product owner. M3 moves security policies into validated runtime settings. **M2 added permission checks**: `requirePermission()` / `requirePagePermission()` sit alongside `requireSession()` on pages, server actions, and API handlers, and the temporary Owner value in Better Auth's `role` field has been replaced by RBAC `UserRole` assignments. M1 gated by session only.

## Smoke test from a fresh database

1. Start a disposable PostgreSQL container on port **55432** (remove an older one first for a truly fresh database):

   ```bash
   docker rm -f modubex-pg
   docker run --name modubex-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=modubex -p 55432:5432 -d postgres:16
   ```

2. Copy the example env and point it at that container (`.env.local` is gitignored). Generate a random `BETTER_AUTH_SECRET`:

   ```bash
   cp .env.example .env.local
   ```

   In `.env.local` set at least:

   ```dotenv
   DATABASE_URL="postgresql://postgres:postgres@localhost:55432/modubex?schema=public"
   BETTER_AUTH_SECRET="<random value>"
   BETTER_AUTH_URL="http://localhost:3000"
   ```

3. Generate the client, apply migrations, and seed the Owner:

   ```bash
   npm run db:generate
   npm run db:migrate
   npm run db:seed
   ```

4. Start the app and sign in:

   ```bash
   npm run dev
   ```

   Open http://localhost:3000 and sign in on the public sign-in page with `owner@modubex.local` / `Owner!Local2026#` (or your `SEED_OWNER_*` overrides). A successful sign-in lands in the session-protected `(app)` overview and produces a structured sign-in audit entry in the server log. Re-running `npm run db:seed` must not create a second Owner.
