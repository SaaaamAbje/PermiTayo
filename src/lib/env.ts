/**
 * Environment access for Supabase.
 *
 * Only public values are read here. The service-role key is intentionally not
 * available to the application: it is used solely by scripts/create-admin.mjs.
 */

export function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) return null;
  try {
    new URL(url);
  } catch {
    return null;
  }
  return { url, anonKey };
}

export function isSupabaseConfigured() {
  return getSupabaseConfig() !== null;
}

/** Public base URL of this app, without a trailing slash. */
export function getSiteUrl() {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim() || "http://localhost:3000";
  return raw.replace(/\/+$/, "");
}
