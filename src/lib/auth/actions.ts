"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Auth Server Actions.
 *
 * These run on the server and use the same cookie-bound Supabase
 * client as the rest of the app, so the middleware picks the refreshed
 * session up on the very next request.
 *
 * All three actions return a string on error (rendered inline next to
 * the form) and throw the standard Next.js redirect on success.
 */

export async function signInAction(
  _prev: string | undefined,
  formData: FormData,
): Promise<string | undefined> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/attestations");

  if (!email || !password) return "Введите email и пароль.";

  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return error.message;

  revalidatePath("/", "layout");
  redirect(next || "/attestations");
}

export async function signUpAction(
  _prev: string | undefined,
  formData: FormData,
): Promise<string | undefined> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || password.length < 6)
    return "Введите email и пароль (минимум 6 символов).";

  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) return error.message;

  // When the project's email confirmation setting is OFF, the user is
  // signed in immediately and we can redirect.  Otherwise we surface a
  // human message asking them to check their inbox.
  if (!data.session) {
    return "Подтвердите email — мы отправили письмо со ссылкой.";
  }
  revalidatePath("/", "layout");
  redirect("/attestations");
}

export async function signOutAction() {
  const supabase = await getSupabaseServerClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
