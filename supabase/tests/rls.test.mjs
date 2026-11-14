// Database and RLS tests for Permitayo (Phase 2).
//
// Runs the real migrations in supabase/migrations on PGlite, an in-process
// PostgreSQL engine. Supabase's own `auth` and `storage` schemas and the API
// roles (anon, authenticated, service_role) are simulated by a small shim, so
// this verifies OUR tables, grants, policies and functions, not Supabase itself.
// Run:  npm run test:db

import { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(here, "..", "migrations");

const db = new PGlite();

// ---------------------------------------------------------------------------
// Supabase shim (roles, auth schema, storage schema, default privileges)
// ---------------------------------------------------------------------------
await db.exec(`
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;

  create schema auth;
  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text unique,
    raw_user_meta_data jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
  );
  create function auth.uid() returns uuid language sql stable as $$
    select coalesce(
      nullif(current_setting('request.jwt.claim.sub', true), ''),
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
    )::uuid
  $$;
  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;

  create schema storage;
  create table storage.buckets (
    id text primary key, name text, public boolean default false,
    file_size_limit bigint, allowed_mime_types text[]
  );
  create table storage.objects (
    id uuid primary key default gen_random_uuid(),
    bucket_id text references storage.buckets (id),
    name text not null,
    owner uuid,
    -- Supabase Storage fills this from the uploaded file (size in bytes, mimetype).
    metadata jsonb,
    unique (bucket_id, name)
  );
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language sql immutable as $$
    select (string_to_array(name, '/'))[1:greatest(array_length(string_to_array(name, '/'), 1) - 1, 0)]
  $$;
  grant usage on schema storage to anon, authenticated, service_role;
  grant select, insert, update, delete on storage.objects to authenticated;
  grant select on storage.buckets to authenticated;

  -- Same defaults a hosted Supabase project applies in the public schema.
  grant usage on schema public to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
`);

for (const file of readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort()) {
  await db.exec(readFileSync(path.join(migrationsDir, file), "utf8"));
}

// ---------------------------------------------------------------------------
// Tiny test framework
// ---------------------------------------------------------------------------
const results = [];
async function test(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
  } catch (err) {
    results.push({ name, ok: false, error: err instanceof Error ? err.message : String(err) });
  }
}
function assert(cond, message) {
  if (!cond) throw new Error(message ?? "assertion failed");
}
function eq(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message ?? "values differ"}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}
async function rejects(fn, pattern, message) {
  try {
    await fn();
  } catch (err) {
    const text = err instanceof Error ? err.message : String(err);
    if (pattern && !pattern.test(text)) {
      throw new Error(`${message ?? "wrong error"}: got "${text}"`);
    }
    return;
  }
  throw new Error(`${message ?? "expected an error"}: statement succeeded`);
}

/** Run fn with the database acting as a signed-in user (or anon when userId is null). */
async function as(userId, fn) {
  if (userId) {
    await db.exec(
      `set role authenticated; select set_config('request.jwt.claims', '{"sub":"${userId}","role":"authenticated"}', false);`,
    );
  } else {
    await db.exec(`set role anon; select set_config('request.jwt.claims', '', false);`);
  }
  try {
    return await fn();
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claims', '', false);`);
  }
}
const q = async (sql, params) => (await db.query(sql, params)).rows;
const count = async (sql, params) => (await q(sql, params)).length;

/** Create an auth user (fires the real signup trigger), then set role/status as the service role would. */
async function makeUser(label, { role = "applicant", status = "active", meta = {} } = {}) {
  const id = randomUUID();
  await db.query(
    `insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3::jsonb)`,
    [id, `${label}-${id.slice(0, 6)}@example.invalid`, JSON.stringify({ full_name: `Test ${label}`, ...meta })],
  );
  if (role !== "applicant" || status !== "active") {
    await db.query(`update public.profiles set role = $2, account_status = $3 where id = $1`, [id, role, status]);
  }
  return id;
}
const dept = async (code) => (await q(`select id from public.departments where department_code = $1`, [code]))[0].id;
const member = (profile, department, position = null) =>
  db.query(`insert into public.department_members (profile_id, department_id, department_position) values ($1,$2,$3)`, [profile, department, position]);
const auditCount = (action, entity) =>
  count(`select 1 from public.audit_logs where action = $1 and entity_id = $2`, [action, entity]);

// Activate two departments so assignments are possible (seed data is inactive by design).
await db.exec(`update public.departments set is_active = true where department_code in ('MEO','BFP','BPLO')`);
const MEO = await dept("MEO");
const BFP = await dept("BFP");
const MHO = await dept("MHO"); // stays inactive

// Cast of users
const applicantA = await makeUser("applicantA");
const applicantB = await makeUser("applicantB");
const bplo = await makeUser("bplo", { role: "bplo_personnel" });
const meoStaff = await makeUser("meoStaff", { role: "department_personnel" });
const bfpStaff = await makeUser("bfpStaff", { role: "department_personnel" });
const meoHead = await makeUser("meoHead", { role: "department_head" });
const admin1 = await makeUser("admin1", { role: "administrator" });
const admin2 = await makeUser("admin2", { role: "administrator" });
await member(meoStaff, MEO, "Reviewer");
await member(bfpStaff, BFP, "Inspector");
await member(meoHead, MEO, "Head");

// ---------------------------------------------------------------------------
// A. Profile creation and privilege escalation at signup  (checklist 11, 13)
// ---------------------------------------------------------------------------
await test("13. signup creates a profile with the same id as the auth user", async () => {
  const rows = await q(`select p.id, u.id as uid from public.profiles p join auth.users u on u.id = p.id where p.id = $1`, [applicantA]);
  eq(rows.length, 1);
  eq(rows[0].id, rows[0].uid);
});

await test("11. signup metadata cannot create privileged accounts (role forced to applicant)", async () => {
  const evil = await makeUser("evil", {
    meta: { role: "administrator", account_status: "suspended", full_name: "Evil Admin", privacy_notice_accepted: "true" },
  });
  const [p] = await q(`select role, account_status, privacy_notice_accepted_at from public.profiles where id = $1`, [evil]);
  eq(p.role, "applicant");
  eq(p.account_status, "active");
  assert(p.privacy_notice_accepted_at !== null, "privacy acceptance should be recorded");
});

await test("13. invalid phone numbers in metadata are discarded, valid ones are normalised", async () => {
  const bad = await makeUser("badphone", { meta: { phone_number: "12345" } });
  const good = await makeUser("goodphone", { meta: { phone_number: "0917 123-4567" } });
  eq((await q(`select phone_number from public.profiles where id = $1`, [bad]))[0].phone_number, null);
  eq((await q(`select phone_number from public.profiles where id = $1`, [good]))[0].phone_number, "09171234567");
});

await test("13. changing auth email keeps profiles.email in sync", async () => {
  const u = await makeUser("emailsync");
  await db.query(`update auth.users set email = 'new-' || id || '@example.invalid' where id = $1`, [u]);
  const [row] = await q(`select p.email = a.email as same from public.profiles p join auth.users a on a.id = p.id where p.id = $1`, [u]);
  eq(row.same, true);
});

// ---------------------------------------------------------------------------
// B. Constraints and foreign keys  (14)
// ---------------------------------------------------------------------------
await test("14. role and status check constraints reject unknown values", async () => {
  await rejects(() => db.query(`update public.profiles set role = 'superuser' where id = $1`, [applicantB]), /profiles_role_allowed/);
  await rejects(() => db.query(`update public.profiles set account_status = 'banned' where id = $1`, [applicantB]), /profiles_status_allowed/);
});

await test("14. department_members requires real profile and department rows", async () => {
  await rejects(() => member(randomUUID(), MEO), /foreign key/i);
  await rejects(() => member(meoStaff, randomUUID()), /foreign key/i);
});

await test("14. duplicate membership and duplicate department code are rejected", async () => {
  await rejects(() => member(meoStaff, MEO), /unique|duplicate/i);
  await rejects(
    () => db.query(`insert into public.departments (department_name, department_code) values ('Another Name', 'MEO')`),
    /unique|duplicate/i,
  );
});

await test("14. a department that still has members cannot be deleted", async () => {
  await rejects(() => db.query(`delete from public.departments where id = $1`, [MEO]), /foreign key/i);
});

await test("14. deleting an auth user cascades to profile and memberships but keeps audit rows", async () => {
  const u = await makeUser("tobedeleted", { role: "department_personnel" });
  await member(u, BFP);
  await db.query(`insert into public.audit_logs (user_id, action, entity_type, entity_id, description) values ($1,'x.test','profile',$1,'t')`, [u]);
  await db.query(`delete from auth.users where id = $1`, [u]);
  eq(await count(`select 1 from public.profiles where id = $1`, [u]), 0);
  eq(await count(`select 1 from public.department_members where profile_id = $1`, [u]), 0);
  const [log] = await q(`select user_id from public.audit_logs where action = 'x.test' and entity_id = $1`, [u]);
  eq(log.user_id, null);
});

