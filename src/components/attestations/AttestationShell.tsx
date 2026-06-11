"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  AttestationEditor,
  type DocumentsData,
} from "./AttestationEditor";
import { CommonDataForm } from "./CommonDataForm";
import {
  saveAttestationAction,
  type SaveAttestationPayload,
} from "@/lib/attestations/actions";
import type { CommonData } from "@/types/common";
import type { Json } from "@/types/database";

interface AttestationShellProps {
  id: string;
  initialTitle: string;
  initialCustomerName: string;
  initialCustomerAddress: string;
  initialDocuments: DocumentsData;
  initialUpdatedAt: string;
  initialCommonData: CommonData;
}

type SaveState =
  | { kind: "idle"; savedAt: string }
  | { kind: "dirty" }
  | { kind: "saving" }
  | { kind: "saved"; savedAt: string }
  | { kind: "error"; message: string };

const AUTOSAVE_DEBOUNCE_MS = 1500;
/** First retry delay after a failed save; doubles each attempt up to the cap. */
const RETRY_BASE_MS = 2000;
const RETRY_MAX_MS = 30000;
/** Re-check interval used to serialise a save requested while one is in flight. */
const SAVE_BUSY_RECHECK_MS = 500;

/**
 * Editor shell for a single attestation row.
 *
 * Owns:
 *   - the four mutable "header" fields (title, customer name/address);
 *   - the per-document state bundle (delegated to AttestationEditor);
 *   - the debounced autosave loop AND the manual "Сохранить" button.
 *
 * Autosave strategy: every local change flips state to "dirty", schedules
 * a 1.5s timer, and writes the **full snapshot** when the timer fires.
 * Sending the full snapshot (rather than a diff) means we never need to
 * merge JSON server-side and we never get into an "I deleted a field
 * but the server still has it" bug.
 *
 * The manual button short-circuits the timer for users who want to be
 * sure their work hit the database before closing the laptop.
 */
