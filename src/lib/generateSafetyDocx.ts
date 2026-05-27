import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";
import { saveAs } from "file-saver";
import type {
  SafetyProtocol,
  SafetyRow,
  SafetySection,
} from "@/types/safety";

const TEMPLATE_URL = "/templates/safety-protocol.docx";
const MIME_DOCX =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export class TemplateRenderError extends Error {
  public readonly details: string[];
  constructor(message: string, details: string[]) {
    super(message);
    this.name = "TemplateRenderError";
    this.details = details;
  }
}

export async function generateSafetyDocx(
  data: SafetyProtocol,
): Promise<void> {
  const buffer = await fetchTemplate();
  const blob = renderSafetyBlob(buffer, data);
  const filename = `Травмобезопасность_${data.protocol.number}.docx`;
  saveAs(blob, filename);
}

async function fetchTemplate(): Promise<ArrayBuffer> {
  const response = await fetch(TEMPLATE_URL);
  if (!response.ok) {
    throw new Error(
      `Не удалось загрузить шаблон ${TEMPLATE_URL}: ${response.status} ${response.statusText}`,
    );
  }
  return response.arrayBuffer();
}

export function renderSafetyBlob(
  templateBuffer: ArrayBuffer | Buffer,
  data: SafetyProtocol,
): Blob {
  const zip = new PizZip(templateBuffer as ArrayBuffer);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
  });

  try {
    doc.render(buildTemplateContext(data));
  } catch (err) {
    const details = extractTemplateErrorDetails(err);
    throw new TemplateRenderError(
      "Ошибка при рендеринге шаблона DOCX",
      details,
    );
  }

  return doc.getZip().generate({
    type: "blob",
    mimeType: MIME_DOCX,
  });
}

export function buildTemplateContext(
  data: SafetyProtocol,
): Record<string, unknown> {
  // docxtemplater 3.x не разворачивает теги с точкой автоматически —
  // используем плоские ключи и пробрасываем их во вложенные циклы.
  const rootFlat = flatten({
    protocol: data.protocol,
    customer: data.customer,
    measurementDate: data.measurementDate,
    performer: data.performer,
    representative: data.representative,
  });
  rootFlat["measurementPlace"] = data.measurementPlace;

  return {
    ...rootFlat,
    sections: data.sections.map((s) => mapSection(s, rootFlat)),
  };
}

function mapSection(
  section: SafetySection,
  rootFlat: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...rootFlat,
    section_number: section.number,
    section_title: section.title,
    rows: section.rows.map((r) => ({
      ...rootFlat,
      section_number: section.number,
      section_title: section.title,
      ...mapRow(r),
    })),
  };
}

function mapRow(r: SafetyRow): Record<string, unknown> {
  return {
    code: r.code,
    position: r.position,
    count: r.count,
    equipment: r.equipment,
    documentation: r.documentation,
    result: r.result,
    nonComplianceReasons: r.nonComplianceReasons,
    finalNote: r.finalNote,
  };
}

function flatten(
  value: unknown,
  prefix = "",
  out: Record<string, unknown> = {},
): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    if (prefix) out[prefix] = value;
    return out;
  }
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const nextKey = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      flatten(v, nextKey, out);
    } else {
      out[nextKey] = v;
    }
  }
  return out;
}

function extractTemplateErrorDetails(err: unknown): string[] {
  if (!err || typeof err !== "object") {
    return [String(err)];
  }
  const anyErr = err as {
    message?: string;
    properties?: {
      errors?: Array<{
        message?: string;
        properties?: { explanation?: string };
      }>;
    };
  };
  const out: string[] = [];
  if (anyErr.message) out.push(anyErr.message);
  const inner = anyErr.properties?.errors ?? [];
  for (const e of inner) {
    if (e.properties?.explanation) out.push(e.properties.explanation);
    else if (e.message) out.push(e.message);
  }
  return out.length > 0 ? out : ["Неизвестная ошибка шаблонизатора"];
}