// ---------------------------------------------------------------------------
// C. Unauthenticated and applicant access  (7, 8, 10, 15)
// ---------------------------------------------------------------------------
await test("10/15. anonymous users cannot read any protected table", async () => {
  for (const t of ["profiles", "departments", "department_members", "audit_logs"]) {
    await as(null, () => rejects(() => db.query(`select * from public.${t}`), /permission denied/, `anon read ${t}`));
  }
});

await test("10/15. anonymous users cannot call RPCs or write", async () => {
  await as(null, async () => {
    await rejects(() => db.query(`select public.log_self_event('user.login')`), /permission denied/);
    await rejects(() => db.query(`select public.admin_set_user_role($1, 'administrator')`, [applicantA]), /permission denied/);
    await rejects(() => db.query(`update public.profiles set full_name = 'x'`), /permission denied/);
  });
});

await test("15. an applicant sees only their own profile", async () => {
  const rows = await as(applicantA, () => q(`select id from public.profiles`));
  eq(rows.length, 1);
  eq(rows[0].id, applicantA);
});

await test("15. an applicant can update their own name and phone, and it is audited without values", async () => {
  await as(applicantA, () =>
    db.query(`update public.profiles set full_name = 'Applicant Renamed', phone_number = '09181234567' where id = $1`, [applicantA]),
  );
  eq((await q(`select full_name from public.profiles where id = $1`, [applicantA]))[0].full_name, "Applicant Renamed");
  const [log] = await q(`select description from public.audit_logs where action = 'profile.updated' and entity_id = $1`, [applicantA]);
  assert(log && !/Renamed|0918/.test(log.description), "audit text must not contain personal values");
});

await test("8/15. an applicant cannot change their role, status or email", async () => {
  await as(applicantA, async () => {
    await rejects(() => db.query(`update public.profiles set role = 'administrator' where id = $1`, [applicantA]), /permission denied/, "role");
    await rejects(() => db.query(`update public.profiles set account_status = 'active' where id = $1`, [applicantA]), /permission denied/, "status");
    await rejects(() => db.query(`update public.profiles set email = 'x@example.invalid' where id = $1`, [applicantA]), /permission denied/, "email");
  });
  eq((await q(`select role from public.profiles where id = $1`, [applicantA]))[0].role, "applicant");
});

await test("15. an applicant cannot modify someone else's profile", async () => {
  const res = await as(applicantA, () => db.query(`update public.profiles set full_name = 'Hacked' where id = $1`, [applicantB]));
  eq(res.affectedRows, 0);
  assert((await q(`select full_name from public.profiles where id = $1`, [applicantB]))[0].full_name !== "Hacked");
});

await test("15. an applicant cannot insert or delete profiles", async () => {
  await as(applicantA, async () => {
    await rejects(() => db.query(`insert into public.profiles (id, full_name, email) values ($1,'Fake','fake@example.invalid')`, [randomUUID()]), /permission denied/);
    await rejects(() => db.query(`delete from public.profiles where id = $1`, [applicantB]), /permission denied/);
  });
});

await test("7/15. an applicant cannot read departments, members or audit logs", async () => {
  await as(applicantA, async () => {
    eq(await count(`select 1 from public.departments`), 0, "departments");
    eq(await count(`select 1 from public.department_members`), 0, "members");
    eq(await count(`select 1 from public.audit_logs`), 0, "audit logs");
  });
});

await test("7/8. an applicant cannot call administrator functions", async () => {
  await as(applicantA, async () => {
    await rejects(() => db.query(`select public.admin_set_user_role($1, 'administrator')`, [applicantA]), /Only administrators/);
    await rejects(() => db.query(`select public.admin_set_account_status($1, 'active')`, [applicantB]), /Only administrators/);
    await rejects(() => db.query(`select public.admin_assign_department($1, $2, null)`, [meoStaff, BFP]), /Only administrators/);
  });
  eq((await q(`select role from public.profiles where id = $1`, [applicantA]))[0].role, "applicant");
});

await test("15. internal audit writer is not callable; self-event function is whitelisted", async () => {
  await as(applicantA, async () => {
    await rejects(() => db.query(`select public.write_audit_log($1,'fake','profile',$1,'forged')`, [applicantB]), /permission denied/);
    await rejects(() => db.query(`insert into public.audit_logs (action, entity_type) values ('forged','profile')`), /permission denied/);
    await rejects(() => db.query(`select public.log_self_event('admin.did_something')`), /Unsupported event/);
    await db.query(`select public.log_self_event('user.login')`);
  });
  eq(await auditCount("user.login", applicantA), 1);
});

// ---------------------------------------------------------------------------
// D. Staff access  (9, 15)
// ---------------------------------------------------------------------------
await test("9/15. department personnel see only their own department and membership", async () => {
  await as(meoStaff, async () => {
    const d = await q(`select department_code from public.departments`);
    eq(d.length, 1);
    eq(d[0].department_code, "MEO");
    const m = await q(`select profile_id from public.department_members`);
    eq(m.length, 1);
    eq(m[0].profile_id, meoStaff);
  });
});

await test("9/15. department personnel cannot read other departments' staff or other profiles", async () => {
  await as(meoStaff, async () => {
    eq(await count(`select 1 from public.profiles where id = $1`, [bfpStaff]), 0);
    eq(await count(`select 1 from public.profiles where id = $1`, [meoHead]), 0, "peers are not visible either");
    eq(await count(`select 1 from public.departments where department_code = 'BFP'`), 0);
    eq(await count(`select 1 from public.audit_logs`), 0);
  });
});

await test("9. department personnel cannot change their own department assignment", async () => {
  await as(meoStaff, async () => {
    await rejects(() => db.query(`insert into public.department_members (profile_id, department_id) values ($1,$2)`, [meoStaff, BFP]), /permission denied/);
    await rejects(() => db.query(`update public.department_members set department_id = $1 where profile_id = $2`, [BFP, meoStaff]), /permission denied/);
    await rejects(() => db.query(`delete from public.department_members where profile_id = $1`, [meoStaff]), /permission denied/);
    await rejects(() => db.query(`select public.admin_assign_department($1,$2,null)`, [meoStaff, BFP]), /Only administrators/);
  });
  eq(await count(`select 1 from public.department_members where profile_id = $1 and department_id = $2`, [meoStaff, MEO]), 1);
});

await test("15. department heads see profiles of their own department only", async () => {
  await as(meoHead, async () => {
    const ids = (await q(`select id from public.profiles`)).map((r) => r.id).sort();
    assert(ids.includes(meoHead) && ids.includes(meoStaff), "should see self and own department staff");
    assert(!ids.includes(bfpStaff), "must not see another department's staff");
    assert(!ids.includes(applicantA), "must not see applicants");
    eq(await count(`select 1 from public.department_members where department_id = $1`, [BFP]), 0);
  });
});

await test("8/15. a department head cannot change their own role", async () => {
  await as(meoHead, async () => {
    await rejects(() => db.query(`update public.profiles set role = 'administrator' where id = $1`, [meoHead]), /permission denied/);
    await rejects(() => db.query(`select public.admin_set_user_role($1,'administrator')`, [meoHead]), /Only administrators/);
  });
});

await test("15. BPLO personnel can read all departments but not other users' profiles", async () => {
  await as(bplo, async () => {
    eq(await count(`select 1 from public.departments`), 6);
    eq(await count(`select 1 from public.profiles`), 1);
    await rejects(() => db.query(`update public.profiles set role = 'administrator' where id = $1`, [bplo]), /permission denied/);
  });
});

await test("15. suspended and inactive accounts lose staff access immediately", async () => {
  const s = await makeUser("suspendedStaff", { role: "department_personnel", status: "suspended" });
  await member(s, MEO);
  const a = await makeUser("suspendedAdmin", { role: "administrator", status: "suspended" });
  await as(s, async () => {
    eq(await count(`select 1 from public.departments`), 0, "departments");
    const upd = await db.query(`update public.profiles set full_name = 'Still Here' where id = $1`, [s]);
    eq(upd.affectedRows, 0, "suspended users cannot edit their profile");
  });
  await as(a, async () => {
    eq(await count(`select 1 from public.profiles`), 1, "suspended admin sees only self");
    eq(await count(`select 1 from public.audit_logs`), 0);
    await rejects(() => db.query(`select public.admin_set_user_role($1,'applicant')`, [applicantB]), /Only administrators/);
  });
});

// ---------------------------------------------------------------------------
// E. Administrator operations  (12, 16)
// ---------------------------------------------------------------------------
await test("15. administrators can read every profile and the audit log", async () => {
  await as(admin1, async () => {
    assert((await count(`select 1 from public.profiles`)) >= 10);
    assert((await count(`select 1 from public.audit_logs`)) >= 1);
  });
});

