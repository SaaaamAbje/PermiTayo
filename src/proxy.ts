import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured } from "@/lib/env";
import { updateSession } from "@/lib/supabase/proxy";

/**
 * Optimistic route protection (Next.js 16 "proxy", formerly middleware).
 * - Refreshes the Supabase session cookie on every matched request.
 * - Sends signed-out visitors away from /dashboard.
 * - Sends signed-in visitors away from the sign-in and registration pages.
 *
 * This is NOT the security boundary. Every dashboard page and server action
 * re-checks the session and role on the server, and the database enforces RLS.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isDashboard = pathname === "/dashboard" || pathname.startsWith("/dashboard/");
  const isGuestOnly = pathname === "/login" || pathname === "/register" || pathname === "/forgot-password";

  if (!isSupabaseConfigured()) {
    if (isDashboard) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.search = "?error=not-configured";
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  const { response, authenticated, expired } = await updateSession(request);

  if (isDashboard && !authenticated) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("next", pathname);
    if (expired) url.searchParams.set("reason", "expired");
    const redirect = NextResponse.redirect(url);
    // Keep any cookie clean-up performed during the session refresh.
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    return redirect;
  }

  if (isGuestOnly && authenticated) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    // Skip static assets and image optimisation files.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
