#!/usr/bin/env node
/**
 * Creates the FIRST administrator account for Permitayo.
 *
 * Run this on a trusted computer, never on a web server or in the browser.
 * It uses the Supabase service-role key, which bypasses Row Level Security.
 *
 *   npm run provision:admin -- --email admin@example.com --name "Full Name"
 *
 * Reads from .env.local: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
 * The password is read from the ADMIN_PASSWORD variable, or typed at a hidden prompt.
 * It is never printed or stored by this script.
 *
 * Safety: refuses to run if any administrator already exists. After the first one,
 * additional administrators are promoted from Dashboard > Admin > User Management.
 */
import { createClient } from "@supabase/supabase-js";
import { createInterface } from "node:readline";

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

function fail(message) {
  console.error(`\nError: ${message}\n`);
  process.exit(1);
}

function promptHidden(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const write = rl._writeToOutput;
    rl._writeToOutput = (s) => {
      if (s.includes(question)) write.call(rl, s);
    };
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
  });
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  fail("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local first.");
}

const email = (arg("email") ?? "").trim().toLowerCase();
const fullName = (arg("name") ?? "").trim();
if (!/^\S+@\S+\.\S+$/.test(email)) fail('Provide a valid email: --email admin@example.com');
if (fullName.length < 2) fail('Provide the administrator\'s full name: --name "Full Name"');

let password = process.env.ADMIN_PASSWORD;
if (!password) password = await promptHidden("Choose a password (12+ characters): ");
if (!password || password.length < 12 || password.length > 72) {
  fail("The password must be between 12 and 72 characters.");
}
if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
  fail("The password must include at least one letter and one number.");
}

const supabase = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

// 1. Only bootstrap: stop if any administrator already exists.
const { count, error: countError } = await supabase
  .from("profiles")
  .select("id", { count: "exact", head: true })
  .eq("role", "administrator");
if (countError) {
  fail(`Could not check existing administrators. Have the migrations been applied? (${countError.message})`);
}
if ((count ?? 0) > 0) {
  fail("An administrator already exists. Promote further administrators from the User Management screen.");
}

// 2. Create the auth user (email pre-confirmed). The database trigger creates an applicant profile.
const { data: created, error: createError } = await supabase.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: { full_name: fullName },
});
if (createError || !created.user) {
  fail(`Could not create the user: ${createError?.message ?? "unknown error"}`);
}
const userId = created.user.id;

// 3. Promote the profile. Only the service role can do this.
const { error: promoteError } = await supabase
  .from("profiles")
  .update({ role: "administrator", account_status: "active" })
  .eq("id", userId);

if (promoteError) {
  // Roll back so no half-created account is left behind.
  await supabase.auth.admin.deleteUser(userId);
  fail(`Could not assign the administrator role (${promoteError.message}). The new user was removed.`);
}

// 4. Record it.
await supabase.from("audit_logs").insert({
  user_id: userId,
  action: "admin.provisioned",
  entity_type: "profile",
  entity_id: userId,
  description: "Initial administrator account provisioned by the setup script.",
});

console.log(`\nAdministrator created: ${email}`);
console.log("Sign in at /login with the password you chose.\n");
