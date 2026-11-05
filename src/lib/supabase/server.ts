import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseConfig } from "@/lib/env";
import type { Database } from "@/lib/database.types";

/**
 * Server-side Supabase client bound to the current request's session cookies.
 * Runs as the signed-in user, so Row Level Security applies to every query.
 * Create a new client per request; never share one between requests.
 */
export async function createClient() {
  const config = getSupabaseConfig();
  if (!config) {
    throw new Error("Supabase is not configured. See .env.example.");
  }
  const cookieStore = await cookies();

  return createServerClient<Database>(config.url, config.anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Called from a Server Component, where cookies are read-only.
          // The proxy refreshes the session, so this is safe to ignore.
        }
      },
    },
  });
}
