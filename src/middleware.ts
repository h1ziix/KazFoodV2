import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/types/database";
import { getSupabaseEnv } from "@/lib/supabase/env";

/**
 * Per-request middleware that:
 *
 *   1. Refreshes the Supabase auth session cookie so that subsequent
 *      Server Components see an up-to-date `auth.uid()`.
 *   2. Redirects unauthenticated traffic away from app pages (anything
 *      that is not `/login`, `/signup`, `/auth/*`, or a Next.js
 *      internal route) to `/login`.
 *
 * The cookie-juggling dance below is the pattern recommended by
 * `@supabase/ssr`: we have to create a *new* NextResponse seeded with
 * the freshly-rewritten cookies, otherwise the Set-Cookie headers from
 * the auth refresh round-trip would be dropped.
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const { url, anonKey } = getSupabaseEnv();
  const supabase = createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(toSet) {
        for (const { name, value } of toSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of toSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // IMPORTANT: do not put any other supabase call between createServerClient
  // and getUser — the ssr docs warn this is the only safe ordering to
  // avoid stale session bugs.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const isPublic =
    pathname.startsWith("/login") ||
    pathname.startsWith("/signup") ||
    pathname.startsWith("/auth");

  if (!user && !isPublic) {
    const redirect = request.nextUrl.clone();
    redirect.pathname = "/login";
    redirect.searchParams.set("next", pathname);
    return NextResponse.redirect(redirect);
  }

  return response;
}

/**
 * Match every path EXCEPT Next.js internals, static assets and the
 * public docx templates folder.  Auth cookies still need refreshing on
 * navigation, but we don't want to thrash through every favicon /
 * image request.
 */
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|templates/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|docx)$).*)",
  ],
};
