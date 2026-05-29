"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database";
import { getSupabaseEnv } from "./env";

/**
 * Singleton browser-side Supabase client.
 *
 * `createBrowserClient` from `@supabase/ssr` is the only API that
 * correctly bridges auth cookies between the browser and our Next.js
 * middleware — using the plain `createClient` from `@supabase/supabase-js`
 * would silently fall back to localStorage-only sessions, which the
 * server components and middleware cannot read.
 *
 * We memoise the instance so that hot reloads and React Strict Mode's
 * double-render don't spawn multiple WebSocket / auth listeners.
 */
let cached: ReturnType<typeof createBrowserClient<Database>> | null = null;

export function getSupabaseBrowserClient() {
  if (cached) return cached;
  const { url, anonKey } = getSupabaseEnv();
  cached = createBrowserClient<Database>(url, anonKey);
  return cached;
}
