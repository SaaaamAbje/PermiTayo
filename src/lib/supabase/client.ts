import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseConfig } from "@/lib/env";

/**
 * Browser-side Supabase client (anon key only, subject to RLS).
 * Phase 2 performs all reads and writes on the server, so this is provided for
 * client components that may need it later (for example, realtime or Storage uploads).
 */
export function createClient() {
  const config = getSupabaseConfig();
  if (!config) {
    throw new Error("Supabase is not configured. See .env.example.");
  }
  return createBrowserClient(config.url, config.anonKey);
}
