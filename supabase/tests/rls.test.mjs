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
    name text not null
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
await test("storage: bucket is private; applicants can use only their own folder", async () => {
  const [b] = await q(`select public from storage.buckets where id = 'permit-documents'`);
  eq(b.public, false);
  const owner = await makeUser("uploader");
  const other = await makeUser("uploader2");
  await as(owner, async () => {
    await db.query(`insert into storage.objects (bucket_id, name) values ('permit-documents', '${owner}/dti.pdf')`);
    await rejects(
      () => db.query(`insert into storage.objects (bucket_id, name) values ('permit-documents', '${other}/dti.pdf')`),
      /row-level security/,
      "other user's folder",
    );
    eq(await count(`select 1 from storage.objects`), 1);
  });
  await as(other, async () => eq(await count(`select 1 from storage.objects`), 0, "cannot read another applicant's files"));
  await as(bplo, () =>
    rejects(() => db.query(`insert into storage.objects (bucket_id, name) values ('permit-documents', '${bplo}/x.pdf')`), /row-level security/),
  );
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
