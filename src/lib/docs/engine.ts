import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";
import { saveAs } from "file-saver";

/**
 * Shared abstraction layer for DOCX generators.
 *
 * Single source of truth for:
 *   - MIME_DOCX constant
 *   - TemplateRenderError class
 *   - extractTemplateErrorDetails(err)
 *   - renderBlob(template, context)         — pure render, usable in Node tests
 *   - renderDocument(opts)                  — fetch + render + saveAs (browser)
 *
 * Existing generate<Name>Docx.ts functions are kept as thin wrappers around
 * renderDocument() so their public API stays intact.
 */

export const MIME_DOCX =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export class TemplateRenderError extends Error {
  public readonly details: string[];
  constructor(message: string, details: string[]) {
    super(message);
    this.name = "TemplateRenderError";
    this.details = details;
  }
}

export function extractTemplateErrorDetails(err: unknown): string[] {
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

/**
 * Pure render of a DOCX template into a Blob. No fetch, no save.
 * Suitable for both browser (ArrayBuffer) and Node (Buffer) callers.
 */
export function renderBlob(
  templateBuffer: ArrayBuffer | Buffer,
  context: Record<string, unknown>,
): Blob {
  const zip = new PizZip(templateBuffer as ArrayBuffer);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
  });

  try {
    doc.render(context);
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

async function fetchTemplate(templateUrl: string): Promise<ArrayBuffer> {
  const response = await fetch(templateUrl);
  if (!response.ok) {
    throw new Error(
      `Не удалось загрузить шаблон ${templateUrl}: ${response.status} ${response.statusText}`,
    );
  }
  return response.arrayBuffer();
}

export interface RenderDocumentOptions<T> {
  templateUrl: string;
  data: T;
  buildContext: (data: T) => Record<string, unknown>;
  filename: (data: T) => string;
}

/**
 * Browser-side: fetch template, render with buildContext(data), saveAs filename(data).
 */
export async function renderDocument<T>(
  opts: RenderDocumentOptions<T>,
): Promise<void> {
  const buffer = await fetchTemplate(opts.templateUrl);
  const blob = renderBlob(buffer, opts.buildContext(opts.data));
  saveAs(blob, opts.filename(opts.data));
}
