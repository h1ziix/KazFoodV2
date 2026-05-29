import Link from "next/link";
import { listAttestations } from "@/lib/attestations/repository";
import { createAttestationAction } from "@/lib/attestations/actions";
import { signOutAction } from "@/lib/auth/actions";
import { AttestationRowActions } from "@/components/attestations/AttestationRowActions";

/**
 * Listing of all the current user's attestation projects.
 *
 * Server Component: fetches via the per-request Supabase client so RLS
 * already constrains rows to the signed-in user.  The row-level
 * actions (open / duplicate / delete) are delegated to a small client
 * component because they need transitions and a confirm step.
 */
export default async function AttestationsPage() {
  const rows = await listAttestations();

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 p-6">
      <header className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-sky-700">
            Лаборатория · Аттестация рабочих мест
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">
            Мои аттестации
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Каждая аттестация содержит все документы проекта. Изменения
            сохраняются автоматически.
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <form action={createAttestationAction}>
            <button
              type="submit"
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800"
            >
              + Новая аттестация
            </button>
          </form>
          <form action={signOutAction}>
            <button
              type="submit"
              className="text-xs text-slate-500 hover:text-slate-700 hover:underline"
            >
              Выйти
            </button>
          </form>
        </div>
      </header>

      {rows.length === 0 ? (
        <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center">
          <p className="text-sm text-slate-600">
            У вас пока нет ни одной аттестации.
          </p>
          <form action={createAttestationAction} className="mt-3">
            <button
              type="submit"
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
            >
              Создать первую
            </button>
          </form>
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-slate-200 overflow-hidden rounded-md border border-slate-200 bg-white">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4"
            >
              <div className="min-w-0 flex-1">
                <Link
                  href={`/attestations/${row.id}`}
                  className="block truncate text-sm font-medium text-slate-900 hover:text-sky-700"
                >
                  {row.title || "Без названия"}
                </Link>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500">
                  {row.customer_name && <span>{row.customer_name}</span>}
                  {row.customer_address && <span>{row.customer_address}</span>}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-400">
                  <span>создано {formatDateTime(row.created_at)}</span>
                  <span>изменено {formatDateTime(row.updated_at)}</span>
                </div>
              </div>
              <AttestationRowActions row={row} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
