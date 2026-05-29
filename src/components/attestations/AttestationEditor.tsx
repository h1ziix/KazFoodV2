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
}: AttestationEditorProps) {
  const [docType, setDocType] = useState<string>(DOCUMENT_REGISTRY[0].key);
  const [touched, setTouched] = useState(false);
  const [fatalErrors, setFatalErrors] = useState<string[]>([]);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const descriptor = useMemo(() => findDescriptor(docType), [docType]);

  const formField = useMemo(
    () =>
      descriptor
        ? buildFormDescriptor(descriptor.schema as unknown as ZodTypeAny)
        : null,
    [descriptor],
  );

  // The slot for the active document.  If the attestation has no entry
  // yet for this docType, we transparently seed it with the example so
  // the user starts from a valid baseline (identical to the old single-
  // doc UX in app/page.tsx).
  const value = (descriptor && documents[descriptor.key]) ?? null;

  // Seed missing slots once per tab switch.  We use a ref to skip the
  // effect if the slot is already populated, avoiding any chance of
  // overwriting user edits on re-render.
  const seededRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!descriptor) return;
    if (documents[descriptor.key] !== undefined) return;
    if (seededRef.current.has(descriptor.key)) return;
    seededRef.current.add(descriptor.key);
    onChange({
      ...documents,
      [descriptor.key]: structuredClone(descriptor.example) as Json,
    });
    setTouched(false);
    setFatalErrors([]);
    setStatus({ kind: "idle" });
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
    onChange({
      ...documents,
      [descriptor.key]: structuredClone(descriptor.example) as Json,
    });
    setTouched(false);
    setFatalErrors([]);
    setStatus({ kind: "idle" });
  }

  async function handleGenerate() {
    if (!descriptor || !validation.ok) return;
    setStatus({ kind: "generating" });
    setFatalErrors([]);
    try {
      // Exact same payload shape that pre-Supabase code passed in —
      // the generators don't know (or care) that storage moved.
      const parsed = descriptor.schema.parse(value);
      await renderDescriptor(descriptor, parsed);
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
                onClick={() => setDocType(d.key)}
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

/** Russian pluralisation for inline status copy. */
function plural(n: number, forms: [string, string, string]): string {
  const abs = Math.abs(n) % 100;
  const n1 = abs % 10;
  if (abs > 10 && abs < 20) return forms[2];
  if (n1 > 1 && n1 < 5) return forms[1];
  if (n1 === 1) return forms[0];
  return forms[2];
}