await test("12/16. an administrator changes a role and the change is audited with the actor", async () => {
  await as(admin1, () => db.query(`select public.admin_set_user_role($1, 'bplo_personnel')`, [applicantB]));
  eq((await q(`select role from public.profiles where id = $1`, [applicantB]))[0].role, "bplo_personnel");
  const [log] = await q(`select user_id, description from public.audit_logs where action = 'user.role_changed' and entity_id = $1`, [applicantB]);
  eq(log.user_id, admin1);
  assert(/applicant to bplo_personnel/.test(log.description));
});

await test("12. invalid roles are rejected and nothing is logged for them", async () => {
  const before = await count(`select 1 from public.audit_logs where action = 'user.role_changed'`);
  await as(admin1, () => rejects(() => db.query(`select public.admin_set_user_role($1, 'root')`, [applicantA]), /Invalid role/));
  eq(await count(`select 1 from public.audit_logs where action = 'user.role_changed'`), before);
});

await test("12. administrators cannot change their own role or status (no accidental lock-out)", async () => {
  await as(admin1, async () => {
    await rejects(() => db.query(`select public.admin_set_user_role($1,'applicant')`, [admin1]), /cannot change your own role/);
    await rejects(() => db.query(`select public.admin_set_account_status($1,'suspended')`, [admin1]), /cannot change your own account status/);
  });
  eq((await q(`select role, account_status from public.profiles where id = $1`, [admin1]))[0].role, "administrator");
});

await test("12/16. account status changes are audited", async () => {
  await as(admin1, () => db.query(`select public.admin_set_account_status($1, 'suspended')`, [applicantA]));
  eq((await q(`select account_status from public.profiles where id = $1`, [applicantA]))[0].account_status, "suspended");
  eq(await auditCount("user.status_changed", applicantA), 1);
  // A suspended applicant can no longer edit their profile.
  const r = await as(applicantA, () => db.query(`update public.profiles set full_name = 'x y' where id = $1`, [applicantA]));
  eq(r.affectedRows, 0);
  await as(admin1, () => db.query(`select public.admin_set_account_status($1, 'active')`, [applicantA]));
});

await test("12. the last active administrator is protected (a demoted admin loses RPC access)", async () => {
  await as(admin1, () => db.query(`select public.admin_set_user_role($1,'applicant')`, [admin2]));
  eq((await q(`select role from public.profiles where id = $1`, [admin2]))[0].role, "applicant");
  // admin2 can no longer demote admin1; admin1 is now the only administrator.
  await as(admin2, () => rejects(() => db.query(`select public.admin_set_user_role($1,'applicant')`, [admin1]), /Only administrators/));
  eq((await q(`select role from public.profiles where id = $1`, [admin1]))[0].role, "administrator");
  assert((await count(`select 1 from public.profiles where role = 'administrator' and account_status = 'active'`)) >= 1);
});

await test("16. department assignment works for staff, is audited, and respects rules", async () => {
  const staff = await makeUser("assignme", { role: "department_personnel" });
  await as(admin1, async () => {
    await db.query(`select public.admin_assign_department($1,$2,'Inspector')`, [staff, BFP]);
    await rejects(() => db.query(`select public.admin_assign_department($1,$2,null)`, [staff, MHO]), /not active/, "inactive department");
    await rejects(() => db.query(`select public.admin_assign_department($1,$2,null)`, [applicantA, BFP]), /Only BPLO|department personnel/, "applicant target");
    await rejects(() => db.query(`select public.admin_assign_department($1,$2,null)`, [staff, randomUUID()]), /Department not found/);
  });
  eq(await count(`select 1 from public.department_members where profile_id = $1 and department_id = $2`, [staff, BFP]), 1);
  eq(await auditCount("department_member.assigned", staff), 1);
  const [m] = await q(`select id from public.department_members where profile_id = $1`, [staff]);
  await as(admin1, () => db.query(`select public.admin_remove_department_assignment($1)`, [m.id]));
  eq(await count(`select 1 from public.department_members where profile_id = $1`, [staff]), 0);
  eq(await auditCount("department_member.removed", staff), 1);
});

await test("16. moving a user to applicant removes their department assignments", async () => {
  const staff = await makeUser("demoted", { role: "department_personnel" });
  await member(staff, BFP);
  await as(admin1, () => db.query(`select public.admin_set_user_role($1,'applicant')`, [staff]));
  eq(await count(`select 1 from public.department_members where profile_id = $1`, [staff]), 0);
});

await test("15/16. only administrators can create or change departments; changes are audited", async () => {
  await as(bplo, () =>
    rejects(() => db.query(`insert into public.departments (department_name, department_code) values ('Test Office','TST')`), /row-level security/),
  );
  const upd = await as(meoHead, () => db.query(`update public.departments set is_active = false where id = $1`, [MEO]));
  eq(upd.affectedRows, 0, "head cannot deactivate");
  await as(admin1, async () => {
    await db.query(`insert into public.departments (department_name, department_code, is_active) values ('Test Office','TST', true)`);
    await db.query(`update public.departments set is_active = false where department_code = 'TST'`);
  });
  const tst = await dept("TST");
  eq(await auditCount("department.created", tst), 1);
  eq(await auditCount("department.deactivated", tst), 1);
});

await test("15/16. nobody can edit or delete audit logs, including administrators", async () => {
  await as(admin1, async () => {
    await rejects(() => db.query(`update public.audit_logs set description = 'tampered'`), /permission denied/);
    await rejects(() => db.query(`delete from public.audit_logs`), /permission denied/);
    await rejects(() => db.query(`insert into public.audit_logs (action, entity_type) values ('forged','profile')`), /permission denied/);
  });
});

// ---------------------------------------------------------------------------
// F. Storage bucket policies (future uploads)
// ---------------------------------------------------------------------------
await test("storage: bucket is private; applicants read only their own folder; free-form uploads are refused (Phase 4)", async () => {
  const [b] = await q(`select public from storage.buckets where id = 'permit-documents'`);
  eq(b.public, false);
  const owner = await makeUser("uploader");
  const other = await makeUser("uploader2");
  await db.query(`insert into storage.objects (bucket_id, name) values ('permit-documents', $1)`, [`${owner}/existing.pdf`]);
  await as(owner, async () => {
    // Phase 4 replaced the Phase 2 "any file in your folder" rule: uploads must target an allowed application requirement.
    await rejects(
      () => db.query(`insert into storage.objects (bucket_id, name) values ('permit-documents', '${owner}/dti.pdf')`),
      /row-level security/,
      "arbitrary path in own folder",
    );
    await rejects(
      () => db.query(`insert into storage.objects (bucket_id, name) values ('permit-documents', '${other}/dti.pdf')`),
      /row-level security/,
      "other user's folder",
    );
    eq(await count(`select 1 from storage.objects`), 1, "reads own folder");
  });
  await as(other, async () => eq(await count(`select 1 from storage.objects`), 0, "cannot read another applicant's files"));
  await as(bplo, () =>
    rejects(() => db.query(`insert into storage.objects (bucket_id, name) values ('permit-documents', '${bplo}/x.pdf')`), /row-level security/),
  );
});

// ---------------------------------------------------------------------------
// G. Phase 3: business profiles and permit applications
// ---------------------------------------------------------------------------
const owner1 = await makeUser("owner1");
const owner2 = await makeUser("owner2");
const bplo3 = await makeUser("bplo3", { role: "bplo_personnel" });
const admin3 = await makeUser("admin3", { role: "administrator" });
const deptStaff3 = await makeUser("dept3", { role: "department_personnel" });

const permitType = async (code) => (await q(`select id from public.permit_types where application_code = $1`, [code]))[0].id;
const NEW_TYPE = await permitType("NEW");
const RENEWAL_TYPE = await permitType("RENEWAL");

const businessFields = (overrides = {}) => ({
  registered_business_name: "Sample Sari-Sari Store",
  business_type: "Retail",
  ownership_type: "sole_proprietorship",
  business_category: "Retail trade",
  business_contact_number: "09171234567",
  barangay: "Poblacion A",
  zip_code: "4225",
  owner_full_name: "Juan Dela Cruz",
  owner_contact_number: "09171234567",
  nature_of_business: "Retail of household goods",
  employee_count: 2,
  establishment_status: "operating",
  ...overrides,
});

/** Insert a business as the given applicant through the API role. Returns the row. */
async function createBusiness(userId, overrides = {}) {
  const f = businessFields(overrides);
  const cols = Object.keys(f);
  const rows = await as(userId, () =>
    q(
      `insert into public.business_establishments (${cols.join(", ")}) values (${cols.map((_, i) => `$${i + 1}`).join(", ")})
       returning id, owner_id, business_reference_number, record_status, municipality, province`,
      Object.values(f),
    ),
  );
  return rows[0];
}

