import type { z } from "zod";
import { renderDocument } from "./engine";

// Schemas (single-source-of-truth: per-document zod files)
import { lightingProtocolSchema } from "@/lib/lightingSchema";
import { empProtocolSchema } from "@/lib/empSchema";
import { noiseProtocolSchema } from "@/lib/noiseSchema";
import { heavinessProtocolSchema } from "@/lib/heavinessSchema";
import { tensionProtocolSchema } from "@/lib/tensionSchema";
import { safetyProtocolSchema } from "@/lib/safetySchema";
import { sizProtocolSchema } from "@/lib/sizSchema";
import { meteoProtocolSchema } from "@/lib/meteoSchema";
import { summaryProtocolSchema } from "@/lib/summarySchema";
import { conclusionProtocolSchema } from "@/lib/conclusionSchema";
import { codingProtocolSchema } from "@/lib/codingSchema";
import { coverDocumentSchema } from "@/lib/coverSchema";
import { introDocumentSchema } from "@/lib/introSchema";

// Example data (untouched)
import { lightingExample } from "@/lib/exampleData";
import { empExample } from "@/lib/empExampleData";
import { noiseExample } from "@/lib/noiseExampleData";
import { heavinessExample } from "@/lib/heavinessExampleData";
import { tensionExample } from "@/lib/tensionExampleData";
import { safetyExample } from "@/lib/safetyExampleData";
import { sizExample } from "@/lib/sizExampleData";
import { meteoExample } from "@/lib/meteoExampleData";
import { summaryExample } from "@/lib/summaryExampleData";
import { conclusionExample } from "@/lib/conclusionExampleData";
import { codingExample } from "@/lib/codingExampleData";
import { coverExample } from "@/lib/coverExampleData";
import { introExample } from "@/lib/introExampleData";

// Per-document context builders re-exported by the existing generate*Docx
// thin wrappers.  This keeps every wrapper file as the SSoT for its own
// docxtemplater context shape; the registry simply wires them together.
import { buildTemplateContext as lightingCtx } from "@/lib/generateLightingDocx";
import { buildTemplateContext as empCtx } from "@/lib/generateEmpDocx";
import { buildTemplateContext as noiseCtx } from "@/lib/generateNoiseDocx";
import { buildTemplateContext as heavinessCtx } from "@/lib/generateHeavinessDocx";
import { buildTemplateContext as tensionCtx } from "@/lib/generateTensionDocx";
import { buildTemplateContext as safetyCtx } from "@/lib/generateSafetyDocx";
import { buildTemplateContext as sizCtx } from "@/lib/generateSizDocx";
import { buildTemplateContext as meteoCtx } from "@/lib/generateMeteoDocx";
import { buildTemplateContext as summaryCtx } from "@/lib/generateSummaryProtocolDocx";
import { buildTemplateContext as conclusionCtx } from "@/lib/generateConclusionDocx";
import { buildTemplateContext as codingCtx } from "@/lib/generateCodingDocx";
import { buildTemplateContext as coverCtx } from "@/lib/generateCoverDocx";
import { buildTemplateContext as introCtx } from "@/lib/generateIntroDocx";

// Concrete protocol types — used to keep each descriptor internally
// type-safe even though the public registry array is heterogeneous.
import type { LightingProtocol } from "@/types/lighting";
import type { EmpProtocol } from "@/types/emp";
import type { NoiseProtocol } from "@/types/noise";
import type { HeavinessProtocol } from "@/types/heaviness";
import type { TensionProtocol } from "@/types/tension";
import type { SafetyProtocol } from "@/types/safety";
import type { SizProtocol } from "@/types/siz";
import type { MeteoProtocol } from "@/types/meteo";
import type { SummaryProtocol } from "@/types/summary";
import type { ConclusionProtocol } from "@/types/conclusion";
import type { CodingProtocol } from "@/types/coding";
import type { CoverDocument } from "@/types/cover";
import type { IntroDocument } from "@/types/intro";

/**
 * Declarative descriptor for a single DOCX document type.
 *
 * Adding a new protocol kind becomes a single registry entry: schema,
 * example data, template URL, filename rule, and a buildContext()
 * transformer.  The UI layer iterates DOCUMENT_REGISTRY rather than
 * hard-coding switch/if chains per docType.
 */
export interface DocumentDescriptor<TInput> {
  /** Stable key used in UI state, eg. "lighting", "emp", "summary". */
  key: string;
  /** Human-readable Russian label for the UI tab. */
  label: string;
  /** Public URL of the docxtemplater template. */
  templateUrl: string;
  /** zod schema that validates raw JSON into TInput. */
  schema: z.ZodType<TInput>;
  /** Example payload exposed via the "Загрузить пример" button. */
  example: TInput;
  /** Transformer producing the docxtemplater render context. */
  buildContext: (data: TInput) => Record<string, unknown>;
  /** Output filename derived from validated data. */
  filename: (data: TInput) => string;
}

/**
 * Convenience renderer that closes over a descriptor.  Equivalent to
 * the per-document generate<Name>Docx() functions: fetches the
 * template, renders, triggers a download via file-saver.
 */
export function renderDescriptor<T>(
  desc: DocumentDescriptor<T>,
  data: T,
): Promise<void> {
  return renderDocument({
    templateUrl: desc.templateUrl,
    data,
    buildContext: desc.buildContext,
    filename: desc.filename,
  });
}

/**
 * Helper: type-safe single-document descriptor constructor.  Returns
 * the entry typed as DocumentDescriptor<unknown> so it can sit in the
 * heterogeneous registry array, while keeping the input parameters
 * internally consistent (schema/example/buildContext all share T).
 */
