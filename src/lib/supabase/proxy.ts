import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseConfig } from "@/lib/env";

export interface SessionResult {
  response: NextResponse;
  /** True when the JWT in the cookie verified successfully. */
  authenticated: boolean;
  /** True when auth cookies exist but could not be verified (expired or revoked). */
  expired: boolean;
}

/**
 * Refreshes the Supabase session cookie and reports whether the request is
 * authenticated. This is an optimistic check for redirects only. Authorization
 * is enforced again in server code (src/lib/auth/dal.ts) and by RLS.
 */
export async function updateSession(request: NextRequest): Promise<SessionResult> {
  let response = NextResponse.next({ request });
  const config = getSupabaseConfig();
  if (!config) return { response, authenticated: false, expired: false };

  const supabase = createServerClient(config.url, config.anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
        Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });

  const hadAuthCookie = request.cookies.getAll().some((c) => /^sb-.*-auth-token/.test(c.name));
  const { data, error } = await supabase.auth.getClaims();
  const authenticated = !error && Boolean(data?.claims?.sub);
  return { response, authenticated, expired: hadAuthCookie && !authenticated };
}
