"use client";

import { useMemo, useState } from "react";
import { JsonInput } from "@/components/JsonInput";
import { ValidationErrors } from "@/components/ValidationErrors";
import {
  formatZodIssues,
  type ValidationIssue,
} from "@/lib/lightingSchema";
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
  const [json, setJson] = useState<string>("");
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [fatalErrors, setFatalErrors] = useState<string[]>([]);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  // Single lookup replaces the previous 3 switch/ternary chains
  // (example selection, schema selection, generator selection).
  const descriptor = useMemo(() => findDescriptor(docType), [docType]);

  function resetMessages() {
    setIssues([]);
    setFatalErrors([]);
    setStatus({ kind: "idle" });
  }

  function selectDocType(next: string) {
    setDocType(next);
    setJson("");
    resetMessages();
  }

  function loadExample() {
    if (!descriptor) return;
    setJson(JSON.stringify(descriptor.example, null, 2));
    resetMessages();
  }

  function validate(): unknown | null {
    resetMessages();
    if (!descriptor) return null;
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch (err) {
      setFatalErrors([
        `Невалидный JSON: ${err instanceof Error ? err.message : String(err)}`,
      ]);
      return null;
    }
    const result = descriptor.schema.safeParse(parsed);
    if (!result.success) {
      setIssues(formatZodIssues(result.error));
      return null;
    }
    return result.data;
  }

  function handleValidate() {
    const data = validate();
    if (data) {
      setStatus({ kind: "valid", message: "JSON корректен" });
    }
  }

  async function handleGenerate() {
    const data = validate();
    if (!data || !descriptor) return;
    setStatus({ kind: "generating" });
    try {
      await renderDescriptor(descriptor, data);
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
    <main className="mx-auto flex max-w-4xl flex-col gap-4 p-6">
      <header>
        <h1 className="text-2xl font-semibold">
          Аттестация рабочих мест — {currentLabel}
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Вставьте JSON, валидируйте и сгенерируйте DOCX-протокол измерений.
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        {DOCUMENT_REGISTRY.map((d) => {
          const active = docType === d.key;
          return (
            <button
              key={d.key}
              type="button"
              onClick={() => selectDocType(d.key)}
              className={
                active
                  ? "rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white"
                  : "rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100"
              }
            >
              {d.label}
            </button>
          );
        })}
      </div>

      <JsonInput value={json} onChange={setJson} />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={loadExample}
          className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100"
        >
          Загрузить пример
        </button>
        <button
          type="button"
          onClick={handleValidate}
          className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100"
        >
          Проверить JSON
        </button>
        <button
          type="button"
          onClick={handleGenerate}
          disabled={status.kind === "generating"}
          className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {status.kind === "generating" ? "Генерация..." : "Сгенерировать DOCX"}
        </button>
      </div>

      {status.kind === "valid" && (
        <div className="rounded border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800">
          {status.message}
        </div>
      )}
      {status.kind === "generated" && (
        <div className="rounded border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800">
          {status.message}
        </div>
      )}

      <ValidationErrors title="Ошибки валидации" issues={issues} />
      <ValidationErrors title="Ошибка" issues={fatalErrors} />
    </main>
  );
}
