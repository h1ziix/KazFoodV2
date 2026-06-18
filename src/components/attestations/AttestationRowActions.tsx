"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  deleteAttestationAction,
  duplicateAttestationAction,
} from "@/lib/attestations/actions";
import type { AttestationSummary } from "@/lib/attestations/repository";

/**
 * Client-side row actions for the attestations list.
 *
 * Lives in its own client component so the surrounding list page can
 * stay a Server Component (and thus do its own data fetch + RLS).
 * Each action wraps the Server Action in `useTransition` to keep the
 * UI responsive and let us disable buttons during the round-trip.
 *
 * The Server Actions throw on failure (network / RLS / DB). We catch
 * those and surface a short inline message instead of failing silently,
 * so a delete/duplicate that didn't work no longer looks like a no-op.
 */
export function AttestationRowActions({ row }: { row: AttestationSummary }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Таймер авто-сброса подтверждения удаления. Храним в ref, чтобы очистить
  // его при размонтировании (иначе setState на размонтированном компоненте,
  // например когда строка исчезает после удаления) и при самом удалении.
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearConfirmTimer() {
    if (confirmTimer.current !== null) {
      clearTimeout(confirmTimer.current);
      confirmTimer.current = null;
    }
  }

  // Clear a pending auto-cancel timer when the row unmounts.
  useEffect(() => {
    return () => {
      if (confirmTimer.current !== null) clearTimeout(confirmTimer.current);
    };
  }, []);

  function handleDelete() {
    setError(null);
    if (!confirming) {
      setConfirming(true);
      // Auto-cancel the confirm prompt after a few seconds so a stray
      // click doesn't sit there indefinitely.
      clearConfirmTimer();
      confirmTimer.current = setTimeout(() => {
        setConfirming(false);
        confirmTimer.current = null;
      }, 4000);
      return;
    }
    clearConfirmTimer();
    setConfirming(false);
    start(async () => {
      try {
        await deleteAttestationAction(row.id);
        router.refresh();
      } catch {
        setError("Не удалось удалить. Попробуйте ещё раз.");
      }
    });
  }

  function handleDuplicate() {
    setError(null);
    start(async () => {
      try {
        const newId = await duplicateAttestationAction(row.id);
        router.push(`/attestations/${newId}`);
      } catch {
        setError("Не удалось создать копию. Попробуйте ещё раз.");
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <Link
          href={`/attestations/${row.id}`}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          Открыть
        </Link>
        <button
          type="button"
          onClick={handleDuplicate}
          disabled={pending}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          Создать копию
        </button>
        <button
          type="button"
          onClick={handleDelete}
          disabled={pending}
          className={
            confirming
              ? "rounded-md border border-rose-400 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-800 hover:bg-rose-100 disabled:opacity-50"
              : "rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50"
          }
        >
          {confirming ? "Подтвердить удаление" : "Удалить"}
        </button>
      </div>
      {error ? (
        <p role="alert" className="text-xs text-rose-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
