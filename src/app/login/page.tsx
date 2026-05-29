"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useActionState } from "react";
import { signInAction } from "@/lib/auth/actions";

/**
 * Sign-in page.
 *
 * `useSearchParams` triggers Next.js' CSR bail-out warning at build
 * time unless its consumer is wrapped in a Suspense boundary — hence
 * the split into a thin server-friendly outer page and the actual
 * form below.
 */
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const params = useSearchParams();
  const next = params.get("next") ?? "/attestations";
  const [error, formAction, pending] = useActionState<
    string | undefined,
    FormData
  >(signInAction, undefined);

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900">Вход</h1>
        <p className="mt-1 text-sm text-slate-600">
          Войдите, чтобы открыть свои аттестации.
        </p>
      </header>
      <form action={formAction} className="flex flex-col gap-3">
        <input type="hidden" name="next" value={next} />
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">Email</span>
          <input
            required
            type="email"
            name="email"
            autoComplete="email"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">Пароль</span>
          <input
            required
            type="password"
            name="password"
            autoComplete="current-password"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        {error && (
          <p className="rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-800">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="mt-1 rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {pending ? "Вход…" : "Войти"}
        </button>
      </form>
      <p className="text-center text-sm text-slate-600">
        Нет аккаунта?{" "}
        <Link href="/signup" className="text-sky-700 hover:underline">
          Зарегистрироваться
        </Link>
      </p>
    </main>
  );
}