async function createDraft(userId, businessId, typeId = NEW_TYPE, extra = {}) {
  const f = {
    business_id: businessId,
    permit_type_id: typeId,
    business_name: "Sample Sari-Sari Store",
    business_address: "Poblacion A, Rosario, Batangas 4225",
    nature_of_business: "Retail of household goods",
    business_category: "Retail trade",
    ...extra,
  };
  const cols = Object.keys(f);
  const rows = await as(userId, () =>
    q(
      `insert into public.permit_applications (${cols.join(", ")}) values (${cols.map((_, i) => `$${i + 1}`).join(", ")})
       returning id, applicant_id, application_status, reference_number`,
      Object.values(f),
    ),
  );
  return rows[0];
}

const submit = (userId, appId) => as(userId, async () => (await q(`select public.submit_permit_application($1) as ref`, [appId]))[0].ref);

let biz1; // owner1's business
let biz2; // owner2's business

await test("P3-1. applicant can create a business profile; owner and reference are set by the server", async () => {
  biz1 = await createBusiness(owner1);
  eq(biz1.owner_id, owner1, "owner_id defaults to the caller");
  assert(/^BUS-\d{4}-\d{6}$/.test(biz1.business_reference_number), `reference format: ${biz1.business_reference_number}`);
  eq(biz1.record_status, "pending_verification", "default record status");
  eq(biz1.municipality, "Rosario");
  eq(biz1.province, "Batangas");
  eq(await auditCount("business.created", biz1.id), 1);
  biz2 = await createBusiness(owner2, { registered_business_name: "Other Owner Bakery" });
});

await test("P3-1. an applicant can register several businesses", async () => {
  const extra = await createBusiness(owner1, { registered_business_name: "Second Shop" });
  assert(extra.business_reference_number !== biz1.business_reference_number, "unique business references");
  eq(await as(owner1, () => count(`select 1 from public.business_establishments`)), 2);
});

await test("P3-12. applicants cannot set owner, reference number or record status when creating", async () => {
  await as(owner1, async () => {
    await rejects(
      () => db.query(`insert into public.business_establishments (owner_id, registered_business_name, business_type, ownership_type, business_category, business_contact_number, barangay, zip_code, owner_full_name, owner_contact_number, nature_of_business, establishment_status) values ($1,'Spoof','Retail','other','Retail','09171234567','Poblacion','4225','X Y','09171234567','Retail','operating')`, [owner2]),
      /permission denied/,
      "owner_id",
    );
    await rejects(
      () => db.query(`insert into public.business_establishments (business_reference_number, registered_business_name, business_type, ownership_type, business_category, business_contact_number, barangay, zip_code, owner_full_name, owner_contact_number, nature_of_business, establishment_status) values ('BUS-2026-999999','Spoof','Retail','other','Retail','09171234567','Poblacion','4225','X Y','09171234567','Retail','operating')`),
      /permission denied/,
      "reference",
    );
    await rejects(
      () => db.query(`insert into public.business_establishments (record_status, registered_business_name, business_type, ownership_type, business_category, business_contact_number, barangay, zip_code, owner_full_name, owner_contact_number, nature_of_business, establishment_status) values ('active','Spoof','Retail','other','Retail','09171234567','Poblacion','4225','X Y','09171234567','Retail','operating')`),
      /permission denied/,
      "record_status",
    );
  });
});

await test("P3-14. invalid business data is rejected by database constraints", async () => {
  await rejects(() => createBusiness(owner1, { zip_code: "42A5" }), /business_zip_format/);
  await rejects(() => createBusiness(owner1, { business_contact_number: "12345" }), /business_contact_format/);
  await rejects(() => createBusiness(owner1, { employee_count: -1 }), /business_employee_count_range/);
  await rejects(() => createBusiness(owner1, { ownership_type: "empire" }), /business_ownership_type_allowed/);
  await rejects(() => createBusiness(owner1, { business_email: "not-an-email" }), /business_email_format/);
});

await test("P3-2. applicant can edit their own business profile", async () => {
  const res = await as(owner1, () =>
    db.query(`update public.business_establishments set trade_name = 'Juan''s Store', employee_count = 3 where id = $1`, [biz1.id]),
  );
  eq(res.affectedRows, 1);
  eq((await q(`select trade_name from public.business_establishments where id = $1`, [biz1.id]))[0].trade_name, "Juan's Store");
  eq(await auditCount("business.updated", biz1.id), 1);
});

await test("P3-3. applicant cannot view or edit another applicant's business", async () => {
  await as(owner1, async () => {
    eq(await count(`select 1 from public.business_establishments where id = $1`, [biz2.id]), 0, "not visible");
    const res = await db.query(`update public.business_establishments set trade_name = 'Hacked' where id = $1`, [biz2.id]);
    eq(res.affectedRows, 0, "update affects nothing");
  });
  assert((await q(`select trade_name from public.business_establishments where id = $1`, [biz2.id]))[0].trade_name !== "Hacked");
});

await test("P3-12. applicants cannot transfer ownership or change reference/record status of their business", async () => {
  await as(owner1, async () => {
    await rejects(() => db.query(`update public.business_establishments set owner_id = $1 where id = $2`, [owner2, biz1.id]), /permission denied/, "owner");
    await rejects(() => db.query(`update public.business_establishments set business_reference_number = 'BUS-2026-000999' where id = $1`, [biz1.id]), /permission denied/, "reference");
    await rejects(() => db.query(`update public.business_establishments set record_status = 'active' where id = $1`, [biz1.id]), /permission denied/, "status");
    await rejects(() => db.query(`delete from public.business_establishments where id = $1`, [biz1.id]), /permission denied/, "delete");
  });
  eq((await q(`select owner_id from public.business_establishments where id = $1`, [biz1.id]))[0].owner_id, owner1);
});

await test("P3-15. staff roles cannot create business profiles; department staff cannot read them", async () => {
  await rejects(() => createBusiness(bplo3), /row-level security/, "bplo insert");
  await rejects(() => createBusiness(admin3), /row-level security/, "admin insert");
  await as(deptStaff3, async () => eq(await count(`select 1 from public.business_establishments`), 0));
});

await test("P3-4. applicant can browse active permit types (all three are seeded)", async () => {
  const rows = await as(owner1, () => q(`select application_code from public.permit_types order by sort_order`));
  eq(rows.map((r) => r.application_code).join(","), "NEW,RENEWAL,AMENDMENT");
  await as(null, () => rejects(() => db.query(`select * from public.permit_types`), /permission denied/));
});

let draft1;
await test("P3-4. applicant can create a draft application for a business they own", async () => {
  draft1 = await createDraft(owner1, biz1.id);
  eq(draft1.applicant_id, owner1);
  eq(draft1.application_status, "draft");
  eq(draft1.reference_number, null, "drafts have no reference");
  const hist = await as(owner1, () => q(`select previous_status, new_status from public.application_status_history where application_id = $1`, [draft1.id]));
  eq(hist.length, 1, "history row for draft creation");
  eq(hist[0].new_status, "draft");
  eq(await auditCount("application.created", draft1.id), 1);
});

await test("P3-4/12. applicant cannot create an application for someone else's business", async () => {
  await rejects(() => createDraft(owner1, biz2.id), /row-level security/);
});

await test("P3-11. applicant cannot create an application with a status, reference or other applicant", async () => {
  await as(owner1, async () => {
    await rejects(
      () => db.query(`insert into public.permit_applications (business_id, permit_type_id, application_status) values ($1,$2,'submitted')`, [biz1.id, NEW_TYPE]),
      /permission denied/,
      "status",
    );
    await rejects(
      () => db.query(`insert into public.permit_applications (business_id, permit_type_id, reference_number) values ($1,$2,'PTY-2026-123456')`, [biz1.id, NEW_TYPE]),
      /permission denied/,
      "reference",
    );
    await rejects(
      () => db.query(`insert into public.permit_applications (business_id, permit_type_id, applicant_id) values ($1,$2,$3)`, [biz1.id, NEW_TYPE, owner2]),
      /permission denied/,
      "applicant_id",
    );
  });
});

await test("P3-5. applicant can edit their own draft", async () => {
  const res = await as(owner1, () =>
    db.query(`update public.permit_applications set applicant_remarks = 'First-time applicant', permit_type_id = $2 where id = $1`, [draft1.id, RENEWAL_TYPE]),
  );
  eq(res.affectedRows, 1);
  await as(owner1, () => db.query(`update public.permit_applications set permit_type_id = $2 where id = $1`, [draft1.id, NEW_TYPE]));
});

