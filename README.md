# Permitayo

An agentic AI-based business permit application, requirements verification, and status tracking
system for the Municipality of Rosario, Batangas. **Development prototype**, not an official service.

## Status

| Phase | Scope | State |
| --- | --- | --- |
| 1 | UI foundation, layouts, navigation, role dashboards | Done |
| 2 | Supabase database, authentication, role-based access control, user management | Implemented. See `docs/SETUP.md` |
| 3 | Business profiles, permit applications (draft, submit, cancel), reference numbers, applicant dashboard | Implemented. Upgrade existing projects with `supabase/phase3-upgrade.sql` (see `docs/SETUP.md`) |
| 4+ | Document upload and verification, review workflow, AI | Not started |

## Quick start

```bash
npm install
cp .env.example .env.local   # then fill in your Supabase values
npm run dev
```

Full configuration steps (migrations, auth settings, first administrator): **[docs/SETUP.md](docs/SETUP.md)**.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js |
| `npm run lint` / `typecheck` | Static checks |
| `npm test` | Validation tests and database/RLS tests |
| `npm run provision:admin` | Create the first administrator (run on a trusted computer) |
| `node scripts/build-sql-bundles.mjs` | Regenerate `supabase/setup-all.sql` and `supabase/phase3-upgrade.sql` from the migrations |

## Structure

```
src/app/                 routes (login, register, password reset, /dashboard/[role]/...)
src/components/          ui/, layout/, auth/, admin/, dashboards/, business/, applications/
src/lib/auth/            session lookup (dal.ts), Zod schemas, server actions
src/lib/admin/           administrator queries and actions
src/lib/business/        business profile schemas, queries and actions
src/lib/applications/    permit application schemas, queries and actions
src/lib/supabase/        browser, server and proxy clients
src/proxy.ts             session refresh and optimistic redirects
supabase/migrations/     database schema, RLS and functions (apply in order)
supabase/tests/          database and RLS tests (PGlite)
scripts/create-admin.mjs one-time administrator provisioning
```
