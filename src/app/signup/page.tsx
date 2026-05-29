"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signUpAction } from "@/lib/auth/actions";

export default function SignupPage() {
  const [message, formAction, pending] = useActionState<
    string | undefined,
    FormData
  >(signUpAction, undefined);

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900">Регистрация</h1>
        <p className="mt-1 text-sm text-slate-600">
          Создайте аккаунт, чтобы сохранять аттестации.
        </p>
      </header>
      <form action={formAction} className="flex flex-col gap-3">
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
          <span className="font-medium text-slate-700">
            Пароль (минимум 6 символов)
          </span>
          <input
            required
            minLength={6}
            type="password"
            name="password"
            autoComplete="new-password"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        {message && (
          <p className="rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-700">
            {message}
          </p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="mt-1 rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {pending ? "Создание…" : "Создать аккаунт"}
        </button>
      </form>
      <p className="text-center text-sm text-slate-600">
        Уже есть аккаунт?{" "}
        <Link href="/login" className="text-sky-700 hover:underline">
          Войти
        </Link>
      </p>
    </main>
  );
}