await test("P3-5/12. a draft cannot be moved to another applicant's business", async () => {
  await as(owner1, () =>
    rejects(() => db.query(`update public.permit_applications set business_id = $2 where id = $1`, [draft1.id, biz2.id]), /row-level security/),
  );
});

await test("P3-6. applicant cannot change status directly; must use the submit function", async () => {
  await as(owner1, () =>
    rejects(() => db.query(`update public.permit_applications set application_status = 'submitted' where id = $1`, [draft1.id]), /permission denied/),
  );
});

await test("P3-6. submitting an incomplete draft is refused", async () => {
  const incomplete = await createDraft(owner1, biz1.id, NEW_TYPE, { nature_of_business: null });
  await rejects(() => submit(owner1, incomplete.id), /Complete the business name/);
  eq((await q(`select application_status from public.permit_applications where id = $1`, [incomplete.id]))[0].application_status, "draft");
});

let ref1;
await test("P3-6/7. applicant can submit; a server-generated PTY-YYYY-NNNNNN reference is assigned", async () => {
  ref1 = await submit(owner1, draft1.id);
  const year = new Date().toLocaleString("en-US", { timeZone: "Asia/Manila", year: "numeric" });
  assert(new RegExp(`^PTY-${year}-\\d{6}$`).test(ref1), `reference ${ref1}`);
  const [row] = await q(`select application_status, reference_number, submitted_at, submission_snapshot from public.permit_applications where id = $1`, [draft1.id]);
  eq(row.application_status, "submitted");
  eq(row.reference_number, ref1);
  assert(row.submitted_at !== null, "submitted_at set");
  eq(row.submission_snapshot.business.registered_business_name, "Sample Sari-Sari Store", "snapshot of business");
  assert(!("owner_id" in row.submission_snapshot.business), "snapshot omits internal owner id");
  eq(await auditCount("application.submitted", draft1.id), 1);
  const hist = await q(`select previous_status, new_status, changed_by from public.application_status_history where application_id = $1 order by created_at`, [draft1.id]);
  eq(hist.length, 2);
  eq(hist[1].previous_status, "draft");
  eq(hist[1].new_status, "submitted");
  eq(hist[1].changed_by, owner1);
});

await test("P3-7. every submission gets a unique, sequential reference number", async () => {
  const refs = [ref1];
  for (let i = 0; i < 5; i += 1) {
    const d = await createDraft(owner1, biz1.id);
    refs.push(await submit(owner1, d.id));
  }
  const b = await createDraft(owner2, biz2.id);
  refs.push(await submit(owner2, b.id));
  eq(new Set(refs).size, refs.length, "no duplicates");
  const nums = refs.map((r) => Number(r.split("-")[2]));
  for (let i = 1; i < nums.length; i += 1) eq(nums[i], nums[i - 1] + 1, "sequential");
});

await test("P3-7. a duplicate reference number is rejected by the unique constraint", async () => {
  const d = await createDraft(owner2, biz2.id);
  await rejects(
    () => db.query(`update public.permit_applications set application_status = 'submitted', reference_number = $2, submitted_at = now() where id = $1`, [d.id, ref1]),
    /unique|duplicate/i,
  );
});

await test("P3-8. applicant cannot modify or delete a submitted application", async () => {
  await as(owner1, async () => {
    const upd = await db.query(`update public.permit_applications set applicant_remarks = 'changed' where id = $1`, [draft1.id]);
    eq(upd.affectedRows, 0, "update affects nothing (RLS only exposes drafts for update)");
    await rejects(() => db.query(`update public.permit_applications set application_status = 'draft' where id = $1`, [draft1.id]), /permission denied/, "status column");
    const del = await db.query(`delete from public.permit_applications where id = $1`, [draft1.id]);
    eq(del.affectedRows, 0, "delete affects nothing");
    await rejects(() => submit(owner1, draft1.id), /Only draft applications/, "re-submit");
  });
  eq((await q(`select applicant_remarks from public.permit_applications where id = $1`, [draft1.id]))[0].applicant_remarks, "First-time applicant");
});

await test("P3-11. applicants cannot call the internal reference generator or touch counters", async () => {
  await as(owner1, async () => {
    await rejects(() => db.query(`select public.next_reference_number('PTY', 2026)`), /permission denied/);
    await rejects(() => db.query(`select * from public.reference_counters`), /permission denied/);
    await rejects(() => db.query(`update public.reference_counters set last_value = 0`), /permission denied/);
  });
});

await test("P3-9. applicant can read their own application history", async () => {
  await as(owner1, async () => {
    const rows = await q(`select new_status from public.application_status_history where application_id = $1 order by created_at`, [draft1.id]);
    eq(rows.map((r) => r.new_status).join(","), "draft,submitted");
    await rejects(() => db.query(`insert into public.application_status_history (application_id, new_status) values ($1, 'submitted')`, [draft1.id]), /permission denied/);
    await rejects(() => db.query(`update public.application_status_history set remarks = 'x'`), /permission denied/);
  });
});

await test("P3-10. applicant cannot see another applicant's applications or their history", async () => {
  await as(owner2, async () => {
    eq(await count(`select 1 from public.permit_applications where id = $1`, [draft1.id]), 0);
    eq(await count(`select 1 from public.application_status_history where application_id = $1`, [draft1.id]), 0);
    await rejects(() => db.query(`select public.cancel_permit_application($1, null)`, [draft1.id]), /Application not found/);
    await rejects(() => submit(owner2, draft1.id), /Application not found/);
  });
});

await test("P3-15. BPLO and administrators see submitted applications but not drafts; department staff see none", async () => {
  const privateDraft = await createDraft(owner1, biz1.id);
  await as(bplo3, async () => {
    eq(await count(`select 1 from public.permit_applications where id = $1`, [draft1.id]), 1, "submitted visible");
    eq(await count(`select 1 from public.permit_applications where id = $1`, [privateDraft.id]), 0, "draft hidden");
    eq(await count(`select 1 from public.business_establishments where id = $1`, [biz1.id]), 1, "business visible");
    const r = await db.query(`update public.permit_applications set applicant_remarks = 'x' where id = $1`, [draft1.id]);
    eq(r.affectedRows, 0, "staff cannot edit directly");
  });
  await as(admin3, async () => eq(await count(`select 1 from public.permit_applications where id = $1`, [draft1.id]), 1));
  await as(deptStaff3, async () => eq(await count(`select 1 from public.permit_applications`), 0));
});

await test("P3-12. applicant can cancel a submitted application; the record is preserved", async () => {
  await as(owner1, () => db.query(`select public.cancel_permit_application($1, 'Business plans changed')`, [draft1.id]));
  const [row] = await q(`select application_status, reference_number, cancelled_at, cancellation_reason, cancelled_by from public.permit_applications where id = $1`, [draft1.id]);
  eq(row.application_status, "cancelled");
  eq(row.reference_number, ref1, "reference kept");
  assert(row.cancelled_at !== null, "cancelled_at recorded");
  eq(row.cancellation_reason, "Business plans changed");
  eq(row.cancelled_by, owner1);
  const hist = await q(`select previous_status, new_status, remarks from public.application_status_history where application_id = $1 order by created_at`, [draft1.id]);
  eq(hist.at(-1).new_status, "cancelled");
  eq(hist.at(-1).remarks, "Business plans changed");
  eq(await auditCount("application.cancelled", draft1.id), 1);
  await as(owner1, () => rejects(() => db.query(`select public.cancel_permit_application($1, null)`, [draft1.id]), /can no longer be cancelled/));
});

await test("P3-12. cancelled and submitted applications cannot be deleted by anyone", async () => {
  await rejects(() => db.query(`delete from public.permit_applications where id = $1`, [draft1.id]), /Only draft applications can be deleted/);
  eq(await count(`select 1 from public.permit_applications where id = $1`, [draft1.id]), 1);
});

await test("P3-12. staff can cancel a submitted application only with a reason; drafts are off limits", async () => {
  const d = await createDraft(owner2, biz2.id);
  await as(bplo3, () => rejects(() => db.query(`select public.cancel_permit_application($1, null)`, [d.id]), /Application not found/, "draft hidden from staff"));
  await submit(owner2, d.id);
  await as(bplo3, () => rejects(() => db.query(`select public.cancel_permit_application($1, '  ')`, [d.id]), /Give a reason/));
  await as(bplo3, () => db.query(`select public.cancel_permit_application($1, 'Duplicate submission')`, [d.id]));
  eq((await q(`select cancelled_by from public.permit_applications where id = $1`, [d.id]))[0].cancelled_by, bplo3);
  await as(deptStaff3, () => rejects(() => db.query(`select public.cancel_permit_application($1, 'x')`, [d.id]), /Application not found/));
});

