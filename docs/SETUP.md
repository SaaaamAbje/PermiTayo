# Permitayo setup guide (Phase 2: database and authentication)

Permitayo needs a Supabase project for its database and sign-in. Until the
environment variables below are set, the app runs but sign-in and registration are
disabled and `/dashboard` redirects to the login page. Nothing is faked.

## 1. What you need

| Item | Where to get it |
| --- | --- |
| A Supabase project **dedicated to Permitayo** | https://supabase.com/dashboard (do not reuse a project that belongs to another system) |
| Project URL | Project Settings > API > Project URL |
| `anon` or publishable key | Project Settings > API Keys |
| `service_role` (secret) key | Same page. Used only for the one-time administrator script. |
| Node.js 20 or newer | https://nodejs.org |

## 2. Apply the database migrations

The SQL lives in `supabase/migrations/` and must be applied **in filename order**:

1. `20261103000001_core_schema.sql` — tables: `profiles`, `departments`, `department_members`, `audit_logs`
2. `20261103000002_security_rls_and_functions.sql` — grants, Row Level Security, signup trigger, administrator functions
3. `20261103000003_storage_bucket.sql` — private `permit-documents` bucket for future uploads
4. `20261103000004_seed_departments.sql` — six **proposed**, inactive departments

**Option A: SQL editor.** Open Supabase > SQL Editor, paste each file in order, and run it.

**Option B: Supabase CLI.**
```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

## 3. Configure authentication (Supabase dashboard > Authentication)

1. **URL Configuration**
   - Site URL: your app address (`http://localhost:3000` for development).
   - Redirect URLs: add `http://localhost:3000/**` and your production address with `/**`.
2. **Sign In / Providers > Email**
   - Keep **Confirm email** turned **on**. Applicants must verify their address before they can sign in.
   - Set the minimum password length to 8 or more.
3. **Email Templates.** Replace the link in two templates so they land on the app's confirmation route:
   - *Confirm signup*
     ```html
     <h2>Confirm your email</h2>
     <p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup&next=/login">Confirm your email address</a></p>
     ```
   - *Reset password*
     ```html
     <h2>Reset your password</h2>
     <p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password">Choose a new password</a></p>
     ```
4. **Email delivery.** Supabase's built-in email sender is heavily rate-limited and meant for testing. Configure your
   own SMTP provider (Authentication > Emails > SMTP Settings) before real use.

## 4. Environment variables

```bash
cp .env.example .env.local
```

| Variable | Exposed to browser? | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | anon/publishable key (protected by RLS) |
| `NEXT_PUBLIC_SITE_URL` | yes | Base URL used in email links |
| `SUPABASE_SERVICE_ROLE_KEY` | **never** | Only read by `scripts/create-admin.mjs` on your own computer |

Do **not** set `SUPABASE_SERVICE_ROLE_KEY` on your hosting platform. The web application does not use it.
`.env.local` is git-ignored.

## 5. Create the first administrator

Public registration can only ever create **applicants**. There is no administrator sign-up page.
Create the first administrator from a trusted computer:

```bash
npm run provision:admin -- --email you@example.gov.ph --name "Your Full Name"
```

The script asks for a password at a hidden prompt (12+ characters, with a letter and a number),
or reads `ADMIN_PASSWORD` if you set it for that single command. It then:

1. refuses to run if **any administrator already exists**,
2. creates the Supabase Auth user with the email pre-confirmed,
3. promotes the profile to `administrator` using the service role,
4. removes the new user again if promotion fails, and
5. writes an `admin.provisioned` audit entry.

Never paste the service-role key into chat, tickets or source files. Rotate it
(Project Settings > API Keys) if it is ever exposed.

**Alternative without the script:** register normally at `/register`, confirm the email, then run this in the
Supabase SQL editor (which runs with database-owner rights):
```sql
update public.profiles set role = 'administrator' where email = 'you@example.gov.ph';
```

Every later administrator, and all staff roles, are assigned in the app by an existing
administrator: **Dashboard > Administrator > User Management**.

## 6. Activate the participating departments

The six seeded departments are proposals and start **inactive**, because it has not been confirmed which
offices take part in Rosario's permit process. Sign in as the administrator, open **Departments**, and activate
the offices that participate. Rename, add or deactivate others as needed. Staff can be assigned only to active
departments.

## 7. Run it

```bash
npm install
npm run dev        # http://localhost:3000
```

## 8. Where security is enforced

| Concern | Enforced by |
| --- | --- |
| Who is signed in | Supabase Auth; `getUser()` is called on the server for every page (`src/lib/auth/dal.ts`) |
| Which role a user has | The `profiles.role` column, read on the server. Never a cookie, URL or form field |
| Route access | `src/proxy.ts` (redirects only), then `requireRole()` in the layout **and** in every dashboard page |
| Changing roles, status, departments | `SECURITY DEFINER` database functions that re-check `auth.uid()` is an active administrator and write the audit entry in the same transaction |
| Reading and writing rows | Row Level Security on all four tables; no policy grants "all authenticated users" access |
| Users editing their own profile | Column-level grant: only `full_name` and `phone_number` are updatable, plus a trigger as a second guard |
| Audit log | Read-only to administrators; no insert, update or delete is granted to any API role |
| Administrator lock-out | Administrators cannot change their own role or status; an advisory lock plus a last-active-administrator check protect against races |
| Open redirects | `safeInternalPath()` only accepts same-site relative paths |

## 9. Tests

```bash
npm test               # both suites below
npm run test:db        # migrations + RLS on an in-process Postgres (PGlite)
npm run test:validation  # Zod schemas and redirect safety
```

`test:db` runs the real migration files on PGlite, with a small stand-in for Supabase's `auth` and `storage`
schemas. It verifies this project's tables, grants, policies and functions. It does **not** exercise Supabase Auth,
email delivery or PostgREST. Those need a real project: register, confirm, sign in, reset a password, and
change a role as an administrator, then check the **Audit log** page.

## 10. Known limitations

- Failed sign-in attempts are not written to the audit log (there is no user to attribute them to).
- `log_self_event` lets a signed-in user add `user.login`, `user.logout` or `user.password_changed` entries about
  themselves; there is no rate limit on it yet.
- Email address changes are not offered in the UI.
- The `permit-documents` bucket limits (10 MB; PDF, JPEG, PNG) are provisional.
- The privacy notice at `/privacy` is a **draft** that the municipality's Data Protection Officer must review.
- Applicant, BPLO, department and head dashboards show real empty states (zero records) until application processing is built in the next phase.
