// Validation and redirect-safety tests. Run: npm run test:validation
import {
  assignDepartmentSchema,
  changeRoleSchema,
  changeStatusSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  userSearchSchema,
} from "../src/lib/auth/schemas.ts";
import { safeInternalPath } from "../src/lib/auth/form-state.ts";

const results = [];
function test(name, fn) {
  try { fn(); results.push({ name, ok: true }); }
  catch (e) { results.push({ name, ok: false, error: e.message }); }
}
function assert(c, m) { if (!c) throw new Error(m ?? "assertion failed"); }
const messages = (r) => (r.success ? [] : r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`));

const validRegistration = {
  fullName: "  Maria Santos ",
  email: "  Maria@Example.COM ",
  phone: "0917 123-4567",
  password: "Sunrise2026",
  confirm: "Sunrise2026",
  privacy: "on",
};

test("register: valid input passes and is normalised", () => {
  const r = registerSchema.safeParse(validRegistration);
  assert(r.success, messages(r).join("; "));
  assert(r.data.email === "maria@example.com", "email lower-cased and trimmed");
  assert(r.data.phone === "09171234567", "phone spaces and dashes removed");
  assert(r.data.fullName === "Maria Santos", "name trimmed");
});

test("register: a role or status sent by the browser is discarded", () => {
  const r = registerSchema.safeParse({ ...validRegistration, role: "administrator", account_status: "active" });
  assert(r.success, "should still validate");
  assert(!("role" in r.data) && !("account_status" in r.data), "privileged fields must not survive parsing");
});

test("register: password rules", () => {
  assert(!registerSchema.safeParse({ ...validRegistration, password: "short1", confirm: "short1" }).success, "too short");
  assert(!registerSchema.safeParse({ ...validRegistration, password: "onlyletters", confirm: "onlyletters" }).success, "no digit");
  assert(!registerSchema.safeParse({ ...validRegistration, password: "12345678901", confirm: "12345678901" }).success, "no letter");
  assert(!registerSchema.safeParse({ ...validRegistration, password: "a1".repeat(40), confirm: "a1".repeat(40) }).success, "over 72 chars");
});

test("register: confirm mismatch is reported on the confirm field", () => {
  const m = messages(registerSchema.safeParse({ ...validRegistration, confirm: "Different2026" }));
  assert(m.some((x) => x.startsWith("confirm:")), m.join("; "));
});

test("register: privacy notice must be accepted", () => {
  assert(!registerSchema.safeParse({ ...validRegistration, privacy: "" }).success, "empty");
  assert(!registerSchema.safeParse({ ...validRegistration, privacy: "off" }).success, "wrong value");
  const rest = { ...validRegistration };
  delete rest.privacy;
  assert(!registerSchema.safeParse(rest).success, "missing");
});

test("register: phone and email formats", () => {
  for (const phone of ["12345", "0817 123 4567", "09171234", "+639171234567x"]) {
    assert(!registerSchema.safeParse({ ...validRegistration, phone }).success, `bad phone ${phone}`);
  }
  assert(registerSchema.safeParse({ ...validRegistration, phone: "+63 917 123 4567" }).success, "+63 format");
  assert(!registerSchema.safeParse({ ...validRegistration, email: "not-an-email" }).success, "bad email");
});

test("login: requires a valid email and a password", () => {
  assert(!loginSchema.safeParse({ email: "x", password: "y" }).success);
  assert(!loginSchema.safeParse({ email: "a@b.co", password: "" }).success);
  assert(loginSchema.safeParse({ email: "A@B.CO", password: "anything" }).success);
});

test("reset password: strength and confirmation", () => {
  assert(!resetPasswordSchema.safeParse({ password: "weak", confirm: "weak" }).success);
  assert(!resetPasswordSchema.safeParse({ password: "Strong2026", confirm: "Strong2027" }).success);
  assert(resetPasswordSchema.safeParse({ password: "Strong2026", confirm: "Strong2026" }).success);
});

test("admin: role must be one of the five allowed roles", () => {
  const id = "3f2b8f5e-8c1a-4c2e-9a77-0d1f6a3c9b11";
  for (const role of ["applicant", "bplo_personnel", "department_personnel", "department_head", "administrator"]) {
    assert(changeRoleSchema.safeParse({ userId: id, role }).success, role);
  }
  for (const role of ["root", "admin", "", "ADMINISTRATOR", "applicant; drop table profiles"]) {
    assert(!changeRoleSchema.safeParse({ userId: id, role }).success, `rejects ${role}`);
  }
  assert(!changeRoleSchema.safeParse({ userId: "not-a-uuid", role: "applicant" }).success, "id must be a uuid");
});

test("admin: status and department assignment inputs", () => {
  const id = "3f2b8f5e-8c1a-4c2e-9a77-0d1f6a3c9b11";
  assert(changeStatusSchema.safeParse({ userId: id, status: "suspended" }).success);
  assert(!changeStatusSchema.safeParse({ userId: id, status: "banned" }).success);
  assert(assignDepartmentSchema.safeParse({ userId: id, departmentId: id, position: "Reviewer" }).success);
  assert(!assignDepartmentSchema.safeParse({ userId: id, departmentId: "x" }).success);
  assert(!assignDepartmentSchema.safeParse({ userId: id, departmentId: id, position: "x".repeat(81) }).success);
});

test("user search rejects characters that could alter a PostgREST filter", () => {
  for (const bad of ["a,role.eq.administrator", "x)", "(x", "100%", "a*b", "a;b", "a\\b"]) {
    assert(!userSearchSchema.safeParse(bad).success, `rejects ${bad}`);
  }
  for (const ok of ["maria", "Maria Santos", "maria@example.com", "o'brien", "a.b-c_d+e", "Dela Cruz", "José"]) {
    assert(userSearchSchema.safeParse(ok).success, `accepts ${ok}`);
  }
});

test("redirect safety: only same-site relative paths are allowed", () => {
  const fb = "/dashboard";
  for (const bad of ["//evil.com", "///evil.com", "/\\evil.com", "https://evil.com", "http://evil.com/x", "javascript:alert(1)", "evil.com", "", null, undefined, 42, "/ok\nSet-Cookie: a=b"]) {
    assert(safeInternalPath(bad, fb) === fb, `blocks ${JSON.stringify(bad)}`);
  }
  assert(safeInternalPath("/dashboard/admin/users?q=a", fb) === "/dashboard/admin/users?q=a");
  assert(safeInternalPath("/login?confirmed=1", fb) === "/login?confirmed=1");
});

let failed = 0;
for (const r of results) {
  console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}`);
  if (!r.ok) { failed++; console.log(`      ${r.error}`); }
}
console.log(`\n${results.length - failed}/${results.length} validation tests passed.`);
process.exit(failed ? 1 : 0);