await test("P3-4. applicant can delete their own draft (and its history), and it is audited", async () => {
  const d = await createDraft(owner1, biz1.id);
  const res = await as(owner1, () => db.query(`delete from public.permit_applications where id = $1`, [d.id]));
  eq(res.affectedRows, 1);
  eq(await count(`select 1 from public.application_status_history where application_id = $1`, [d.id]), 0);
  eq(await auditCount("application.draft_deleted", d.id), 1);
  const other = await createDraft(owner2, biz2.id);
  const res2 = await as(owner1, () => db.query(`delete from public.permit_applications where id = $1`, [other.id]));
  eq(res2.affectedRows, 0, "cannot delete another applicant's draft");
});

await test("P3-3. record status is managed only by BPLO/administrators and is audited", async () => {
  await as(owner1, () => rejects(() => db.query(`select public.set_business_record_status($1,'active')`, [biz1.id]), /Only BPLO/));
  await as(bplo3, () => db.query(`select public.set_business_record_status($1,'active')`, [biz1.id]));
  eq((await q(`select record_status from public.business_establishments where id = $1`, [biz1.id]))[0].record_status, "active");
  eq(await auditCount("business.status_changed", biz1.id), 1);
  await as(admin3, () => rejects(() => db.query(`select public.set_business_record_status($1,'deleted')`, [biz1.id]), /Invalid record status/));
});

await test("P3-3. an inactive business cannot be edited or used for new applications", async () => {
  await as(admin3, () => db.query(`select public.set_business_record_status($1,'inactive')`, [biz2.id]));
  const res = await as(owner2, () => db.query(`update public.business_establishments set trade_name = 'x' where id = $1`, [biz2.id]));
  eq(res.affectedRows, 0, "edit blocked");
  await rejects(() => createDraft(owner2, biz2.id), /row-level security/, "new draft blocked");
  await as(admin3, () => db.query(`select public.set_business_record_status($1,'active')`, [biz2.id]));
});

await test("P3-4. inactive permit types cannot be used; only administrators manage types", async () => {
  await as(owner1, () => rejects(() => db.query(`insert into public.permit_types (name, application_code) values ('Fake','FAKE')`), /row-level security/));
  const upd = await as(bplo3, () => db.query(`update public.permit_types set is_active = false where id = $1`, [RENEWAL_TYPE]));
  eq(upd.affectedRows, 0, "bplo cannot change types");
  await as(admin3, () => db.query(`update public.permit_types set is_active = false where id = $1`, [RENEWAL_TYPE]));
  await rejects(() => createDraft(owner1, biz1.id, RENEWAL_TYPE), /row-level security/);
  eq(await as(owner1, () => count(`select 1 from public.permit_types`)), 2, "inactive type hidden from applicants");
  eq(await as(bplo3, () => count(`select 1 from public.permit_types`)), 3, "staff see all types");
  eq(await auditCount("permit_type.deactivated", RENEWAL_TYPE), 1);
  await as(admin3, () => db.query(`update public.permit_types set is_active = true where id = $1`, [RENEWAL_TYPE]));
});

await test("P3-13. dashboard counts come straight from the applicant's own rows", async () => {
  const fresh = await makeUser("freshApplicant");
  await as(fresh, async () => {
    eq(await count(`select 1 from public.business_establishments`), 0, "empty state: no businesses");
    eq(await count(`select 1 from public.permit_applications`), 0, "empty state: no applications");
  });
  const b = await createBusiness(fresh);
  await createDraft(fresh, b.id);
  const s = await createDraft(fresh, b.id);
  await submit(fresh, s.id);
  const [c] = await as(fresh, () =>
    q(`select count(*)::int as total,
              count(*) filter (where application_status = 'draft')::int as drafts,
              count(*) filter (where application_status = 'submitted')::int as submitted
         from public.permit_applications`),
  );
  eq(c.total, 2);
  eq(c.drafts, 1);
  eq(c.submitted, 1);
});

await test("P3-14. an applicant with business records cannot be silently deleted", async () => {
  await rejects(() => db.query(`delete from auth.users where id = $1`, [owner1]), /foreign key|violates/i);
});

await test("P3-12. guard triggers still block protected columns if a future grant is too broad", async () => {
  const b = await createBusiness(owner2, { registered_business_name: "Guard Test" });
  const d = await createDraft(owner2, b.id);
  await db.exec(`grant update on public.permit_applications to authenticated; grant update on public.business_establishments to authenticated;`);
  try {
    await as(owner2, async () => {
      await rejects(() => db.query(`update public.permit_applications set application_status = 'submitted', reference_number = 'PTY-2026-777777', submitted_at = now() where id = $1`, [d.id]), /cannot be changed directly/);
      await rejects(() => db.query(`update public.business_establishments set owner_id = $2 where id = $1`, [b.id, owner1]), /cannot be changed directly/);
      await rejects(() => db.query(`update public.business_establishments set record_status = 'active' where id = $1`, [b.id]), /cannot be changed directly/);
    });
  } finally {
    await db.exec(`revoke update on public.permit_applications from authenticated; revoke update on public.business_establishments from authenticated;
      grant update (business_id, permit_type_id, business_name, business_address, nature_of_business, business_category, applicant_remarks) on public.permit_applications to authenticated;
      grant update (registered_business_name, trade_name, business_description, business_type, ownership_type, business_category, business_email, business_contact_number, province, municipality, barangay, street_address, zip_code, owner_full_name, owner_email, owner_contact_number, nature_of_business, employee_count, estimated_capital, establishment_status, date_established) on public.business_establishments to authenticated;`);
  }
});

await test("P3-15. suspended applicants cannot create businesses or applications", async () => {
  const s = await makeUser("suspendedOwner");
  const b = await createBusiness(s);
  await db.query(`update public.profiles set account_status = 'suspended' where id = $1`, [s]);
  await rejects(() => createBusiness(s), /row-level security/);
  await rejects(() => createDraft(s, b.id), /row-level security/);
});

// ---------------------------------------------------------------------------
// H. Phase 4: requirements and document management
// ---------------------------------------------------------------------------
const bplo4 = await makeUser("bplo4", { role: "bplo_personnel" });
const admin4 = await makeUser("admin4", { role: "administrator" });
const dept4 = await makeUser("dept4", { role: "department_personnel" });
const appl4a = await makeUser("appl4a");
const appl4b = await makeUser("appl4b");
const MB = 1024 * 1024;

async function createRequirement(userId, typeId, overrides = {}) {
  const f = { permit_type_id: typeId, name: `Req ${randomUUID().slice(0, 8)}`, is_required: true, ...overrides };
  const cols = Object.keys(f);
  const rows = await as(userId, () =>
    q(
      `insert into public.permit_requirements (${cols.join(", ")}) values (${cols.map((c, i) => (c === "accepted_file_types" ? `$${i + 1}::text[]` : `$${i + 1}`)).join(", ")})
       returning id, created_by, max_file_size, accepted_file_types, is_active`,
      Object.values(f),
    ),
  );
  return rows[0];
}

const objPath = (applicant, app, req, ext = "pdf") => `${applicant}/${app}/${req}/${randomUUID()}.${ext}`;

/** Simulates Supabase Storage: the object is inserted as the user (RLS applies) with the metadata Storage records. */
async function putObject(userId, path, { size = 1000, mime = "application/pdf" } = {}) {
  await as(userId, () =>
    db.query(`insert into storage.objects (bucket_id, name, owner, metadata) values ('permit-documents', $1, $2, $3::jsonb)`, [
      path,
      userId,
      JSON.stringify({ size, mimetype: mime }),
    ]),
  );
}

const register = (userId, app, req, path, name = "scan.pdf") =>
  as(userId, async () => (await q(`select public.register_application_document($1,$2,$3,$4) as id`, [app, req, path, name]))[0].id);

async function uploadDoc(userId, app, req, opts = {}) {
  const ext = opts.ext ?? "pdf";
  const path = objPath(userId, app, req, ext);
  await putObject(userId, path, opts);
  return { id: await register(userId, app, req, path, opts.name), path };
}

const review = (userId, docId, status, comment = null) =>
  as(userId, () => db.query(`select public.review_application_document($1,$2,$3)`, [docId, status, comment]));

const docRow = async (id) => (await q(`select * from public.application_documents where id = $1`, [id]))[0];

let reqNewA; // NEW type, required, active
let reqNewPdfOnly; // NEW type, PDF only, 1 MB
let reqRenewal; // RENEWAL type
let bizA;
let draftA;

await test("P4-seed. sample requirements are seeded inactive and clearly labelled", async () => {
  const rows = await q(`select name, is_active, created_by from public.permit_requirements`);
  eq(rows.length, 6, "six samples");
  assert(rows.every((r) => !r.is_active), "all inactive");
  assert(rows.every((r) => r.name.startsWith("Sample:")), "labelled Sample:");
});

