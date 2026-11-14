import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { safeInternalPath } from "@/lib/auth/form-state";

const OTP_TYPES: EmailOtpType[] = ["signup", "invite", "magiclink", "recovery", "email_change", "email"];

/**
 * Landing point for links in Supabase emails (signup confirmation, password reset).
 * Supports both the token_hash link format and the PKCE ?code= format.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const go = (path: string) => NextResponse.redirect(new URL(path, request.nextUrl.origin));

  if (!isSupabaseConfigured()) return go("/login?error=not-configured");

  const tokenHash = searchParams.get("token_hash");
  const typeParam = searchParams.get("type");
  const code = searchParams.get("code");
  const type = OTP_TYPES.find((t) => t === typeParam);
  const next = safeInternalPath(searchParams.get("next"), "/dashboard");

  // Supabase reports expired or already-used links with error parameters instead of a code.
  if (searchParams.get("error") || searchParams.get("error_code")) return go("/login?error=link-invalid");

  const supabase = await createClient();
  let failed = false;

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    failed = Boolean(error);
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    failed = Boolean(error);
    // Default Supabase email template: Supabase has ALREADY confirmed the address before
    // redirecting here with ?code=. Exchanging the code fails when the link is opened in a
    // different browser or device (no PKCE verifier cookie), but the account is confirmed,
    // so a sign-up confirmation should not be reported as an invalid link.
    if (failed && next.startsWith("/login")) return go("/login?confirmed=1");
  } else {
    failed = true;
  }

  if (failed) return go("/login?error=link-invalid");

  // After confirming a new account the person signs in themselves.
  const confirmedSignup = type === "signup" || type === "email" || next.startsWith("/login");
  if (confirmedSignup && type !== "recovery") {
    await supabase.auth.signOut({ scope: "local" });
    return go("/login?confirmed=1");
  }

  return go(type === "recovery" ? "/reset-password" : next);
}