function describe<T>(d: DocumentDescriptor<T>): DocumentDescriptor<unknown> {
  return d as unknown as DocumentDescriptor<unknown>;
}

/**
 * Single source of truth for the list of supported documents.  Order
 * here matches the UI tab order.
 */
export const DOCUMENT_REGISTRY: DocumentDescriptor<unknown>[] = [
  describe<CoverDocument>({
    key: "cover",
    label: "Обложка",
    templateUrl: "/templates/cover-protocol.docx",
    schema: coverDocumentSchema as unknown as z.ZodType<CoverDocument>,
    example: coverExample,
    buildContext: coverCtx,
    filename: (d) =>
      `Обложка_${d.customer.organization.replace(/[«»"\\/]+/g, "").trim()}.docx`,
  }),
  describe<IntroDocument>({
    key: "intro",
    label: "Введение",
    templateUrl: "/templates/intro-protocol.docx",
    schema: introDocumentSchema as unknown as z.ZodType<IntroDocument>,
    example: introExample,
    buildContext: introCtx,
    filename: (d) =>
      `Введение_${d.customer.name.replace(/[«»"\\/]+/g, "").trim()}.docx`,
  }),
  describe<LightingProtocol>({
    key: "lighting",
    label: "Освещенность",
    templateUrl: "/templates/lighting-protocol.docx",
    schema: lightingProtocolSchema as unknown as z.ZodType<LightingProtocol>,
    example: lightingExample,
    buildContext: lightingCtx,
    filename: (d) => `Освещенность_${d.protocol.number}.docx`,
  }),
  describe<EmpProtocol>({
    key: "emp",
    label: "ЭМП",
    templateUrl: "/templates/emp-protocol.docx",
    schema: empProtocolSchema as unknown as z.ZodType<EmpProtocol>,
    example: empExample,
    buildContext: empCtx,
    filename: (d) => `ЭМП_${d.protocol.number}.docx`,
  }),
  describe<NoiseProtocol>({
    key: "noise",
    label: "Шум",
    templateUrl: "/templates/noise-protocol.docx",
    schema: noiseProtocolSchema as unknown as z.ZodType<NoiseProtocol>,
    example: noiseExample,
    buildContext: noiseCtx,
    filename: (d) => `Шум_${d.protocol.number}.docx`,
  }),
  describe<HeavinessProtocol>({
    key: "heaviness",
    label: "Тяжесть",
    templateUrl: "/templates/heaviness-protocol.docx",
    schema: heavinessProtocolSchema as unknown as z.ZodType<HeavinessProtocol>,
    example: heavinessExample,
    buildContext: heavinessCtx,
    filename: (d) => `Тяжесть_${d.protocol.number}.docx`,
  }),
  describe<TensionProtocol>({
    key: "tension",
    label: "Напряженность",
    templateUrl: "/templates/tension-protocol.docx",
    schema: tensionProtocolSchema as unknown as z.ZodType<TensionProtocol>,
    example: tensionExample,
    buildContext: tensionCtx,
    filename: (d) => `Напряженность_${d.protocol.number}.docx`,
  }),
  describe<SafetyProtocol>({
    key: "safety",
    label: "Травмобезопасность",
    templateUrl: "/templates/safety-protocol.docx",
    schema: safetyProtocolSchema as unknown as z.ZodType<SafetyProtocol>,
    example: safetyExample,
    buildContext: safetyCtx,
    filename: (d) => `Травмобезопасность_${d.protocol.number}.docx`,
  }),
  describe<SizProtocol>({
    key: "siz",
    label: "СИЗ",
    templateUrl: "/templates/siz-protocol.docx",
    schema: sizProtocolSchema as unknown as z.ZodType<SizProtocol>,
    example: sizExample,
    buildContext: sizCtx,
    filename: (d) => `СИЗ_${d.protocol.number}.docx`,
  }),
  describe<MeteoProtocol>({
    key: "meteo",
    label: "Микроклимат",
    templateUrl: "/templates/meteo-protocol.docx",
    schema: meteoProtocolSchema as unknown as z.ZodType<MeteoProtocol>,
    example: meteoExample,
    buildContext: meteoCtx,
    filename: (d) => `Микроклимат_${d.protocol.number}.docx`,
  }),
  describe<SummaryProtocol>({
    key: "summary",
    label: "Сводный протокол",
    templateUrl: "/templates/summary-protocol.docx",
    schema: summaryProtocolSchema as unknown as z.ZodType<SummaryProtocol>,
    example: summaryExample,
    buildContext: summaryCtx,
    filename: (d) => `Сводный_протокол_${d.protocol.number}.docx`,
  }),
  describe<ConclusionProtocol>({
    key: "conclusion",
    label: "Заключение",
    templateUrl: "/templates/conclusion-protocol.docx",
    schema: conclusionProtocolSchema as unknown as z.ZodType<ConclusionProtocol>,
    example: conclusionExample,
    buildContext: conclusionCtx,
    filename: (d) => `Заключение_${d.measurementDate.year}.docx`,
  }),
  describe<CodingProtocol>({
    key: "coding",
    label: "Кодировка",
    templateUrl: "/templates/coding-protocol.docx",
    schema: codingProtocolSchema as unknown as z.ZodType<CodingProtocol>,
    example: codingExample,
    buildContext: codingCtx,
    filename: (d) =>
      `Кодировка_${d.approval.organization.replace(/[«»"\\/]+/g, "")}.docx`,
  }),
];

export function findDescriptor(
  key: string,
): DocumentDescriptor<unknown> | undefined {
  return DOCUMENT_REGISTRY.find((d) => d.key === key);
}
