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
import {
  businessCreateSchema,
  businessSearchSchema,
  businessUpdateSchema,
  manilaToday,
  setRecordStatusSchema,
} from "../src/lib/business/schemas.ts";
import {
  applicationCreateSchema,
  applicationSearchSchema,
  applicationSubmitSchema,
  applicationUpdateSchema,
  cancelApplicationSchema,
} from "../src/lib/applications/schemas.ts";
import { formatBusinessAddress } from "../src/lib/business/constants.ts";

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

// ---- Phase 3: business profiles ---------------------------------------------
const ID = "3f2b8f5e-8c1a-4c2e-9a77-0d1f6a3c9b11";
const validBusiness = {
  registeredBusinessName: "  Dela Cruz Sari-Sari Store ",
  tradeName: "",
  businessDescription: "",
  businessType: "Retail store",
  ownershipType: "sole_proprietorship",
  businessCategory: "Retail trade",
  businessEmail: " Store@Example.COM ",
  businessContactNumber: "(043) 312-3456",
  province: "Batangas",
  municipality: "Rosario",
  barangay: "Poblacion A",
  streetAddress: "",
  zipCode: "4225",
  ownerFullName: "Juan Dela Cruz",
  ownerEmail: "",
  ownerContactNumber: "0917 123 4567",
  natureOfBusiness: "Retail of household goods",
  employeeCount: "3",
  estimatedCapital: "₱50,000.50",
  establishmentStatus: "operating",
  dateEstablished: "2020-05-01",
};

test("business create: valid input passes and is normalised", () => {
  const r = businessCreateSchema.safeParse(validBusiness);
  assert(r.success, messages(r).join("; "));
  assert(r.data.registeredBusinessName === "Dela Cruz Sari-Sari Store", "trimmed");
  assert(r.data.tradeName === null && r.data.streetAddress === null && r.data.ownerEmail === null, "empty optional fields become null");
  assert(r.data.businessEmail === "store@example.com", "email lower-cased");
  assert(r.data.businessContactNumber === "0433123456", "landline normalised");
  assert(r.data.ownerContactNumber === "09171234567", "mobile normalised");
  assert(r.data.employeeCount === 3, "employee count is a number");
  assert(r.data.estimatedCapital === 50000.5, "capital parsed");
});

test("business create: ownership, reference and status sent by the browser are discarded", () => {
  const r = businessCreateSchema.safeParse({ ...validBusiness, owner_id: ID, ownerId: ID, business_reference_number: "BUS-2026-000001", record_status: "active" });
  assert(r.success, messages(r).join("; "));
  for (const k of ["owner_id", "ownerId", "business_reference_number", "record_status"]) assert(!(k in r.data), `${k} must not survive parsing`);
});

test("business create: required fields", () => {
  for (const k of ["registeredBusinessName", "businessType", "businessCategory", "businessContactNumber", "barangay", "ownerFullName", "ownerContactNumber", "natureOfBusiness", "employeeCount"]) {
    const m = messages(businessCreateSchema.safeParse({ ...validBusiness, [k]: "  " }));
    assert(m.some((x) => x.startsWith(`${k}:`)), `${k} should be required: ${m.join("; ")}`);
  }
  assert(!businessCreateSchema.safeParse({ ...validBusiness, ownershipType: "" }).success, "ownership type");
  assert(!businessCreateSchema.safeParse({ ...validBusiness, establishmentStatus: "" }).success, "establishment status");
});

test("business create: email and contact number formats", () => {
  assert(!businessCreateSchema.safeParse({ ...validBusiness, businessEmail: "not-an-email" }).success, "business email");
  assert(!businessCreateSchema.safeParse({ ...validBusiness, ownerEmail: "a@b" }).success, "owner email");
  for (const n of ["12345", "1917 123 4567", "0917-123-45678-9", "09171234a67"]) {
    assert(!businessCreateSchema.safeParse({ ...validBusiness, businessContactNumber: n }).success, `rejects ${n}`);
  }
  assert(businessCreateSchema.safeParse({ ...validBusiness, ownerContactNumber: "+63 917 123 4567" }).success, "+63 mobile");
});

test("business create: numeric fields, ZIP code and dates", () => {
  for (const v of ["-1", "2.5", "abc", "1e3"]) assert(!businessCreateSchema.safeParse({ ...validBusiness, employeeCount: v }).success, `employees ${v}`);
  assert(businessCreateSchema.safeParse({ ...validBusiness, employeeCount: "0" }).success, "zero employees");
  for (const v of ["-5", "abc", "1.234", "99999999999999"]) assert(!businessCreateSchema.safeParse({ ...validBusiness, estimatedCapital: v }).success, `capital ${v}`);
  assert(businessCreateSchema.safeParse({ ...validBusiness, estimatedCapital: "" }).data?.estimatedCapital === null, "capital optional");
  for (const z of ["422", "42250", "42a5"]) assert(!businessCreateSchema.safeParse({ ...validBusiness, zipCode: z }).success, `zip ${z}`);
  assert(!businessCreateSchema.safeParse({ ...validBusiness, dateEstablished: "2999-01-01" }).success, "future date");
  assert(!businessCreateSchema.safeParse({ ...validBusiness, dateEstablished: "05/01/2020" }).success, "bad date format");
  assert(businessCreateSchema.safeParse({ ...validBusiness, dateEstablished: manilaToday() }).success, "today allowed");
  assert(businessCreateSchema.safeParse({ ...validBusiness, dateEstablished: "" }).data?.dateEstablished === null, "date optional");
});

