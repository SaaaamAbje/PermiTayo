"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { AuthError } from "@supabase/supabase-js";
import { getSiteUrl, isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { dashboardHref, roleIdFromDbRole } from "@/lib/roles";
import { requireUser } from "@/lib/auth/dal";
import {
  forgotPasswordSchema,
  loginSchema,
  profileSchema,
  registerSchema,
  resetPasswordSchema,
} from "@/lib/auth/schemas";
import { fieldErrorsFrom, safeInternalPath, type FormState } from "@/lib/auth/form-state";

const NOT_CONFIGURED: FormState = {
  message: "Permitayo is not connected to Supabase yet, so this action is unavailable. See the setup guide.",
};

function text(formData: FormData, key: string) {
  const v = formData.get(key);
  return typeof v === "string" ? v : "";
}

function authMessage(error: AuthError, fallback: string) {
  switch (error.code) {
    case "invalid_credentials":
      return "Incorrect email or password.";
    case "email_not_confirmed":
      return "Please confirm your email address first. Check your inbox for the confirmation link.";
    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
      return "Too many attempts. Please wait a few minutes and try again.";
    case "same_password":
      return "Choose a password different from your current one.";
    case "weak_password":
      return "That password is too easy to guess. Try a longer one.";
    case "session_not_found":
    case "refresh_token_not_found":
      return "Your session has expired. Please request a new link.";
    default:
      return fallback;
  }
}

// ---------------------------------------------------------------------------
// Sign in
// ---------------------------------------------------------------------------
export async function signInAction(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;

  const raw = { email: text(formData, "email"), password: text(formData, "password") };
  const parsed = loginSchema.safeParse(raw);
  if (!parsed.success) {
    return { fieldErrors: fieldErrorsFrom(parsed.error), values: { email: raw.email } };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error || !data.user) {
    return {
      message: error ? authMessage(error, "We couldn't sign you in. Please try again.") : "Incorrect email or password.",
      values: { email: raw.email },
    };
  }

  // The profile is the source of truth for role and account status.
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, account_status")
    .eq("id", data.user.id)
    .maybeSingle();

  if (!profile) {
    await supabase.auth.signOut({ scope: "local" });
    return { message: "We couldn't load your account. Please contact an administrator.", values: { email: raw.email } };
  }
  if (profile.account_status !== "active") {
    await supabase.auth.signOut({ scope: "local" });
    const why =
      profile.account_status === "pending"
        ? "Your account is waiting for approval."
        : "Your account is not active.";
    return { message: `${why} Please contact the BPLO or a system administrator.`, values: { email: raw.email } };
  }

  await supabase.rpc("log_self_event", { p_action: "user.login" });

  const roleId = roleIdFromDbRole(profile.role);
  const home = dashboardHref(roleId);
  // Honour ?next= only when it points inside this user's own dashboard.
  const next = safeInternalPath(formData.get("next"), home);
  redirect(next === home || next.startsWith(`${home}/`) ? next : home);
}

// ---------------------------------------------------------------------------
// Applicant registration (the only public sign-up; role is always "applicant")
// ---------------------------------------------------------------------------
export async function registerAction(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;

  const raw = {
    fullName: text(formData, "fullName"),
    email: text(formData, "email"),
    phone: text(formData, "phone"),
    password: text(formData, "password"),
    confirm: text(formData, "confirm"),
    privacy: text(formData, "privacy"),
  };
  const echo = { fullName: raw.fullName, email: raw.email, phone: raw.phone };
  const parsed = registerSchema.safeParse(raw);
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error), values: echo };

  const confirmUrl = new URL("/auth/confirm", getSiteUrl());
  confirmUrl.searchParams.set("next", "/login?confirmed=1");

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo: confirmUrl.toString(),
      // No role is sent. The database trigger always creates an applicant profile.
      data: {
        full_name: parsed.data.fullName,
        phone_number: parsed.data.phone,
        privacy_notice_accepted: "true",
      },
    },
  });

  if (error) {
    return {
      message: authMessage(error, "We couldn't create your account. Please try again."),
      values: echo,
    };
  }

  // Only possible if the project has email confirmation turned off.
  if (data.session) redirect("/dashboard");

  // Same message whether or not the email was already registered.
  return {
    ok: true,
    message: "Check your email. We sent a confirmation link. Confirm your address, then sign in.",
  };
}

// ---------------------------------------------------------------------------
// Sign out
// ---------------------------------------------------------------------------
export async function signOutAction(): Promise<void> {
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    if (data.user) await supabase.rpc("log_self_event", { p_action: "user.logout" });
    await supabase.auth.signOut({ scope: "local" });
  }
  redirect("/login?signedout=1");
}

// ---------------------------------------------------------------------------
// Password reset
// ---------------------------------------------------------------------------
export async function forgotPasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;

  const raw = { email: text(formData, "email") };
  const parsed = forgotPasswordSchema.safeParse(raw);
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error), values: raw };

  const redirectTo = new URL("/auth/confirm", getSiteUrl());
  redirectTo.searchParams.set("next", "/reset-password");

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: redirectTo.toString(),
  });
  if (error && (error.code === "over_request_rate_limit" || error.code === "over_email_send_rate_limit")) {
    return { message: authMessage(error, ""), values: raw };
  }

  // Never reveal whether the address belongs to an account.
  return {
    ok: true,
    message: "If an account exists for that email, a reset link is on its way. The link expires after a short time.",
  };
}

export async function resetPasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;

  const parsed = resetPasswordSchema.safeParse({
    password: text(formData, "password"),
    confirm: text(formData, "confirm"),
  });
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error) };

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return { message: "Your reset link has expired. Please request a new one." };
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { message: authMessage(error, "We couldn't update your password. Please try again.") };

  await supabase.rpc("log_self_event", { p_action: "user.password_changed" });
  redirect("/dashboard");
}

// ---------------------------------------------------------------------------
// Own profile (name and phone only; RLS and column grants enforce the same)
// ---------------------------------------------------------------------------
export async function updateProfileAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();

  const raw = { fullName: text(formData, "fullName"), phone: text(formData, "phone") };
  const parsed = profileSchema.safeParse(raw);
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error), values: raw };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .update({ full_name: parsed.data.fullName, phone_number: parsed.data.phone === "" ? null : parsed.data.phone })
    .eq("id", user.id)
    .select("id");

  if (error || !data || data.length === 0) {
    return { message: "We couldn't save your changes. Please try again.", values: raw };
  }

  revalidatePath("/dashboard", "layout");
  return { ok: true, message: "Profile updated.", values: raw };
}
