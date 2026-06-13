/**
 * Batch DOCX export — generate every filled & valid document of an
 * attestation and download them as a single .zip.
 *
 * Mirrors the single-document path (applyCommonDefaults → schema validation →
 * produceDescriptor) so the bundled files are byte-for-byte what the per-tab
 * "Сгенерировать DOCX" button would produce. One bad document never aborts the
 * whole export: empty / invalid / render-failed documents are skipped and
 * reported, the rest are still zipped.
 */
import type { CommonData } from "@/types/common";
import type { Json } from "@/types/database";
import { DOCUMENT_REGISTRY, produceDescriptor } from "./registry";
import { applyCommonDefaults } from "./applyCommonData";
import { TemplateRenderError, saveBlob, zipDocuments } from "./engine";

export interface BatchExportResult {
  /** Labels of documents that made it into the zip. */
  generated: string[];
  /** Documents left out, with a short human reason. */
  skipped: { label: string; reason: string }[];
}

export async function generateAllDocx(
  documents: Record<string, Json>,
  commonData: CommonData | null | undefined,
  zipName = "Документы_аттестации.zip",
): Promise<BatchExportResult> {
  const generated: string[] = [];
  const skipped: { label: string; reason: string }[] = [];
  const entries: { filename: string; blob: Blob }[] = [];

  for (const desc of DOCUMENT_REGISTRY) {
    const raw = documents[desc.key];
    if (raw === undefined) {
      skipped.push({ label: desc.label, reason: "не заполнен" });
      continue;
    }

    // Same merge + validation the editor applies before a single generate.
    const merged = applyCommonDefaults(raw, commonData ?? null);
    const parsed = desc.schema.safeParse(merged);
    if (!parsed.success) {
      skipped.push({ label: desc.label, reason: "есть незаполненные поля" });
      continue;
    }

    try {
      const { blob, filename } = await produceDescriptor(
        desc,
        parsed.data,
        commonData,
      );
      entries.push({ filename, blob });
      generated.push(desc.label);
    } catch (err) {
      skipped.push({
        label: desc.label,
        reason:
          err instanceof TemplateRenderError
            ? "ошибка шаблона"
            : "ошибка генерации",
      });
    }
  }

  if (entries.length > 0) {
    const zip = await zipDocuments(entries);
    saveBlob(zip, zipName);
  }

  return { generated, skipped };
}
