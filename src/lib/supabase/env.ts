/**
 * Centralised env-var resolution for the Supabase URL + anon key.
 *
 * Surfaces a single, descriptive error if either variable is missing —
 * Next.js' default behaviour is to silently substitute `undefined`,
 * which then explodes deep inside `@supabase/ssr` with a confusing
 * stack.  Fail fast and tell the developer exactly what to add to
 * `.env.local`.
 */
export function getSupabaseEnv(): { url: string; anonKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "Supabase env vars missing. Add NEXT_PUBLIC_SUPABASE_URL and " +
        "NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local (see README.md).",
    );
  }
  return { url, anonKey };
}
