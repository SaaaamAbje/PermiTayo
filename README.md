# Permitayo

An agentic AI-based business permit application, requirements verification, and status tracking
system for the Municipality of Rosario, Batangas. **Development prototype**, not an official service.

## Status

| Phase | Scope | State |
| --- | --- | --- |
| 1 | UI foundation, layouts, navigation, role dashboards | Done |
| 2 | Supabase database, authentication, role-based access control, user management | Implemented. See `docs/SETUP.md` |
| 3 | Business profiles, permit applications (draft, submit, cancel), reference numbers, applicant dashboard | Implemented. Upgrade existing projects with `supabase/phase3-upgrade.sql` (see `docs/SETUP.md`) |
| 4 | Configurable permit requirements, private document upload and replacement, manual BPLO document review | Implemented; database rules tested (see below). Upgrade existing projects with `supabase/phase4-upgrade.sql` |
| 5 | Automated document checks: PDF text extraction, OCR and AI analysis (Gemini), deterministic rules, BPLO results panel, applicant processing status | Implemented; pipeline and database rules tested with fake AI providers. Needs `GEMINI_API_KEY`. Upgrade with `supabase/phase5-upgrade.sql` |
| 6+ | Knowledge base, agentic workflows, routing, departmental review, notifications, reports | Not started |

Testing: database and Storage rules (105 tests), input validation (31) and the Phase 5 verification pipeline (20, with
fake OCR/AI providers) are automated and pass. The upload, review and automated-check screens pass type checking, lint
and a production build but have not yet been exercised against a live Supabase project or Google's API; use the manual
checks in `docs/SETUP.md` section 9. Automated checks are suggestions for BPLO personnel and never accept or reject
anything.

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
| `npm test` | Validation, verification-pipeline and database/RLS tests |
| `npm run provision:admin` | Create the first administrator (run on a trusted computer) |
| `node scripts/build-sql-bundles.mjs` | Regenerate `supabase/setup-all.sql` and the `supabase/phaseN-upgrade.sql` files from the migrations |

## Structure

```
src/app/                 routes (login, register, password reset, /dashboard/[role]/...)
src/components/          ui/, layout/, auth/, admin/, dashboards/, business/, applications/, documents/, verification/
src/lib/auth/            session lookup (dal.ts), Zod schemas, server actions
src/lib/admin/           administrator queries and actions
src/lib/business/        business profile schemas, queries and actions
src/lib/applications/    permit application schemas, queries and actions
src/lib/documents/       requirement and document schemas, queries, actions and file-type checks
src/lib/verification/    Phase 5: extraction, OCR/AI providers, prompts, rules engine, pipeline, service, actions
src/lib/supabase/        browser, server and proxy clients
src/proxy.ts             session refresh and optimistic redirects
supabase/migrations/     database schema, RLS and functions (apply in order)
supabase/tests/          database and RLS tests (PGlite)
scripts/create-admin.mjs one-time administrator provisioning
```
