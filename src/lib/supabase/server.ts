import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/types/database";
import { getSupabaseEnv } from "./env";

/**
 * Per-request Supabase client for Server Components, Route Handlers,
 * and Server Actions.
 *
 * Reads the auth cookies that `middleware.ts` keeps in sync, so any RLS
 * policy keyed on `auth.uid()` resolves to the signed-in user.
 *
 * NOTE: `cookies()` in Next.js 15 is async — this helper therefore must
 * be awaited.  Setting cookies from a Server Component (vs a Route
 * Handler / Server Action) throws; we swallow that case because the
 * middleware already refreshes the session before the request reaches
 * this code.
 */
export async function getSupabaseServerClient() {
  const cookieStore = await cookies();
  const { url, anonKey } = getSupabaseEnv();

  return createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(toSet) {
        try {
          for (const { name, value, options } of toSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components are read-only for cookies — ignore.
          // Middleware will have already refreshed the session.
        }
      },
    },
  });
}