test("business update: needs a valid business id; record status input is restricted", () => {
  assert(businessUpdateSchema.safeParse({ ...validBusiness, businessId: ID }).success);
  assert(!businessUpdateSchema.safeParse({ ...validBusiness, businessId: "1" }).success);
  assert(setRecordStatusSchema.safeParse({ businessId: ID, status: "active" }).success);
  assert(!setRecordStatusSchema.safeParse({ businessId: ID, status: "approved" }).success);
});

test("business address formatting uses the profile fields", () => {
  const a = formatBusinessAddress({ street_address: "123 Rizal St.", barangay: "Poblacion A", municipality: "Rosario", province: "Batangas", zip_code: "4225" });
  assert(a === "123 Rizal St., Brgy. Poblacion A, Rosario, Batangas 4225", a);
});

// ---- Phase 3: permit applications -------------------------------------------
const validApp = {
  businessId: ID,
  permitTypeId: ID,
  businessName: "Dela Cruz Store",
  businessAddress: "Poblacion A, Rosario, Batangas 4225",
  natureOfBusiness: "Retail",
  businessCategory: "Retail trade",
  applicantRemarks: "",
};

test("application create/update: a draft needs only a business and a type", () => {
  const r = applicationCreateSchema.safeParse({ ...validApp, businessName: "", businessAddress: "", natureOfBusiness: "", businessCategory: "" });
  assert(r.success, messages(r).join("; "));
  assert(r.data.businessName === null && r.data.applicantRemarks === null, "empty fields become null");
  assert(!applicationCreateSchema.safeParse({ ...validApp, businessId: "" }).success, "business required");
  assert(!applicationCreateSchema.safeParse({ ...validApp, permitTypeId: "NEW" }).success, "type must be a real id");
  assert(applicationUpdateSchema.safeParse({ ...validApp, applicationId: ID }).success);
  assert(!applicationUpdateSchema.safeParse({ ...validApp, applicationId: "x" }).success);
  assert(!applicationCreateSchema.safeParse({ ...validApp, applicantRemarks: "x".repeat(1001) }).success, "remarks length");
});

test("application: status, reference and applicant sent by the browser are discarded", () => {
  const r = applicationCreateSchema.safeParse({ ...validApp, application_status: "submitted", reference_number: "PTY-2026-000001", applicant_id: ID });
  assert(r.success);
  for (const k of ["application_status", "reference_number", "applicant_id"]) assert(!(k in r.data), `${k} must not survive parsing`);
});

test("application submit: every field and the declaration are required", () => {
  assert(applicationSubmitSchema.safeParse({ ...validApp, declaration: "on" }).success);
  assert(!applicationSubmitSchema.safeParse({ ...validApp }).success, "declaration");
  for (const k of ["businessName", "businessAddress", "natureOfBusiness", "businessCategory"]) {
    const m = messages(applicationSubmitSchema.safeParse({ ...validApp, [k]: " ", declaration: "on" }));
    assert(m.some((x) => x.startsWith(`${k}:`)), `${k}: ${m.join("; ")}`);
  }
});

test("application cancel: reason optional, at most 500 characters", () => {
  assert(cancelApplicationSchema.safeParse({ applicationId: ID, reason: "" }).data?.reason === null);
  assert(cancelApplicationSchema.safeParse({ applicationId: ID, reason: "Plans changed" }).success);
  assert(!cancelApplicationSchema.safeParse({ applicationId: ID, reason: "x".repeat(501) }).success);
  assert(!cancelApplicationSchema.safeParse({ applicationId: "PTY-2026-000001" }).success, "internal id required, not the reference");
});

test("business and application search reject PostgREST filter characters", () => {
  for (const schema of [businessSearchSchema, applicationSearchSchema]) {
    for (const bad of ["a,owner_id.eq.x", "x)", "(x", "100%", "a*b", "a;b", "a\\b"]) assert(!schema.safeParse(bad).success, `rejects ${bad}`);
    for (const ok of ["PTY-2026-000001", "BUS-2026", "Juan's Store", "A & B Trading", "Niño Bakery"]) assert(schema.safeParse(ok).success, `accepts ${ok}`);
  }
});

let failed = 0;
for (const r of results) {
  console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}`);
  if (!r.ok) { failed++; console.log(`      ${r.error}`); }
}
console.log(`\n${results.length - failed}/${results.length} validation tests passed.`);
process.exit(failed ? 1 : 0);