await test("P4-1. BPLO personnel can create requirements; creator is recorded by the server and audited", async () => {
  reqNewA = await createRequirement(bplo4, NEW_TYPE, { name: "Barangay clearance (test)", display_order: 10 });
  eq(reqNewA.created_by, bplo4, "created_by set from the session");
  eq(reqNewA.max_file_size, 5 * MB, "default 5 MB");
  eq(reqNewA.accepted_file_types.join(","), "application/pdf,image/jpeg,image/png", "default formats");
  eq(await auditCount("requirement.created", reqNewA.id), 1);
  reqNewPdfOnly = await createRequirement(admin4, NEW_TYPE, { name: "PDF only (test)", accepted_file_types: "{application/pdf}", max_file_size: MB, is_required: false });
  reqRenewal = await createRequirement(bplo4, RENEWAL_TYPE, { name: "Renewal only (test)" });
});

await test("P4-1. applicants and department staff cannot create requirements; nobody can spoof the creator", async () => {
  await rejects(() => createRequirement(appl4a, NEW_TYPE), /row-level security/, "applicant");
  await rejects(() => createRequirement(dept4, NEW_TYPE), /row-level security/, "department staff");
  await rejects(() => createRequirement(bplo4, NEW_TYPE, { created_by: admin4 }), /permission denied/, "created_by column");
});

await test("P4-1. requirement updates and activation changes are audited; permit type cannot be moved", async () => {
  const r = await createRequirement(bplo4, NEW_TYPE, { name: "Temporary (test)" });
  await as(bplo4, () => db.query(`update public.permit_requirements set applicant_instructions = 'Use a clear scan.' where id = $1`, [r.id]));
  await as(bplo4, () => db.query(`update public.permit_requirements set is_active = false where id = $1`, [r.id]));
  await as(admin4, () => db.query(`update public.permit_requirements set is_active = true where id = $1`, [r.id]));
  eq(await auditCount("requirement.updated", r.id), 1);
  eq(await auditCount("requirement.deactivated", r.id), 1);
  eq(await auditCount("requirement.activated", r.id), 1);
  eq((await q(`select updated_by from public.permit_requirements where id = $1`, [r.id]))[0].updated_by, admin4);
  await as(bplo4, () => rejects(() => db.query(`update public.permit_requirements set permit_type_id = $2 where id = $1`, [r.id, RENEWAL_TYPE]), /permission denied/));
  const res = await as(appl4a, () => db.query(`update public.permit_requirements set is_active = false where id = $1`, [r.id]));
  eq(res.affectedRows, 0, "applicant cannot change requirements");
  await as(bplo4, () => db.query(`update public.permit_requirements set is_active = false where id = $1`, [r.id]));
});

await test("P4-1. invalid requirement settings are rejected", async () => {
  await rejects(() => createRequirement(bplo4, NEW_TYPE, { accepted_file_types: "{application/x-msdownload}" }), /permit_requirements_file_types_valid/);
  await rejects(() => createRequirement(bplo4, NEW_TYPE, { accepted_file_types: "{}" }), /permit_requirements_file_types_valid/);
  await rejects(() => createRequirement(bplo4, NEW_TYPE, { max_file_size: 20 * MB }), /permit_requirements_max_size_range/);
  await rejects(() => createRequirement(bplo4, NEW_TYPE, { name: "Barangay clearance (TEST)" }), /unique|duplicate/i, "duplicate name per type");
});

await test("P4-2/3. different permit types have different requirements; applicants see only those of their applications", async () => {
  bizA = await createBusiness(appl4a, { registered_business_name: "Phase Four Store" });
  draftA = await createDraft(appl4a, bizA.id, NEW_TYPE);
  const seen = (await as(appl4a, () => q(`select id from public.permit_requirements`))).map((r) => r.id);
  assert(seen.includes(reqNewA.id) && seen.includes(reqNewPdfOnly.id), "sees active NEW requirements");
  assert(!seen.includes(reqRenewal.id), "does not see RENEWAL requirements");
  eq((await as(appl4a, () => q(`select 1 from public.permit_requirements where not is_active`))).length, 0, "inactive hidden");
  eq((await as(appl4b, () => q(`select 1 from public.permit_requirements`))).length, 0, "applicant without applications sees none");
  eq((await as(bplo4, () => q(`select 1 from public.permit_requirements where permit_type_id = $1`, [RENEWAL_TYPE]))).length >= 1, true, "staff see all");
});

let docA1;
await test("P4-4. applicant can upload a supported document to their own draft; it starts as Uploaded and is audited", async () => {
  docA1 = await uploadDoc(appl4a, draftA.id, reqNewA.id, { size: 200000, mime: "application/pdf", name: "../../etc/clearance.pdf" });
  const d = await docRow(docA1.id);
  eq(d.document_status, "uploaded", "never auto-accepted");
  eq(d.submission_version, 1);
  eq(d.is_current, true);
  eq(d.applicant_id, appl4a);
  eq(d.file_size, 200000, "size taken from storage metadata");
  assert(!d.original_filename.includes("/"), "path separators stripped from the display name");
  eq(await auditCount("document.uploaded", docA1.id), 1);
  const [log] = await q(`select description from public.audit_logs where entity_id = $1`, [docA1.id]);
  assert(!/clearance\.pdf|etc/.test(log.description), "audit text has no filename");
});

await test("P4-5. unsupported formats are rejected (storage path and registration)", async () => {
  await rejects(() => putObject(appl4a, objPath(appl4a, draftA.id, reqNewA.id, "exe")), /row-level security/, ".exe path");
  await rejects(() => putObject(appl4a, `${appl4a}/${draftA.id}/${reqNewA.id}/report.pdf`), /row-level security/, "non-generated file name");
  const p1 = objPath(appl4a, draftA.id, reqNewA.id, "pdf");
  await putObject(appl4a, p1, { mime: "text/html" });
  await rejects(() => register(appl4a, draftA.id, reqNewA.id, p1), /not accepted/, "content type mismatch");
  const p2 = objPath(appl4a, draftA.id, reqNewPdfOnly.id, "png");
  await putObject(appl4a, p2, { mime: "image/png" });
  await rejects(() => register(appl4a, draftA.id, reqNewPdfOnly.id, p2), /not accepted/, "PNG on a PDF-only requirement");
  const p3 = objPath(appl4a, draftA.id, reqNewA.id, "png");
  await putObject(appl4a, p3, { mime: "application/pdf" });
  await rejects(() => register(appl4a, draftA.id, reqNewA.id, p3), /not accepted/, "extension and type disagree");
  eq(await count(`select 1 from public.application_documents where application_id = $1`, [draftA.id]), 1, "no records for rejected files");
});

await test("P4-6. files over the requirement's size limit are rejected", async () => {
  const p = objPath(appl4a, draftA.id, reqNewPdfOnly.id, "pdf");
  await putObject(appl4a, p, { size: MB + 1 });
  await rejects(() => register(appl4a, draftA.id, reqNewPdfOnly.id, p), /larger than the 1(\.0)? MB limit/);
  const p2 = objPath(appl4a, draftA.id, reqNewPdfOnly.id, "pdf");
  await putObject(appl4a, p2, { size: 0 });
  await rejects(() => register(appl4a, draftA.id, reqNewPdfOnly.id, p2), /empty/);
});

await test("P4-18. applicants can delete their own failed (unregistered) uploads but never registered files", async () => {
  const p = objPath(appl4a, draftA.id, reqNewA.id, "pdf");
  await putObject(appl4a, p);
  const del = await as(appl4a, () => db.query(`delete from storage.objects where name = $1`, [p]));
  eq(del.affectedRows, 1, "orphan removed");
  const del2 = await as(appl4a, () => db.query(`delete from storage.objects where name = $1`, [docA1.path]));
  eq(del2.affectedRows, 0, "registered file kept");
  const upd = await as(appl4a, () => db.query(`update storage.objects set metadata = '{}'::jsonb where name = $1`, [docA1.path]).then((r) => r.affectedRows, () => 0));
  eq(upd, 0, "objects cannot be overwritten in place");
});

await test("P4-7. another applicant cannot upload to, register for, or read someone else's application", async () => {
  await rejects(() => putObject(appl4b, objPath(appl4b, draftA.id, reqNewA.id)), /row-level security/, "own folder but someone else's application");
  await rejects(() => putObject(appl4b, objPath(appl4a, draftA.id, reqNewA.id)), /row-level security/, "someone else's folder");
  await rejects(() => register(appl4b, draftA.id, reqNewA.id, docA1.path), /Application not found/, "register");
  await as(appl4b, async () => {
    eq(await count(`select 1 from public.application_documents`), 0, "document rows");
    eq(await count(`select 1 from storage.objects where name = $1`, [docA1.path]), 0, "file");
  });
  await as(null, () => rejects(() => db.query(`select * from public.application_documents`), /permission denied/));
});

