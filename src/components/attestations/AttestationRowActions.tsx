"use client";

import { useState, useTransition } from "react";
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
 */
export function AttestationRowActions({ row }: { row: AttestationSummary }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);

  function handleDelete() {
    if (!confirming) {
      setConfirming(true);
      // Auto-cancel the confirm prompt after a few seconds so a stray
      // click doesn't sit there indefinitely.
      setTimeout(() => setConfirming(false), 4000);
      return;
    }
    start(async () => {
      await deleteAttestationAction(row.id);
      router.refresh();
    });
  }

  function handleDuplicate() {
    start(async () => {
      const newId = await duplicateAttestationAction(row.id);
      router.push(`/attestations/${newId}`);
    });
  }

  return (
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
  );
}
