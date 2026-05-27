import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";
import { saveAs } from "file-saver";
import type {
  SizProtocol,
  SizRow,
  SizSection,
} from "@/types/siz";

const TEMPLATE_URL = "/templates/siz-protocol.docx";
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

export async function generateSizDocx(data: SizProtocol): Promise<void> {
  const buffer = await fetchTemplate();
  const blob = renderSizBlob(buffer, data);
  const filename = `СИЗ_${data.protocol.number}.docx`;
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

export function renderSizBlob(
  templateBuffer: ArrayBuffer | Buffer,
  data: SizProtocol,
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
  data: SizProtocol,
): Record<string, unknown> {
  // docxtemplater 3.x не разворачивает теги с точкой как путь — раскладываем
  // в плоские ключи и пробрасываем в каждый элемент вложенных циклов.
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
  section: SizSection,
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

function mapRow(r: SizRow): Record<string, unknown> {
  return {
    code: r.code,
    position: r.position,
    count: r.count,
    normItems: r.normItems,
    issuedFact: r.issuedFact,
    certificate: r.certificate,
    assessment: r.assessment,
    note: r.note,
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