await test("P4-8. applicants cannot change document statuses or write review history", async () => {
  await as(appl4a, async () => {
    await rejects(() => db.query(`update public.application_documents set document_status = 'accepted' where id = $1`, [docA1.id]), /permission denied/);
    await rejects(() => db.query(`insert into public.application_documents (application_id, requirement_id, applicant_id, original_filename, storage_path, mime_type, file_size, submission_version) values ($1,$2,$3,'x.pdf','x','application/pdf',1,9)`, [draftA.id, reqNewA.id, appl4a]), /permission denied/);
    await rejects(() => db.query(`select public.review_application_document($1,'accepted',null)`, [docA1.id]), /Only BPLO personnel/);
    await rejects(() => db.query(`insert into public.document_review_history (application_document_id, previous_status, new_status) values ($1,'uploaded','accepted')`, [docA1.id]), /permission denied/);
  });
  eq((await docRow(docA1.id)).document_status, "uploaded");
});

let docA2;
await test("P4-12. replacing a draft document keeps the previous version", async () => {
  docA2 = await uploadDoc(appl4a, draftA.id, reqNewA.id);
  const [v1, v2] = [await docRow(docA1.id), await docRow(docA2.id)];
  eq(v1.is_current, false, "old version kept, not current");
  eq(v2.is_current, true);
  eq(v2.submission_version, 2);
  eq(await auditCount("document.replaced", docA2.id), 1);
  eq(await as(appl4a, () => count(`select 1 from public.application_documents where requirement_id = $1`, [reqNewA.id])), 2, "both versions visible to the owner");
});

await test("P4-9. BPLO personnel cannot see or review documents of draft applications", async () => {
  await as(bplo4, async () => {
    eq(await count(`select 1 from public.application_documents where id = $1`, [docA2.id]), 0, "draft documents hidden");
    eq(await count(`select 1 from storage.objects where name = $1`, [docA2.path]), 0, "draft files hidden");
  });
  await rejects(() => review(bplo4, docA2.id, "accepted"), /Only documents of submitted applications/);
});

await test("P4-13. after submission, uploaded documents are locked; missing requirements can still be uploaded", async () => {
  await submit(appl4a, draftA.id);
  await rejects(() => putObject(appl4a, objPath(appl4a, draftA.id, reqNewA.id)), /row-level security/, "replace an uploaded document after submission");
  const late = await uploadDoc(appl4a, draftA.id, reqNewPdfOnly.id, { size: 1000 });
  eq((await docRow(late.id)).document_status, "uploaded", "missing optional requirement uploaded after submission");
});

await test("P4-9. BPLO personnel review submitted documents; every action records reviewer, time and history", async () => {
  await review(bplo4, docA2.id, "under_review");
  await rejects(() => review(bplo4, docA2.id, "needs_resubmission", "   "), /Explain what the applicant needs to fix/);
  await review(bplo4, docA2.id, "needs_resubmission", "The scan is cut off. Upload the whole page.");
  const d = await docRow(docA2.id);
  eq(d.document_status, "needs_resubmission");
  eq(d.last_reviewed_by, bplo4);
  assert(d.last_reviewed_at !== null, "timestamp");
  const hist = await q(`select previous_status, new_status, reviewed_by, review_comment from public.document_review_history where application_document_id = $1 order by created_at`, [docA2.id]);
  eq(hist.map((h) => `${h.previous_status}>${h.new_status}`).join(","), "uploaded>under_review,under_review>needs_resubmission");
  assert(hist.every((h) => h.reviewed_by === bplo4), "reviewer recorded");
  eq(await auditCount("document.resubmission_requested", docA2.id), 1);
  eq(await auditCount("document.review_started", docA2.id), 1);
  await as(bplo4, async () => eq(await count(`select 1 from storage.objects where name = $1`, [docA2.path]), 1, "BPLO can read the submitted file"));
});

await test("P4-9. administrators, department staff and applicants cannot review documents", async () => {
  await rejects(() => review(admin4, docA2.id, "accepted"), /Only BPLO personnel/);
  await rejects(() => review(dept4, docA2.id, "accepted"), /Only BPLO personnel/);
  await as(dept4, async () => eq(await count(`select 1 from public.application_documents`), 0, "department staff see no documents"));
  await rejects(() => review(bplo4, docA1.id, "accepted"), /older version/, "superseded versions cannot be reviewed");
  await rejects(() => review(bplo4, docA2.id, "approved"), /Invalid review status/);
});

await test("P4-10. the applicant sees the reviewer's comment and the review history", async () => {
  await as(appl4a, async () => {
    const [d] = await q(`select document_status, review_comment from public.application_documents where id = $1`, [docA2.id]);
    eq(d.document_status, "needs_resubmission");
    eq(d.review_comment, "The scan is cut off. Upload the whole page.");
    eq(await count(`select 1 from public.document_review_history where application_document_id = $1`, [docA2.id]), 2);
  });
  await as(appl4b, async () => eq(await count(`select 1 from public.document_review_history`), 0, "other applicants see none"));
});

let docA3;
await test("P4-11/12. the applicant can replace a document needing resubmission; history and old versions remain", async () => {
  docA3 = await uploadDoc(appl4a, draftA.id, reqNewA.id);
  const d3 = await docRow(docA3.id);
  eq(d3.document_status, "uploaded", "replacement goes back to Uploaded");
  eq(d3.submission_version, 3);
  const d2 = await docRow(docA2.id);
  eq(d2.is_current, false);
  eq(d2.document_status, "needs_resubmission", "old version keeps its review outcome");
  eq(await count(`select 1 from public.document_review_history where application_document_id = $1`, [docA2.id]), 2, "history kept");
  await rejects(() => putObject(appl4a, objPath(appl4a, draftA.id, reqNewA.id)), /row-level security/, "cannot replace again until reviewed");
  await review(bplo4, docA3.id, "accepted", "Readable and complete.");
  eq((await docRow(docA3.id)).document_status, "accepted");
  eq(await auditCount("document.accepted", docA3.id), 1);
});

await test("P4-13. private files cannot be read without authorization", async () => {
  await as(null, () => rejects(() => db.query(`select * from storage.objects`), /permission denied/, "anonymous"));
  await as(appl4b, async () => eq(await count(`select 1 from storage.objects where name like $1`, [`${appl4a}/%`]), 0, "other applicant"));
  await as(dept4, async () => eq(await count(`select 1 from storage.objects where bucket_id = 'permit-documents'`), 0, "department staff"));
  await as(admin4, async () => eq(await count(`select 1 from storage.objects where name = $1`, [docA3.path]), 0, "administrators do not read applicant files"));
});

await test("P4-13. cancelled applications and inactive requirements accept no uploads", async () => {
  const d = await createDraft(appl4a, bizA.id, NEW_TYPE);
  await as(appl4a, () => db.query(`select public.cancel_permit_application($1, null)`, [d.id]));
  await rejects(() => putObject(appl4a, objPath(appl4a, d.id, reqNewA.id)), /row-level security/, "cancelled");
  const d2 = await createDraft(appl4a, bizA.id, NEW_TYPE);
  const inactive = await createRequirement(bplo4, NEW_TYPE, { name: "Inactive (test)", is_active: false });
  await rejects(() => putObject(appl4a, objPath(appl4a, d2.id, inactive.id)), /row-level security/, "inactive requirement");
  await rejects(() => putObject(appl4a, objPath(appl4a, d2.id, reqRenewal.id)), /row-level security/, "requirement of another permit type");
});

await test("P4-12. review history is append-only and documents cannot be deleted", async () => {
  await rejects(() => db.query(`delete from public.document_review_history where application_document_id = $1`, [docA2.id]), /cannot be changed/);
  await as(appl4a, () => rejects(() => db.query(`delete from public.application_documents where id = $1`, [docA3.id]), /permission denied/));
  await rejects(() => db.query(`delete from public.permit_applications where id = $1`, [draftA.id]), /Only draft applications/);
});

await test("P4-14. a deactivated requirement keeps its uploaded documents visible to the applicant", async () => {
  await as(bplo4, () => db.query(`update public.permit_requirements set is_active = false where id = $1`, [reqNewPdfOnly.id]));
  await as(appl4a, async () => {
    eq(await count(`select 1 from public.permit_requirements where id = $1`, [reqNewPdfOnly.id]), 1, "still visible through the uploaded document");
    eq(await count(`select 1 from public.application_documents where requirement_id = $1`, [reqNewPdfOnly.id]), 1);
  });
});

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
let failed = 0;
for (const r of results) {
  console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}`);
  if (!r.ok) {
    failed += 1;
    console.log(`      ${r.error}`);
  }
}
console.log(`\n${results.length - failed}/${results.length} database tests passed.`);
await db.close();
process.exit(failed ? 1 : 0);
