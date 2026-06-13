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
 *
 * If `postProcess` is provided, it is invoked with the PizZip instance
 * AFTER docxtemplater rendering but BEFORE generating the output Blob.
 * It may mutate any file in the zip (e.g. rewrite numbering.xml or
 * document.xml) before serialization. Used by tension/heaviness
 * generators to restart list counters per workplace iteration.
 */
export function renderBlob(
  templateBuffer: ArrayBuffer | Buffer,
  context: Record<string, unknown>,
  postProcess?: (zip: PizZip) => void,
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

  if (postProcess) postProcess(doc.getZip() as PizZip);

  // Defensive guard: build-time __NUMID_<n>_SLOT_<k>__ sentinels must
  // never reach the saved .docx. They live in w:numId/@w:val, whose
  // XSD type is ST_DecimalNumber (integer) — Word silently refuses any
  // document where the attribute is non-numeric ("Word found
  // unreadable content"). If sentinels survive here it means a caller
  // forgot to wire postProcess=restartListNumberingPerLoop for a
  // template that was built with sentinels. Fail loudly instead of
  // producing a corrupt download.
  const finalDocXml = doc.getZip().file("word/document.xml")?.asText() ?? "";
  if (finalDocXml.indexOf("__NUMID_") !== -1) {
    throw new TemplateRenderError(
      "Внутренняя ошибка: в сгенерированном документе остались" +
        " незаменённые маркеры нумерации (__NUMID_…). Документ не" +
        " откроется в Word. Проверьте, что для данного шаблона" +
        " зарегистрирован postProcess=restartListNumberingPerLoop.",
      ["Sentinel __NUMID_ leaked into rendered document.xml"],
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
  postProcess?: (zip: PizZip) => void;
}

/**
 * Fetch + render a document to a Blob WITHOUT downloading it. Shared by the
 * single-document path (renderDocument) and the batch ZIP export.
 */
export async function produceDocument<T>(
  opts: RenderDocumentOptions<T>,
): Promise<{ blob: Blob; filename: string }> {
  const buffer = await fetchTemplate(opts.templateUrl);
  const blob = renderBlob(buffer, opts.buildContext(opts.data), opts.postProcess);
  return { blob, filename: opts.filename(opts.data) };
}

/**
 * Browser-side: fetch template, render with buildContext(data), saveAs filename(data).
 */
export async function renderDocument<T>(
  opts: RenderDocumentOptions<T>,
): Promise<void> {
  const { blob, filename } = await produceDocument(opts);
  saveAs(blob, filename);
}

/** Trigger a browser download of an already-produced blob. */
export function saveBlob(blob: Blob, filename: string): void {
  saveAs(blob, filename);
}

/**
 * Bundle several produced documents into a single .zip blob. Keeps the PizZip
 * dependency inside the engine (the one allowed boundary). Sanitises and
 * de-duplicates entry names so colliding filenames don't overwrite each other.
 */
export async function zipDocuments(
  entries: { filename: string; blob: Blob }[],
): Promise<Blob> {
  const zip = new PizZip();
  const used = new Set<string>();
  for (const entry of entries) {
    let name = entry.filename;
    if (used.has(name)) {
      const dot = name.lastIndexOf(".");
      const base = dot === -1 ? name : name.slice(0, dot);
      const ext = dot === -1 ? "" : name.slice(dot);
      let n = 2;
      while (used.has(`${base} (${n})${ext}`)) n += 1;
      name = `${base} (${n})${ext}`;
    }
    used.add(name);
    zip.file(name, await entry.blob.arrayBuffer());
  }
  return zip.generate({ type: "blob", mimeType: "application/zip" });
}
