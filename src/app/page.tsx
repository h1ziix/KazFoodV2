"use client";

import { useState } from "react";
import { JsonInput } from "@/components/JsonInput";
import { ValidationErrors } from "@/components/ValidationErrors";
import { lightingExample } from "@/lib/exampleData";
import { empExample } from "@/lib/empExampleData";
import { noiseExample } from "@/lib/noiseExampleData";
import { heavinessExample } from "@/lib/heavinessExampleData";
import { tensionExample } from "@/lib/tensionExampleData";
import { safetyExample } from "@/lib/safetyExampleData";
import { sizExample } from "@/lib/sizExampleData";
import { meteoExample } from "@/lib/meteoExampleData";
import {
  formatZodIssues,
  lightingProtocolSchema,
  type ValidationIssue,
} from "@/lib/lightingSchema";
import { empProtocolSchema } from "@/lib/empSchema";
import { noiseProtocolSchema } from "@/lib/noiseSchema";
import { heavinessProtocolSchema } from "@/lib/heavinessSchema";
import { tensionProtocolSchema } from "@/lib/tensionSchema";
import { safetyProtocolSchema } from "@/lib/safetySchema";
import { sizProtocolSchema } from "@/lib/sizSchema";
import { meteoProtocolSchema } from "@/lib/meteoSchema";
import {
  generateLightingDocx,
  TemplateRenderError,
} from "@/lib/generateLightingDocx";
import { generateEmpDocx } from "@/lib/generateEmpDocx";
import { generateNoiseDocx } from "@/lib/generateNoiseDocx";
import { generateHeavinessDocx } from "@/lib/generateHeavinessDocx";
import { generateTensionDocx } from "@/lib/generateTensionDocx";
import { generateSafetyDocx } from "@/lib/generateSafetyDocx";
import { generateSizDocx } from "@/lib/generateSizDocx";
import { generateMeteoDocx } from "@/lib/generateMeteoDocx";

type Status =
  | { kind: "idle" }
  | { kind: "valid"; message: string }
  | { kind: "generating" }
  | { kind: "generated"; message: string };

type DocumentType =
  | "lighting"
  | "emp"
  | "noise"
  | "heaviness"
  | "tension"
  | "safety"
  | "siz"
  | "meteo";

const DOC_LABELS: Record<DocumentType, string> = {
  lighting: "Освещенность",
  emp: "ЭМП",
  noise: "Шум",
  heaviness: "Тяжесть",
  tension: "Напряженность",
  safety: "Травмобезопасность",
  siz: "СИЗ",
  meteo: "Микроклимат",
};

export default function Page() {
  const [docType, setDocType] = useState<DocumentType>("lighting");
  const [json, setJson] = useState<string>("");
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [fatalErrors, setFatalErrors] = useState<string[]>([]);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  function resetMessages() {
    setIssues([]);
    setFatalErrors([]);
    setStatus({ kind: "idle" });
  }

  function selectDocType(next: DocumentType) {
    setDocType(next);
    setJson("");
    resetMessages();
  }

  function loadExample() {
    const example =
      docType === "lighting"
        ? lightingExample
        : docType === "emp"
          ? empExample
          : docType === "noise"
            ? noiseExample
            : docType === "heaviness"
              ? heavinessExample
              : docType === "tension"
                ? tensionExample
                : docType === "safety"
                  ? safetyExample
                  : docType === "siz"
                    ? sizExample
                    : meteoExample;
    setJson(JSON.stringify(example, null, 2));
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
    const schema =
      docType === "lighting"
        ? lightingProtocolSchema
        : docType === "emp"
          ? empProtocolSchema
          : docType === "noise"
            ? noiseProtocolSchema
            : docType === "heaviness"
              ? heavinessProtocolSchema
              : docType === "tension"
                ? tensionProtocolSchema
                : docType === "safety"
                  ? safetyProtocolSchema
                  : docType === "siz"
                    ? sizProtocolSchema
                    : meteoProtocolSchema;
    const result = schema.safeParse(parsed);
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
      if (docType === "lighting") {
        await generateLightingDocx(
          data as Parameters<typeof generateLightingDocx>[0],
        );
      } else if (docType === "emp") {
        await generateEmpDocx(data as Parameters<typeof generateEmpDocx>[0]);
      } else if (docType === "noise") {
        await generateNoiseDocx(
          data as Parameters<typeof generateNoiseDocx>[0],
        );
      } else if (docType === "heaviness") {
        await generateHeavinessDocx(
          data as Parameters<typeof generateHeavinessDocx>[0],
        );
      } else if (docType === "tension") {
        await generateTensionDocx(
          data as Parameters<typeof generateTensionDocx>[0],
        );
      } else if (docType === "safety") {
        await generateSafetyDocx(
          data as Parameters<typeof generateSafetyDocx>[0],
        );
      } else if (docType === "siz") {
        await generateSizDocx(
          data as Parameters<typeof generateSizDocx>[0],
        );
      } else {
        await generateMeteoDocx(
          data as Parameters<typeof generateMeteoDocx>[0],
        );
      }
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
          Аттестация рабочих мест — {DOC_LABELS[docType]}
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Вставьте JSON, валидируйте и сгенерируйте DOCX-протокол измерений.
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        {(Object.keys(DOC_LABELS) as DocumentType[]).map((key) => {
          const active = docType === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => selectDocType(key)}
              className={
                active
                  ? "rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white"
                  : "rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100"
              }
            >
              {DOC_LABELS[key]}
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
