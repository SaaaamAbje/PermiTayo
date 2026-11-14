# Permitayo setup guide (Phases 2 to 4: database, authentication, applications, requirements and documents)

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
3. `20261103000003_storage_bucket.sql` — private `permit-documents` bucket (used for application documents from Phase 4)
4. `20261103000004_seed_departments.sql` — six **proposed**, inactive departments
5. `20261111000001_business_and_application_schema.sql` — Phase 3 tables: `permit_types`, `business_establishments`,
   `permit_applications`, `application_status_history`, and the internal `reference_counters`
6. `20261111000002_business_and_application_security.sql` — Phase 3 grants, Row Level Security, guard and history
   triggers, and the `submit_permit_application`, `cancel_permit_application` and `set_business_record_status` functions
7. `20261111000003_seed_permit_types.sql` — the three initial, configurable application types
8. `20261114000001_requirements_and_documents_schema.sql` — Phase 4 tables: `permit_requirements`,
   `application_documents`, `document_review_history`
9. `20261114000002_requirements_and_documents_security.sql` — Phase 4 grants, Row Level Security, the
   `register_application_document` and `review_application_document` functions, and stricter Storage policies
   (replaces the Phase 2 "Applicants upload to own folder" policy)
10. `20261114000003_seed_sample_requirements.sql` — six **sample, inactive** requirements (placeholders, not official)

**Fastest way:** paste `supabase/setup-all.sql` (all ten files in order) into the SQL editor of a **new, empty** project
and run it once.

**Upgrading an existing project:** do **not** run `setup-all.sql` again. Run only the upgrade files you have not run yet,
each **once**, in order, in Supabase > SQL Editor:

- `supabase/phase3-upgrade.sql` (files 5 to 7), if the project only has Phase 2.
- `supabase/phase4-upgrade.sql` (files 8 to 10), if the project already has Phase 3.

Upgrades only add tables, functions and policies (Phase 4 also swaps one Storage policy for a stricter one). Existing
data is not touched.

After either option, run `supabase/verify.sql`. Every row's `result` must equal `expected` (16 rows).

`setup-all.sql` and `phase3-upgrade.sql` are generated from the migrations with `node scripts/build-sql-bundles.mjs`.
Regenerate them after changing a migration.

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
3. **Email Templates.** Supabase only allows editing templates after **custom SMTP** is set up (step 4). Without it the
   default templates are used: they still work, because Supabase confirms the address before redirecting to
   `/auth/confirm`, and the app shows "Email confirmed" even when the link is opened on another device. Once SMTP is set
   up, replace the link in two templates so links work on any device and password reset works everywhere:
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
4. **Email delivery.** Supabase's built-in email sender is meant for testing only: it sends a few emails per hour and,
   on newer projects, only to members of your Supabase organization. Configure your own SMTP provider (for example
   Resend or Brevo) under Authentication > Emails > SMTP Settings before real applicants register. For testing, you can
   confirm a user manually: Authentication > Users > the user > Confirm email, or in the SQL editor
   `update auth.users set email_confirmed_at = now() where email = '...';`

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
| Business ownership | `owner_id` defaults to `auth.uid()` and is not in the insert or update column grants. RLS allows insert only when `owner_id = auth.uid()` and the caller is an active applicant. A guard trigger blocks owner, reference and record-status changes |
| Who sees business profiles | The owner, plus BPLO personnel and administrators. Department staff cannot read them yet |
| Business record status | Only `set_business_record_status()` (BPLO or administrator, audited). Inactive profiles cannot be edited or used for new applications |
| Application ownership | `applicant_id` defaults to `auth.uid()`. RLS checks that the business belongs to the caller and the permit type is active, on insert and on every draft update |
| Draft vs submitted | Applicants may update or delete only `draft` rows. Status, reference number, timestamps and snapshot are not in any column grant; changes happen only in `submit_permit_application()` / `cancel_permit_application()` |
| Reference numbers | `PTY-YYYY-NNNNNN` (applications) and `BUS-YYYY-NNNNNN` (businesses) come from `next_reference_number()`, a locked per-year counter that API roles cannot call or read. Unique constraints back it up. The year is the submission year in Philippine time |
| Preserving records | A trigger refuses to delete any non-draft application, for every role. Cancelling records the time, reason and user, and keeps the reference number. Profiles with business records cannot be deleted (`on delete restrict`) |
| Status history | Written by a trigger on every status change; nobody can insert, update or delete history rows |
| Staff visibility of applications | BPLO personnel and administrators can read submitted and cancelled applications, never drafts |
| Permit requirements | Configured per permit type by BPLO personnel and administrators (RLS). `created_by` / `updated_by` are set by a trigger; the permit type of a requirement cannot be changed; every create, update, activation and deactivation is audited. Applicants read only active requirements of permit types they have applied for. Sample rows cannot be activated until renamed |
| Document files | Stored in the private `permit-documents` bucket at `{applicant}/{application}/{requirement}/{generated id}.{pdf,jpg,png}`. The original filename is never part of the path. Files are opened only through 60-second signed URLs created on the server for the owner or BPLO personnel |
| Who may upload | Storage RLS lets an applicant create an object only at that path, for their own application, for an active requirement of its permit type, and only when allowed: any time while the application is a draft; after submission only for a requirement with no document yet, or one marked Needs Resubmission. Cancelled applications accept nothing |
| File validation | Browser checks (quick feedback), then the server checks type and size before issuing a one-time upload URL, then reads the stored file's first bytes (PDF/JPEG/PNG signatures, so renamed executables are refused), then `register_application_document()` re-checks size and type from Storage's own metadata against the requirement. Any failure deletes the file, so no record or orphan file remains |
| Document statuses | No insert or update grant on `application_documents` or `document_review_history`. Uploads always start as Uploaded (never auto-accepted). Only `review_application_document()`, callable by active BPLO personnel for submitted applications, changes a status; it records reviewer, time and comment, and requires a comment for Needs Resubmission |
| Versions and history | Replacing a document keeps every earlier version (`is_current = false`) with its review outcome. Review history cannot be updated or deleted by anyone. Registered files cannot be deleted or overwritten through the API |
| Who reads documents | The owner, and BPLO personnel for non-draft applications. Administrators manage requirements but do not open applicant files; department staff have no access yet |

