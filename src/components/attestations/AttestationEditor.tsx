"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ZodTypeAny } from "zod";
import { FormRenderer } from "@/components/forms/FormRenderer";
import { ValidationErrors } from "@/components/ValidationErrors";
import { buildFormDescriptor } from "@/lib/forms/buildFormDescriptor";
// Side-effect import: installs the Russian zod error map globally so
// every safeParse() in the app produces localized issue messages.
import "@/lib/forms/labels";
import { formatZodIssues } from "@/lib/docs/zod-helpers";
import { TemplateRenderError } from "@/lib/docs/engine";
import {
  DOCUMENT_REGISTRY,
  findDescriptor,
  renderDescriptor,
} from "@/lib/docs/registry";
import { migrateDocumentData } from "@/lib/attestations/migrate";
import {
  applyCommonDefaults,
  applyCommonToSeed,
} from "@/lib/docs/applyCommonData";
import {
  extractCodingSections,
  syncProtocolFromCoding,
  computeSyncDiff,
  getOrphanedPlaces,
  removeOrphanedPlace,
  getOrphanedMeasurements,
  removeOrphanedMeasurement,
  CLASS_A_KEYS,
  SYNCABLE_KEYS,
  type SyncDiff,
  type OrphanedPlace,
  type OrphanedMeasurement,
} from "@/lib/docs/syncWorkplaces";
import type { CommonData } from "@/types/common";
import type { Json } from "@/types/database";

type Status =
  | { kind: "idle" }
  | { kind: "generating" }
  | { kind: "generated"; message: string };

/**
 * Per-document state for one attestation.  Keys mirror
 * `DocumentDescriptor.key` ("coding", "safety", …); values are the
 * raw form payload.  Storing `unknown` here keeps the editor agnostic
 * of any individual schema — it just round-trips opaque blobs that
 * each descriptor knows how to validate and render.
 */
export type DocumentsData = Record<string, Json>;

export interface AttestationEditorProps {
  /** Persisted bundle of all per-document form snapshots. */
  documents: DocumentsData;
  /**
   * Called on every keystroke with the **next** documents bundle.  The
   * parent owns the storage decision (Supabase autosave, undo stack,
   * etc.); we just bubble changes up.
   */
  onChange: (next: DocumentsData) => void;
  /**
   * Shared attestation-level data. Injected into every protocol's
   * template context for keys that are empty in the document-specific
   * form.  Document values always take priority over common values.
   */
  commonData?: CommonData | null;
}

/**
 * Reusable document-editing surface.
 *
 * This component used to live in `app/page.tsx` and owned its own
 * `value` state for a single document type.  It has been generalised so
 * that switching the active tab swaps to a **different slot** inside
 * the same `documents` object — instead of resetting state.  That is
 * how a single attestation can hold the coding + safety + siz + … forms
 * simultaneously, with all of them persisted together.
 *
 * The DOCX generation pipeline is intentionally untouched: when the
 * user clicks "Сгенерировать DOCX", we still `descriptor.schema.parse`
 * the same raw object we always have, and hand it to `renderDescriptor`.
 */
