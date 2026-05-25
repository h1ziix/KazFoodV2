import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";
import { saveAs } from "file-saver";
import type { LightingProtocol } from "@/types/lighting";

const TEMPLATE_URL = "/templates/lighting-protocol.docx";
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

type Scope = Record<string, unknown> | null | undefined;

interface ParserContext {
  scopeList?: Scope[];
}

function dotParser(tag: string) {
  return {
    get(scope: Scope, context?: ParserContext) {
      if (tag === ".") return scope;
      const parts = tag.split(".");
      const first = parts[0];
      let cur: unknown;
      const list = context?.scopeList;
      if (list && list.length > 0) {
        for (let i = list.length - 1; i >= 0; i--) {
          const s = list[i];
          if (s != null && Object.prototype.hasOwnProperty.call(s, first)) {
            cur = (s as Record<string, unknown>)[first];
            break;
          }
        }
      }
      if (cur === undefined && scope && Object.prototype.hasOwnProperty.call(scope, first)) {
        cur = (scope as Record<string, unknown>)[first];
      }
      for (let i = 1; i < parts.length; i++) {
        if (cur == null) return null;
        cur = (cur as Record<string, unknown>)[parts[i]];
      }
      return cur;
    },
  };
}

function buildTemplateData(data: LightingProtocol): Record<string, unknown> {
  const placesText = data.places
    .map((p) => `${p.number}. ${p.name}`)
    .join(", ");
  return { ...data, placesText };
}

export async function generateLightingDocx(data: LightingProtocol): Promise<void> {
  const response = await fetch(TEMPLATE_URL);
  if (!response.ok) {
    throw new Error(
      `Не удалось загрузить шаблон ${TEMPLATE_URL}: ${response.status} ${response.statusText}`,
    );
  }
  const buffer = await response.arrayBuffer();

  const zip = new PizZip(buffer);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    parser: dotParser,
  });

  try {
    doc.render(buildTemplateData(data));
  } catch (err) {
    const details = extractTemplateErrorDetails(err);
    throw new TemplateRenderError(
      "Ошибка при рендеринге шаблона DOCX",
      details,
    );
  }

  const blob = doc.getZip().generate({
    type: "blob",
    mimeType: MIME_DOCX,
  });

  const filename = `Освещенность_${data.protocol.number}.docx`;
  saveAs(blob, filename);
}

function extractTemplateErrorDetails(err: unknown): string[] {
  if (!err || typeof err !== "object") {
    return [String(err)];
  }
  const anyErr = err as {
    message?: string;
    properties?: { errors?: Array<{ message?: string; properties?: { explanation?: string } }> };
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
