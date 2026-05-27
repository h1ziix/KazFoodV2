"use client";

import { useEffect, useMemo, useState } from "react";
import type { ZodTypeAny } from "zod";
import { FormRenderer } from "@/components/forms/FormRenderer";
import { ValidationErrors } from "@/components/ValidationErrors";
import { buildFormDescriptor } from "@/lib/forms/buildFormDescriptor";
// Side-effect import: installs the Russian zod error map globally so
// every safeParse() in the app produces localized issue messages. Must
// be imported before any schema validation runs.
import "@/lib/forms/labels";
import { formatZodIssues } from "@/lib/docs/zod-helpers";
import { TemplateRenderError } from "@/lib/docs/engine";
import {
  DOCUMENT_REGISTRY,
  findDescriptor,
  renderDescriptor,
} from "@/lib/docs/registry";

type Status =
  | { kind: "idle" }
  | { kind: "valid"; message: string }
  | { kind: "generating" }
  | { kind: "generated"; message: string };

export default function Page() {
  const [docType, setDocType] = useState<string>(DOCUMENT_REGISTRY[0].key);
  const [value, setValue] = useState<unknown>(null);
  const [touched, setTouched] = useState<boolean>(false);
  const [fatalErrors, setFatalErrors] = useState<string[]>([]);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  // Single lookup — preserves the registry-driven architecture.
  const descriptor = useMemo(() => findDescriptor(docType), [docType]);

  // Form metadata is derived once per schema; recomputing on every
  // render would re-create option arrays and trigger needless DOM diffs.
  const formField = useMemo(
    () =>
      descriptor
        ? buildFormDescriptor(descriptor.schema as unknown as ZodTypeAny)
        : null,
    [descriptor],
  );

  // Seed the form with the example payload whenever the doc type
  // changes. The example is always schema-valid by construction, so the
  // user starts from a clean state and tweaks from there.
  useEffect(() => {
    if (!descriptor) return;
    setValue(structuredClone(descriptor.example));
    setTouched(false);
    setFatalErrors([]);
    setStatus({ kind: "idle" });
  }, [descriptor]);

  // Real-time validation: runs on every keystroke so error badges,
  // inline messages, and the disabled-state of the generate button
  // stay in sync with the form value.
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
      // First message per path wins — matches inline UX expectations.
      if (!errorMap[i.path]) errorMap[i.path] = i.message;
    }
    return { ok: false, errorMap, count: issues.length };
  }, [descriptor, value]);

  function selectDocType(next: string) {
    setDocType(next);
  }

  function handleChange(next: unknown) {
    setValue(next);
    setTouched(true);
    setStatus({ kind: "idle" });
  }

  function handleLoadExample() {
    if (!descriptor) return;
    setValue(structuredClone(descriptor.example));
    setTouched(false);
    setFatalErrors([]);
    setStatus({ kind: "idle" });
  }

  async function handleGenerate() {
    if (!descriptor || !validation.ok) return;
    setStatus({ kind: "generating" });
    setFatalErrors([]);
    try {
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
    <main className="mx-auto flex max-w-6xl flex-col gap-5 p-6 pb-28">
      <header className="border-b border-slate-200 pb-4">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-sky-700">
          Лаборатория · Аттестация рабочих мест
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">
          {currentLabel || "Документ"}
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Заполните разделы формы и сгенерируйте DOCX-протокол измерений.
          Все поля проверяются автоматически в реальном времени.
        </p>
      </header>

      <section aria-label="Тип документа" className="flex flex-col gap-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          Тип документа
        </h2>
        <nav className="flex flex-wrap gap-1.5">
          {DOCUMENT_REGISTRY.map((d) => {
            const active = docType === d.key;
            return (
              <button
                key={d.key}
                type="button"
                onClick={() => selectDocType(d.key)}
                className={
                  active
                    ? "rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white shadow-sm"
                    : "rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:border-slate-400 hover:bg-slate-50"
                }
              >
                {d.label}
              </button>
            );
          })}
        </nav>
      </section>

      <section className="flex items-center justify-between gap-3 rounded-md border border-sky-100 bg-sky-50/60 px-3 py-2">
        <p className="text-xs text-sky-900">
          Форма автоматически заполнена примером — отредактируйте значения
          под ваш протокол или сбросьте к исходному примеру.
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
          onChange={handleChange}
        />
      )}

      {status.kind === "generated" && (
        <div className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800">
          {status.message}
        </div>
      )}
      {status.kind === "valid" && (
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
          {status.kind === "generating"
            ? "Генерация..."
            : "Сгенерировать DOCX"}
        </button>
      </div>
    </main>
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
