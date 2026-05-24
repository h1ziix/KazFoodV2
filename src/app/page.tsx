"use client";

import { useState } from "react";
import { JsonInput } from "@/components/JsonInput";
import { ValidationErrors } from "@/components/ValidationErrors";
import { lightingExample } from "@/lib/exampleData";
import {
  formatZodIssues,
  lightingProtocolSchema,
  type ValidationIssue,
} from "@/lib/lightingSchema";
import {
  generateLightingDocx,
  TemplateRenderError,
} from "@/lib/generateLightingDocx";

type Status =
  | { kind: "idle" }
  | { kind: "valid"; message: string }
  | { kind: "generating" }
  | { kind: "generated"; message: string };

export default function Page() {
  const [json, setJson] = useState<string>("");
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [fatalErrors, setFatalErrors] = useState<string[]>([]);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  function resetMessages() {
    setIssues([]);
    setFatalErrors([]);
    setStatus({ kind: "idle" });
  }

  function loadExample() {
    setJson(JSON.stringify(lightingExample, null, 2));
    resetMessages();
  }

  function validate(): unknown | null {
    resetMessages();
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch (err) {
      setFatalErrors([
        `Невалидный JSON: ${err instanceof Error ? err.message : String(err)}`,
      ]);
      return null;
    }
    const result = lightingProtocolSchema.safeParse(parsed);
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
    if (!data) return;
    setStatus({ kind: "generating" });
    try {
      await generateLightingDocx(data as Parameters<typeof generateLightingDocx>[0]);
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

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-4 p-6">
      <header>
        <h1 className="text-2xl font-semibold">
          Аттестация рабочих мест — Освещенность
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Вставьте JSON, валидируйте и сгенерируйте DOCX-протокол измерений.
        </p>
      </header>

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
