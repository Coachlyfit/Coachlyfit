# Coachly Fit

SaaS platform for fitness coaches to manage clients, check-ins/forms, an exercise library, workout programs, progress tracking, and billing — with dedicated admin, coach, and client experiences.

## Stack

- **Framework**: Next.js 16 (App Router), React 19, TypeScript
- **UI**: Tailwind CSS v4 + shadcn/ui (`base-nova` style), RTL-enabled
- **Backend**: Supabase (Postgres + Auth) via `@supabase/ssr`
- **i18n**: next-intl (`ar` default/RTL, `en`)
- **State/data**: Zustand, TanStack Query, react-hook-form + zod
- **Testing**: Vitest
- **Linting**: ESLint (flat config), including a custom RTL-safety rule

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in your Supabase project credentials
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Environment variables

See [.env.example](.env.example):

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` — your Supabase project
- `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD` — for CLI/migrations
- `CRON_SECRET` — bearer token Vercel Cron sends to `src/app/api/cron` routes
- `RESEND_API_KEY` — optional, for emailed invites (invite links work without it)

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm start` | Run the production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest (run once) |

Run `npm run typecheck` and `npm run lint` before considering any change done; `npm test` for anything touching `src/domain/` or `src/lib/`.

## Project structure

```
src/app/[locale]/       routes, grouped by role:
  (admin)                 admin dashboard
  (coach)                 coach dashboard (default authenticated home)
  (client)                client portal (/c)
  (auth)                  sign in / sign up / invites
  (onboarding)             coach onboarding flow
  (marketing)              public marketing site
src/app/api/cron/       scheduled jobs (Vercel Cron)
src/domain/             business logic by feature: billing, clients, forms,
                         library, messages, notifications, programs, progress,
                         workouts — each with colocated *.test.ts
src/lib/                cross-cutting: supabase/ (client/server/admin clients
                         + generated database.types.ts), auth/, format.ts, utils.ts
src/components/         ui/ (vendored shadcn, don't hand-edit), plus
                         dashboard, kanban, forms-builder, forms-runtime,
                         charts, progress, messages, marketing, brand, providers
src/i18n/               next-intl routing/navigation/request config
src/hooks/              shared React hooks
supabase/migrations/    schema migrations
supabase/rls/           row-level security policies (the real auth boundary)
messages/{ar,en}.json   translations
```

## Roles & routing

`roleHome(locale, role)` in [src/lib/auth/role-home.ts](src/lib/auth/role-home.ts) is the single source of truth for post-login redirects: `admin` → `/admin`, `client` → `/c`, else → `/dashboard` (coach). Each route group's `layout.tsx` guards access by role.

## Conventions

- Business logic lives in `src/domain/*/*.service.ts`, unit-tested alongside as `*.test.ts`. Route handlers and Server Actions call into these — they shouldn't contain logic themselves.
- Use `src/lib/supabase/server.ts` in Server Components/Actions, `client.ts` in Client Components, `admin.ts` only for privileged/cron contexts.
- RLS policies in `supabase/rls/` are the actual authorization boundary — don't rely on app-level checks alone.
- **RTL**: locales are `ar` (default, RTL) and `en`. Never use physical-direction Tailwind classes (`pl-`, `pr-`, `ml-`, `mr-`, `left-`, `right-`, `text-left`, `text-right`) in `src/app/**` or `src/components/**` (excluding `components/ui/**`) — use logical equivalents (`ps-`/`pe-`, `ms-`/`me-`, `start-`/`end-`, `text-start`/`text-end`). Enforced by a custom `no-physical-direction` ESLint rule.

## Notes

This project runs Next.js 16, which has breaking changes vs. older versions — see [AGENTS.md](AGENTS.md) before writing Next.js-specific code.
