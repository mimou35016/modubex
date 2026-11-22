# Modubex

A lean, modular foundation for web applications and admin dashboards. See [`docs/PRD.md`](docs/PRD.md) for the product spec and [`docs/tasks.md`](docs/tasks.md) for the milestone plan.

Current state: **M0 — foundation and quality baseline**. Identity, RBAC, modules, and dashboard pages arrive in later milestones.

## Requirements

- Node.js 24 and npm 12
- PostgreSQL (needed once M1 adds identity tables; not required to run M0 locally)

## Run locally

```bash
npm ci
cp .env.example .env.local
npm run db:generate
npm run dev
```

Open http://localhost:3000. The overview page reports readiness from the actual checkout, so a missing `DATABASE_URL` is shown as pending rather than hidden.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server (Turbopack) |
| `npm run build` / `npm run start` | Production build / serve |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` / `npm run lint:fix` | ESLint flat config |
| `npm run format` / `npm run format:check` | Prettier |
| `npm run test` / `npm run test:watch` | Vitest |
| `npm run i18n:check` | Core message parity (fails) and module parity (warns) |
| `npm run db:generate` | Generate Prisma client |
| `npm run db:migrate` | Create and apply a migration in development |
| `npm run db:deploy` | Apply migrations in production |
| `npm run db:seed` | Repeatable seed (no domain data in M0) |

CI runs `typecheck → lint → test → i18n:check → build`, in that order. Run the same sequence before opening a pull request.

## Layout

- `src/app/` — App Router entrypoints, providers, error and not-found pages
- `src/core/` — cross-cutting code (i18n registry, structured logger, config, readiness)
- `src/components/ui/` — shadcn-style primitives; `src/components/layout/` — app shell
- `src/modules/` — bundled modules (populated in M4)
- `prisma/` — schema, versioned migrations, seed
- `scripts/` — repository checks; `tests/` — unit tests

Import with the `@/*` alias, which maps to `src/*`.

## i18n and theming

`en`, `fr`, and `ar` are registered in `src/core/i18n/locales.ts`; `ar` switches the document to RTL. Language choice is persisted in the `NEXT_LOCALE` cookie. Theme (`light`, `dark`, `system`) is persisted by `next-themes` and applies without a hydration flash.

Messages live in `src/core/i18n/messages/`. Core keys must exist in every locale; missing module keys only warn.

## Environment

Copy `.env.example` to `.env.local`. `.env*` files are gitignored. Infrastructure values are read-only in the UI by design; runtime settings will be stored in the database in M3.

## Deployment

Docker and the health check are scheduled for M7. Until then, `npm run build && npm run start` is the only production path.
