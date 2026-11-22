# Foundation notes (M0)

Short record of decisions a builder needs before M1. Setup commands are in the root `README.md`.

## What exists
- Next.js 16 App Router, React 19, TypeScript strict, Tailwind 4 (CSS-first), ESLint 9 flat config, Prettier, Vitest.
- Prisma 6 with PostgreSQL, a baseline migration, and a repeatable seed that currently writes no domain data.
- shadcn-style primitives in `src/components/ui/` and an app shell in `src/components/layout/`.
- A readiness page that reads real checkout state (lockfile, scripts, CI, `DATABASE_URL`, locale count, generated Prisma client). It is not a mock dashboard.

## Decisions worth keeping
- **Locale is a cookie, not a route prefix (for now).** `NEXT_LOCALE` is read in `src/i18n/request.ts` and the root layout, which sets `lang` and `dir`. A cookie switch is a server action plus `router.refresh()`, so no locale-prefixed routes exist yet. Revisit when M6 adds URL-based locale routing.
- **CI typechecks before it builds.** Next 16 generates `LayoutProps` only after `next dev`/`build`, so layouts use explicit props. Do not switch back to generated types without changing the gate order.
- **Theme uses `next-themes` with `class` on `<html>`**, plus `suppressHydrationWarning`. The toggle uses `useSyncExternalStore` for the mounted check so it does not flash or trip the `set-state-in-effect` lint rule.
- **Logs are structured JSON** from `src/core/logging/logger.ts`. Use `logger` instead of raw `console.*` in server code.
- **No fake UI.** Sidebar entries for future modules are non-interactive labels with their milestone number; there are no dead links or handlers without persisted effects.

## Verification
Run `npm run typecheck`, `npm run lint`, `npm run test`, `npm run i18n:check`, `npm run build`. The overview page was also checked in the browser at desktop and mobile widths, in light/dark themes and in `en`/`fr`/`ar` (RTL), with no console errors.
