# AGENTS.md

## Read this first: scaffold vs. spec

- This repo is currently a bare `create-next-app` scaffold, **not** the product in `docs/PRD.md`. The PRD is the target spec, not a description of existing code.
- `package.json` has only `dev`, `build`, `start`, `lint`. There is **no test runner, typecheck/CI config, Prisma, auth, i18n, module system, lockfile, or developer/user guide yet**. Check `package.json` before assuming PRD tooling exists.
- `README.md` is stock boilerplate and stale: it says edit `app/page.tsx`; the real source is `src/app/`.

## Commands

- `npm run dev` → http://localhost:3000
- `npm run build` / `npm run start` — production build / serve
- `npm run lint` — `eslint` (flat config, ESLint 9)
- Typecheck has no script: run `npx tsc --noEmit` (`tsconfig.json` already sets `strict: true`, `noEmit: true`).
- No formatter/test/typecheck scripts or CI exist. Add them to `package.json` if you introduce them; do not assume `npm test` works.

## Layout & toolchain quirks

- App Router entrypoints: `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`. Alias `@/*` → `./src/*` (`tsconfig.json`).
- Tailwind 4 is CSS-first: styles live in `globals.css` (`@import "tailwindcss"`, `@theme inline`). There is no `tailwind.config.*` or `postcss.config.*`. `next.config.ts` maps `*.css` to the `@tailwindcss/turbopack` loader — preserve that rule when touching CSS handling.
- Next 16 typed routes: `next-env.d.ts` imports `.next/types/routes.d.ts`; `layout.tsx` uses `LayoutProps<"/">`. Use the generated `LayoutProps<...>` / page prop types instead of hand-writing `children` types.
- `.env*` is gitignored; secrets belong in environment variables, never committed.

## PRD rules that constrain implementation

Treat these as requirements to build toward, not current state. If a rule conflicts with executable config, trust the config.

- **Server-enforced security:** every route, server action, and API handler checks permissions (not role names) and entitlements on the server. Better Auth owns identity/sessions; RBAC, licensing, and audit are our own code/schema. Zod-validate all inputs, settings, and manifests; no `any` in core.
- **Modules:** `src/modules/*`, bundled at build time. Installing is a DB state change; no runtime code loading. Manifests declare permissions, zod settings schema, Prisma models/migrations, message files, plan tier, dependencies, and a cleanup hook.
- **Single entitlement seam:** all checks go through `getEntitlements()`; plan→entitlement mapping defined once.
- **Adapters over vendors:** `sendMail()` (SMTP default) and storage `put/get/delete` (local disk default, S3-compatible option). Surface and log failures; never silently swallow them.
- **Settings split:** runtime settings in DB (UI-editable, zod-validated, audit-logged, live effect); infrastructure values in env vars shown read-only in UI.
- **i18n:** `en`, `fr`, `ar` with RTL; centralized locale registry. Core keys missing in `fr`/`ar` fail CI; module keys only warn. Runtime falls back to `en`.
- **Audit:** append-only via `audit.log()`; sign-ins, role/user/module/settings/license changes, exports, and retention purges; before/after values stored.
- **RBAC guards:** Owner/Admin system roles are locked; the last Owner cannot be removed or demoted.
- **Zero fake UI:** every interactive element has a real handler and persisted effect. `docs/` updates are part of the definition of done.
- **Tenancy:** single-tenant by default, but keep data model, RBAC, settings, and licensing workspace-scope-ready.

## References

- `docs/PRD.md` — spec of record (v1 scope, data model, acceptance criteria).