export function AttestationShell({
  id,
  initialTitle,
  initialCustomerName,
  initialCustomerAddress,
  initialDocuments,
  initialUpdatedAt,
  initialCommonData,
}: AttestationShellProps) {
  const router = useRouter();

  const [title, setTitle] = useState(initialTitle);
  const [customerName, setCustomerName] = useState(initialCustomerName);
  const [customerAddress, setCustomerAddress] = useState(initialCustomerAddress);
  const [documents, setDocuments] = useState<DocumentsData>(initialDocuments);
  const [commonData, setCommonData] = useState<CommonData>(initialCommonData);

  const [save, setSave] = useState<SaveState>({
    kind: "idle",
    savedAt: initialUpdatedAt,
  });

  // Latest snapshot ref — read by the timer so we always persist the
  // freshest values, not the ones captured at scheduling time.
  const snapshotRef = useRef<SaveAttestationPayload>({
    title,
    customer_name: customerName,
    customer_address: customerAddress,
    documents_data: documents,
    common_data: commonData as unknown as Json,
  });
  useEffect(() => {
    snapshotRef.current = {
      title,
      customer_name: customerName,
      customer_address: customerAddress,
      documents_data: documents,
      common_data: commonData as unknown as Json,
    };
  }, [title, customerName, customerAddress, documents, commonData]);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // True while a save request is in flight — used to serialise overlapping
  // saves (the debounce timer or a retry firing mid-save).
  const savingRef = useRef(false);
  // Consecutive failed-save count; drives the exponential retry backoff and
  // is reset on success or on a fresh user edit.
  const retryRef = useRef(0);

  const flush = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    // A save is already running: re-check shortly instead of starting a
    // second concurrent write. Once the in-flight save finishes, this retry
    // persists the LATEST snapshot (snapshotRef is always current).
    if (savingRef.current) {
      timerRef.current = setTimeout(() => void flush(), SAVE_BUSY_RECHECK_MS);
      return;
    }

    savingRef.current = true;
    setSave({ kind: "saving" });
    try {
      const { updated_at } = await saveAttestationAction(
        id,
        snapshotRef.current,
      );
      retryRef.current = 0;
      setSave({ kind: "saved", savedAt: updated_at });
      // Refresh the server tree so the listing page sees the fresh
      // title / updated_at next time the user navigates back.
      router.refresh();
    } catch (err) {
      setSave({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      });
      // Auto-retry with exponential backoff so a transient failure (lost
      // connection, server hiccup) self-heals without the user noticing or
      // having to re-save. A fresh edit resets the backoff (dirty effect).
      const attempt = (retryRef.current += 1);
      const delay = Math.min(
        RETRY_MAX_MS,
        RETRY_BASE_MS * 2 ** (attempt - 1),
      );
      timerRef.current = setTimeout(() => void flush(), delay);
    } finally {
      savingRef.current = false;
    }
  }, [id, router]);

  // Schedule (or reschedule) an autosave whenever the snapshot changes.
  // We compare against initial values on first run to avoid an
  // immediate save right after mount.
  const isFirstRunRef = useRef(true);
  useEffect(() => {
    if (isFirstRunRef.current) {
      isFirstRunRef.current = false;
      return;
    }
    // A fresh edit supersedes any pending retry and resets its backoff.
    retryRef.current = 0;
    setSave({ kind: "dirty" });
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      void flush();
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [title, customerName, customerAddress, documents, commonData, flush]);

  // Track "are there unsaved changes?" in a ref so the unload guards below
  // can read it without re-subscribing on every state change.
  const unsavedRef = useRef(false);
  useEffect(() => {
    unsavedRef.current =
      save.kind === "dirty" || save.kind === "saving" || save.kind === "error";
  }, [save]);

  // Guard against losing work on a full page unload (tab close, refresh,
  // hard navigation) while changes are still pending: the browser shows its
  // native "Leave site?" prompt.
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (unsavedRef.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  // On unmount (in-app navigation away from the editor) fire a best-effort
  // ONE-SHOT save of the latest snapshot if anything is still pending, so the
  // debounce window can't swallow the last edits. Deliberately bypasses flush:
  // no retry timers are scheduled on the torn-down component. The beforeunload
  // prompt above covers the hard-unload case a fetch can't survive.
  useEffect(() => {
    return () => {
      if (unsavedRef.current) {
        void saveAttestationAction(id, snapshotRef.current).catch(() => {});
      }
    };
  }, [id]);

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-5 p-6 pb-28">
      <nav className="flex items-center gap-3 text-sm">
        <Link
          href="/attestations"
          className="text-sky-700 hover:underline"
        >
          ← Мои аттестации
        </Link>
        <span className="text-slate-400">/</span>
        <span className="text-slate-700">{title || "Без названия"}</span>
        <span className="ml-auto flex items-center gap-2">
          <SaveBadge state={save} />
          <button
            type="button"
            onClick={() => void flush()}
            disabled={save.kind === "saving"}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Сохранить
          </button>
        </span>
      </nav>

      <header className="flex flex-col gap-3 border-b border-slate-200 pb-4">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Название аттестации
          </span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Например: Magnum филиал №1"
            className="rounded-md border border-slate-300 px-3 py-2 text-base font-medium"
          />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Заказчик
            </span>
            <input
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="ТОО «Magnum Cash & Carry»"
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Адрес объекта
            </span>
            <input
              value={customerAddress}
              onChange={(e) => setCustomerAddress(e.target.value)}
              placeholder="г. Алматы, ул. ..."
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
        </div>
      </header>

      <CommonDataForm commonData={commonData} onChange={setCommonData} />

      <AttestationEditor
        documents={documents}
        onChange={setDocuments}
        commonData={commonData}
      />
    </main>
  );
}

function SaveBadge({ state }: { state: SaveState }) {
  switch (state.kind) {
    case "idle":
      return (
        <span className="text-xs text-slate-500">
          Сохранено · {formatTime(state.savedAt)}
        </span>
      );
    case "dirty":
      return <span className="text-xs text-amber-700">Есть изменения…</span>;
    case "saving":
      return <span className="text-xs text-slate-500">Сохранение…</span>;
    case "saved":
      return (
        <span className="text-xs text-emerald-700">
          Сохранено · {formatTime(state.savedAt)}
        </span>
      );
    case "error":
      return (
        <span className="text-xs text-rose-700" title={state.message}>
          Не сохранено — повторная попытка…
        </span>
      );
  }
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("ru-RU", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}