## 9. Tests

```bash
npm test               # both suites below
npm run test:db        # migrations + RLS on an in-process Postgres (PGlite)
npm run test:validation  # Zod schemas and redirect safety
```

`test:db` (95 tests: 37 Phase 2, 35 Phase 3, 23 Phase 4) runs the real migration files on PGlite, with a small stand-in for Supabase's `auth` and `storage`
schemas. It verifies this project's tables, grants, policies and functions. It does **not** exercise Supabase Auth,
email delivery or PostgREST. Those need a real project: register, confirm, sign in, reset a password, and
change a role as an administrator, then check the **Audit log** page.

**Phase 4 manual check on a real project** (passed type checking, lint and build; the Storage upload path has not
yet been exercised against a real Supabase project):

1. As BPLO personnel: **Permit Requirements**, pick a permit type, **Add requirement** (for example PDF only, 1 MB),
   and check it is listed as Active. Try to activate a "Sample:" row without renaming it: it is refused.
2. As an applicant with a draft of that permit type: **Documents** (or the application page > **Open requirements**).
   Upload a small PDF: a progress bar shows, then the status becomes **Uploaded**. Try a `.docx` or a file over the limit:
   it is refused with a message. Rename a `.txt` to `.pdf` and upload it: it is refused after upload and no record appears.
3. Replace the document (a confirmation appears), submit the application, and check that the document can no longer be
   replaced.
4. As BPLO personnel: **Requirements Verification** lists the application. Open it, **View** the file, then mark it
   **Needs Resubmission** with a comment.
5. As the applicant: the comment appears; **Upload corrected document**; the new version shows as **Uploaded** and the
   earlier version and its review are listed under **History**.
6. As administrator: **Audit log** shows the requirement and document events. A second applicant opening the first
   applicant's `/requirements` URL gets "not found".

**Phase 3 manual check on a real project** (the screens have passed type checking, lint and a production build, but
have not been clicked through against Supabase yet):

1. As an applicant: **My Businesses > Register a business**, save, then edit it.
2. **New Application**: pick the business, choose a type, **Save as draft**, reopen it from **My Applications**, then
   **Submit**. The detail page should show a `PTY-<year>-000001`-style reference number and two history entries.
3. Try to open the edit page of the submitted application: you are sent back to the read-only detail page.
4. **Cancel application** on it: the status becomes Cancelled and the reference number stays.
5. Sign in as a second applicant: the first applicant's business and application URLs return "not found".
6. As BPLO personnel or an administrator: **Business Profiles** lists the business; change its record status, then
   check **Audit log** as an administrator.

## 10. Known limitations

- Failed sign-in attempts are not written to the audit log (there is no user to attribute them to).
- `log_self_event` lets a signed-in user add `user.login`, `user.logout` or `user.password_changed` entries about
  themselves; there is no rate limit on it yet.
- Email address changes are not offered in the UI.
- The `permit-documents` bucket allows at most 10 MB per file and only PDF, JPEG and PNG. Each requirement sets its own
  limit up to 10 MB (default 5 MB).
- The privacy notice at `/privacy` is a **draft** that the municipality's Data Protection Officer must review.
- BPLO, department and head dashboards still show empty states. The BPLO application queue, verification and routing
  arrive in later phases. BPLO personnel can already search business profiles.
- Requirements are not checked at submission: an applicant can still submit an application with required documents
  missing (the checklist shows what is missing, and documents can be added after submission). Whether submission should
  be blocked is a policy decision for the BPLO.
- Requirements apply per permit type only. `permit_requirements.conditions` is reserved for future conditional rules
  (for example by ownership type) and is not evaluated yet.
- The seeded requirements are samples. Applicants see no checklist until BPLO personnel publish real requirements.
- Document review is manual. There is no OCR or AI checking. Administrators cannot review documents.
- Files are never deleted once recorded; there is no retention policy yet.
- The file-content (magic-byte) check runs in the app's server action. A signed-in applicant who calls
  `register_application_document` directly with their own session skips that one check; the database still enforces the
  path, owner, requirement, size and declared type (PDF/JPEG/PNG only), and files are served with that declared type.
- An applicant who starts an upload and closes the page before it finishes can leave an unregistered file in their own
  folder. It is never shown or linked to an application.
- Reviewer names are not shown to applicants ("BPLO personnel"), because applicants cannot read staff profiles.
- Submitted applications cannot be corrected. A correction workflow is planned for a later phase. The applicant can
  cancel and start a new application.
- Applicants may cancel their own submitted application (until review statuses exist). BPLO personnel and administrators
  may cancel a submitted application with a reason. There is no staff screen for this yet; it is available through the
  `cancel_permit_application` function.
- Permit types can be changed only through SQL for now (administrators are allowed by RLS). A management screen comes later.
- Business type and business category are free text. No official classification or tax category list has been added.
- Contact numbers must be Philippine numbers (mobile or landline with area code). ZIP codes must be 4 digits.
- The privacy text shown on the application review step is part of the draft notice and needs Data Protection Officer review.