export function AttestationEditor({
  documents,
  onChange,
  commonData,
}: AttestationEditorProps) {
  const [docType, setDocType] = useState<string>(DOCUMENT_REGISTRY[0].key);
  const [touched, setTouched] = useState(false);
  const [fatalErrors, setFatalErrors] = useState<string[]>([]);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [syncPending, setSyncPending] = useState<SyncDiff | null>(null);

  const descriptor = useMemo(() => findDescriptor(docType), [docType]);

  const formField = useMemo(
    () =>
      descriptor
        ? buildFormDescriptor(descriptor.schema as unknown as ZodTypeAny, {
            skipKeys: descriptor.formSkipKeys,
          })
        : null,
    [descriptor],
  );

  // The slot for the active document.  If the attestation has no entry
  // yet for this docType, we transparently seed it with the example so
  // the user starts from a valid baseline (identical to the old single-
  // doc UX in app/page.tsx).
  //
  // `value` is a computed view: empty shared fields (customer.name, etc.)
  // are filled from `commonData` so validation passes and the form visually
  // shows inherited values.  The stored slot stays untouched; only the
  // display / validation path receives the merged result.
  const storedValue = (descriptor && documents[descriptor.key]) ?? null;
  const value = useMemo(
    () => applyCommonDefaults(storedValue, commonData ?? null),
    [storedValue, commonData],
  );

  // Coding sections derived from the coding slot.  Stays stable when other
  // slots change because shallow-spread preserves object references.
  const codingRaw = documents["coding"] ?? null;
  const codingSections = useMemo(
    () => extractCodingSections(codingRaw),
    [codingRaw],
  );

  // Orphaned places: Class A sections present in the protocol but absent
  // from coding.  Only shown when coding has sections (so we don't flag
  // everything before the user fills coding).
  const orphanedPlaces = useMemo<OrphanedPlace[]>(() => {
    if (!descriptor || !CLASS_A_KEYS.has(descriptor.key)) return [];
    if (codingSections.length === 0) return [];
    return getOrphanedPlaces(storedValue, codingSections);
  }, [descriptor, storedValue, codingSections]);

  // Row-level orphans: positions still inside a coding section but no longer
  // required (deleted from coding, or surplus after a reduced count).  Sync
  // keeps them (non-destructive); they are surfaced here for manual removal.
  const orphanedMeasurements = useMemo<OrphanedMeasurement[]>(() => {
    if (!descriptor || !CLASS_A_KEYS.has(descriptor.key)) return [];
    if (codingSections.length === 0) return [];
    return getOrphanedMeasurements(storedValue, codingSections);
  }, [descriptor, storedValue, codingSections]);

  // Seed missing slots once per tab switch.  We use a ref to skip the
  // effect if the slot is already populated, avoiding any chance of
  // overwriting user edits on re-render.
  //
  // When seeding, shared fields are overwritten with commonData values so
  // new document tabs immediately show the user's customer/performer data
  // instead of the generic example placeholders.  Syncable protocols also
  // receive coding-derived workplace structure if coding is already filled.
  const seededRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!descriptor) return;
    if (documents[descriptor.key] !== undefined) return;
    if (seededRef.current.has(descriptor.key)) return;
    seededRef.current.add(descriptor.key);
    const seed = applyCommonToSeed(
      structuredClone(descriptor.example),
      commonData ?? null,
    );
    const seeded =
      SYNCABLE_KEYS.has(descriptor.key) && codingSections.length > 0
        ? syncProtocolFromCoding(descriptor.key, seed, codingSections)
        : seed;
    onChange({
      ...documents,
      [descriptor.key]: seeded as Json,
    });
    setTouched(false);
    setFatalErrors([]);
    setStatus({ kind: "idle" });
  }, [descriptor, documents, onChange, commonData, codingSections]);

  // Migrate persisted blobs from old schema shapes to the current shape.
  // Runs once per document key; the autosave debounce then persists the
  // migrated form so the old shape is never written back to Supabase.
  const migratedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!descriptor) return;
    const current = documents[descriptor.key];
    if (current === undefined) return;
    if (migratedRef.current.has(descriptor.key)) return;
    migratedRef.current.add(descriptor.key);
    const migrated = migrateDocumentData(descriptor.key, current);
    if (migrated !== current) {
      onChange({ ...documents, [descriptor.key]: migrated as Json });
    }
  }, [descriptor, documents, onChange]);

  const validation = useMemo(() => {
    if (!descriptor || value == null) {
      return { ok: false, errorMap: {} as Record<string, string>, count: 0 };
    }
    const result = descriptor.schema.safeParse(value);
    if (result.success) {
      return { ok: true, errorMap: {} as Record<string, string>, count: 0 };
    }
    const issues = formatZodIssues(result.error);
    const errorMap: Record<string, string> = {};
    for (const i of issues) {
      if (!errorMap[i.path]) errorMap[i.path] = i.message;
    }
    return { ok: false, errorMap, count: issues.length };
  }, [descriptor, value]);

  function handleFieldChange(next: unknown) {
    if (!descriptor) return;
    onChange({ ...documents, [descriptor.key]: next as Json });
    setTouched(true);
    setStatus({ kind: "idle" });
  }

  function handleLoadExample() {
    if (!descriptor) return;
    const seed = applyCommonToSeed(
      structuredClone(descriptor.example),
      commonData ?? null,
    );
    onChange({
      ...documents,
      [descriptor.key]: seed as Json,
    });
    setTouched(false);
    setFatalErrors([]);
    setStatus({ kind: "idle" });
  }

  function handleSyncRequest() {
    if (!descriptor) return;
    const diff = computeSyncDiff(descriptor.key, storedValue, codingSections);
    setSyncPending(diff);
  }

  function handleSyncConfirm() {
    if (!descriptor || syncPending === null) return;
    const result = syncProtocolFromCoding(descriptor.key, storedValue, codingSections);
    onChange({ ...documents, [descriptor.key]: result as Json });
    setTouched(true);
    setStatus({ kind: "idle" });
    setSyncPending(null);
  }

  function handleSyncCancel() {
    setSyncPending(null);
  }

  function handleDeleteOrphanedPlace(placeName: string) {
    if (!descriptor) return;
    const result = removeOrphanedPlace(storedValue, placeName);
    if (result === storedValue) return;
    onChange({ ...documents, [descriptor.key]: result as Json });
    setTouched(true);
  }

  function handleDeleteOrphanedMeasurement(placeName: string, rowNumber: number) {
    if (!descriptor) return;
    const result = removeOrphanedMeasurement(storedValue, placeName, rowNumber);
    if (result === storedValue) return;
    onChange({ ...documents, [descriptor.key]: result as Json });
    setTouched(true);
  }

  async function handleGenerate() {
    if (!descriptor || !validation.ok) return;
    setStatus({ kind: "generating" });
    setFatalErrors([]);
    try {
      // Exact same payload shape that pre-Supabase code passed in —
      // the generators don't know (or care) that storage moved.
      const parsed = descriptor.schema.parse(value);
      await renderDescriptor(descriptor, parsed, commonData);
      setStatus({ kind: "generated", message: "DOCX сгенерирован" });
    } catch (err) {
      if (err instanceof TemplateRenderError) {
        setFatalErrors([err.message, ...err.details]);
      } else {
        setFatalErrors([err instanceof Error ? err.message : String(err)]);
      }
      setStatus({ kind: "idle" });
    }
  }

  const currentLabel = descriptor?.label ?? "";
  const isClassA = descriptor != null && CLASS_A_KEYS.has(descriptor.key);
  const showSync =
    descriptor != null &&
    descriptor.key !== "coding" &&
    SYNCABLE_KEYS.has(descriptor.key) &&
    codingSections.length > 0;

  return (
    <section className="flex flex-col gap-5">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-sky-700">
          Документ аттестации
        </p>
        <h2 className="mt-1 text-xl font-semibold text-slate-900">
          {currentLabel || "Документ"}
        </h2>
      </div>

      <section aria-label="Тип документа" className="flex flex-col gap-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          Тип документа
        </h3>
        <nav className="flex flex-wrap gap-1.5">
          {DOCUMENT_REGISTRY.map((d) => {
            const active = docType === d.key;
            const filled = documents[d.key] !== undefined;
            return (
              <button
                key={d.key}
                type="button"
                onClick={() => {
                  setDocType(d.key);
                  setSyncPending(null);
                }}
                className={
                  active
                    ? "rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white shadow-sm"
                    : "rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:border-slate-400 hover:bg-slate-50"
                }
              >
                {d.label}
                {filled && !active && (
                  <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 align-middle" />
                )}
              </button>
            );
          })}
        </nav>
      </section>

      <section className="flex items-center justify-between gap-3 rounded-md border border-sky-100 bg-sky-50/60 px-3 py-2">
        <p className="text-xs text-sky-900">
          Изменения сохраняются автоматически. Можно сбросить активный
          раздел к шаблону-примеру.
        </p>
        <button
          type="button"
          onClick={handleLoadExample}
          className="shrink-0 rounded-md border border-sky-300 bg-white px-3 py-1.5 text-xs font-medium text-sky-900 hover:bg-sky-100"
        >
          Загрузить пример заново
        </button>
      </section>

      {showSync && (
        <section className="rounded-lg border border-slate-200 bg-white px-4 py-3">
          {syncPending === null ? (
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-slate-500">
                Рабочие места можно синхронизировать из раздела «Кодировка».
              </p>
              <button
                type="button"
                onClick={handleSyncRequest}
                className="shrink-0 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Синхронизировать из кодировки
              </button>
            </div>
          ) : (
            <SyncConfirmPanel
              isClassA={isClassA}
              diff={syncPending}
              onConfirm={handleSyncConfirm}
              onCancel={handleSyncCancel}
            />
          )}
        </section>
      )}

      {orphanedPlaces.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="mb-2 text-xs font-semibold text-amber-800">
            Разделы не найдены в кодировке:
          </p>
          <ul className="flex flex-col gap-1.5">
            {orphanedPlaces.map((p) => (
              <li
                key={p.name}
                className="flex items-center justify-between gap-3 rounded-md border border-amber-200 bg-white px-3 py-2"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span className="text-amber-500" aria-hidden="true">
                    ⚠
                  </span>
                  <span className="truncate text-sm font-medium text-slate-800">
                    {p.name}
                  </span>
                  <span className="shrink-0 text-xs text-slate-500">
                    {p.measurementCount}{" "}
                    {plural(p.measurementCount, [
                      "измерение",
                      "измерения",
                      "измерений",
                    ])}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleDeleteOrphanedPlace(p.name)}
                  className="shrink-0 rounded-md border border-rose-200 bg-white px-2.5 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50"
                >
                  Удалить
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {orphanedMeasurements.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="mb-2 text-xs font-semibold text-amber-800">
            Строки не соответствуют кодировке:
          </p>
          <ul className="flex flex-col gap-1.5">
            {orphanedMeasurements.map((m) => (
              <li
                key={`${m.placeName}#${m.rowNumber}`}
                className="flex items-center justify-between gap-3 rounded-md border border-amber-200 bg-white px-3 py-2"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span className="text-amber-500" aria-hidden="true">
                    ⚠
                  </span>
                  <span className="truncate text-sm font-medium text-slate-800">
                    {m.position || "—"}
                  </span>
                  <span className="shrink-0 text-xs text-slate-500">
                    {m.placeName} · {m.pointNumber} ·{" "}
                    {m.reason === "removed"
                      ? "удалена из кодировки"
                      : "лишний повтор"}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    handleDeleteOrphanedMeasurement(m.placeName, m.rowNumber)
                  }
                  className="shrink-0 rounded-md border border-rose-200 bg-white px-2.5 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50"
                >
                  Удалить
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {formField && value != null && (
        <FormRenderer
          field={formField}
          value={value}
          errors={validation.errorMap}
          onChange={handleFieldChange}
        />
      )}

      {status.kind === "generated" && (
        <div className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800">
          {status.message}
        </div>
      )}

      <ValidationErrors title="Ошибка генерации" issues={fatalErrors} />

      <div className="sticky bottom-0 -mx-6 mt-2 flex items-center justify-between gap-3 border-t border-slate-200 bg-white/95 px-6 py-3 shadow-[0_-4px_12px_-8px_rgba(0,0,0,0.12)] backdrop-blur">
        <div className="flex items-center gap-2 text-sm">
          {validation.ok ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
              Готово к генерации
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-medium text-rose-800">
              <span className="h-1.5 w-1.5 rounded-full bg-rose-600" />
              {touched
                ? `${validation.count} ${plural(validation.count, ["ошибка валидации", "ошибки валидации", "ошибок валидации"])}`
                : `${validation.count} ${plural(validation.count, ["поле требует внимания", "поля требуют внимания", "полей требуют внимания"])}`}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={handleGenerate}
          disabled={!validation.ok || status.kind === "generating"}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {status.kind === "generating" ? "Генерация..." : "Сгенерировать DOCX"}
        </button>
      </div>
    </section>
  );
}

// ─── Sync confirmation panel ──────────────────────────────────────────────────

function SyncConfirmPanel({
  isClassA,
  diff,
  onConfirm,
  onCancel,
}: {
  isClassA: boolean;
  diff: SyncDiff;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const hasDeletions = diff.toDelete.length > 0;
  const itemWord = isClassA
    ? ([" раздел", " раздела", " разделов"] as [string, string, string])
    : ([" строка", " строки", " строк"] as [string, string, string]);

  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="text-sm font-medium text-slate-800">
          {isClassA
            ? "Синхронизировать разделы из кодировки?"
            : "Синхронизировать рабочие места из кодировки?"}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {diff.toAdd > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800">
              + {diff.toAdd}
              {plural(diff.toAdd, itemWord)} добавится
            </span>
          )}
          {diff.toUpdate > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-medium text-sky-800">
              {diff.toUpdate}
              {plural(diff.toUpdate, itemWord)} сохранится
            </span>
          )}
          {hasDeletions && (
            <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-medium text-rose-800">
              − {diff.toDelete.length}
              {plural(diff.toDelete.length, itemWord)} удалится
            </span>
          )}
        </div>
      </div>

      {isClassA && (
        <p className="text-xs text-slate-500">
          Существующие разделы и все измерения в них сохранятся. Разделы,
          отсутствующие в кодировке, будут отмечены предупреждением.
        </p>
      )}

      {!isClassA && !hasDeletions && (
        <p className="text-xs text-slate-500">
          Данные существующих строк сохранятся. Новые строки добавятся с пустыми
          полями. Если код рабочего места был изменён в кодировке, старая строка
          будет пересоздана.
        </p>
      )}

      {hasDeletions && (
        <div>
          <p className="mb-1.5 text-xs font-medium text-rose-700">
            Следующие строки будут удалены (отсутствуют в кодировке):
          </p>
          <ul className="max-h-36 overflow-y-auto rounded-md border border-rose-200 bg-rose-50 px-3 py-2">
            {diff.toDelete.map((item) => (
              <li key={item.code} className="py-0.5 text-xs text-rose-800">
                {item.code} — {item.name}
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-xs text-rose-600">
            Данные этих строк будут потеряны. Действие необратимо.
          </p>
        </div>
      )}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          Отмена
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className={`rounded-md px-3 py-1.5 text-xs font-medium text-white shadow-sm ${
            hasDeletions
              ? "bg-rose-600 hover:bg-rose-700"
              : "bg-slate-900 hover:bg-slate-800"
          }`}
        >
          Синхронизировать
        </button>
      </div>
    </div>
  );
}

// ─── Russian pluralisation ────────────────────────────────────────────────────

function plural(n: number, forms: [string, string, string]): string {
  const abs = Math.abs(n) % 100;
  const n1 = abs % 10;
  if (abs > 10 && abs < 20) return forms[2];
  if (n1 > 1 && n1 < 5) return forms[1];
  if (n1 === 1) return forms[0];
  return forms[2];
}
