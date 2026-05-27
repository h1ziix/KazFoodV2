import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";
import { saveAs } from "file-saver";
import type {
  TensionClass,
  TensionIndicator,
  TensionProtocol,
  TensionWorkplace,
} from "@/types/tension";

const TEMPLATE_URL = "/templates/tension-protocol.docx";
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

export async function generateTensionDocx(
  data: TensionProtocol,
): Promise<void> {
  const buffer = await fetchTemplate();
  const blob = renderTensionBlob(buffer, data);
  const filename = `Напряженность_${data.protocol.number}.docx`;
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

/**
 * Чистый рендер шаблона в Blob. Вынесен отдельно, чтобы его можно было
 * вызывать как в браузере (через fetch), так и в Node-тесте напрямую.
 */
export function renderTensionBlob(
  templateBuffer: ArrayBuffer | Buffer,
  data: TensionProtocol,
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
  data: TensionProtocol,
): Record<string, unknown> {
  // docxtemplater 3.x не интерпретирует точку в тегах как path: тег
  // {protocol.number} ищет буквальный ключ "protocol.number". Поэтому корневые
  // объекты разворачиваем в плоские ключи через flatten(). Эти же ключи
  // нужны ВНУТРИ цикла {#workplaces} (parent-scope для тегов с точкой
  // docxtemplater тоже не использует), поэтому копируем их в каждый элемент.
  const rootFlat = flatten({
    protocol: data.protocol,
    customer: data.customer,
    measurementDate: data.measurementDate,
    performer: data.performer,
    representative: data.representative,
  });
  return {
    ...rootFlat,
    workplaces: data.workplaces.map((w) => ({
      ...rootFlat,
      ...mapWorkplace(w),
    })),
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

function mapWorkplace(w: TensionWorkplace): Record<string, unknown> {
  return {
    rowNumber: w.rowNumber,
    code: w.code,
    position: w.position,
    measurementPlace: w.measurementPlace,
    workDescription: w.workDescription,
    finalAssessment: w.finalAssessment,

    ...expandIndicator("p1_1", w.p1_1_content),
    ...expandIndicator("p1_2", w.p1_2_signals),
    ...expandIndicator("p1_3", w.p1_3_distribution),
    ...expandIndicator("p1_4", w.p1_4_character),

    ...expandIndicator("p2_1", w.p2_1_duration),
    ...expandIndicator("p2_2", w.p2_2_density),
    ...expandIndicator("p2_3", w.p2_3_objects),
    ...expandIndicator("p2_4", w.p2_4_sizeLong),
    ...expandIndicator("p2_5", w.p2_5_optical),
    ...expandIndicator("p2_6", w.p2_6_videoTerminal),
    ...expandIndicator("p2_7", w.p2_7_voiceLoad),
    ...expandIndicator("p2_8", w.p2_8_speakLoad),

    ...expandIndicator("p3_1", w.p3_1_responsibility),
    ...expandIndicator("p3_2", w.p3_2_risk),
    ...expandIndicator("p3_3", w.p3_3_othersRisk),

    ...expandIndicator("p4_1", w.p4_1_elements),
    ...expandIndicator("p4_2", w.p4_2_duration),
    ...expandIndicator("p4_3", w.p4_3_active),
    ...expandIndicator("p4_4", w.p4_4_passive),

    ...expandIndicator("p5_1", w.p5_1_duration),
    ...expandIndicator("p5_2", w.p5_2_shift),
    ...expandIndicator("p5_3", w.p5_3_breaks),
  };
}

/**
 * Разворачивает один показатель в набор плейсхолдеров:
 *   {prefix}_value  – фактическое значение
 *   {prefix}_c1     – "+" если класс 1, иначе ""
 *   {prefix}_c2     – "+" если класс 2
 *   {prefix}_c31    – "+" если класс 3.1
 *   {prefix}_c32    – "+" если класс 3.2
 */
function expandIndicator(
  prefix: string,
  indicator: TensionIndicator,
): Record<string, string> {
  return {
    [`${prefix}_value`]: indicator.value,
    [`${prefix}_c1`]: classMark(indicator.class, "1"),
    [`${prefix}_c2`]: classMark(indicator.class, "2"),
    [`${prefix}_c31`]: classMark(indicator.class, "3.1"),
    [`${prefix}_c32`]: classMark(indicator.class, "3.2"),
  };
}

function classMark(actual: TensionClass, expected: TensionClass): string {
  return actual === expected ? "+" : "";
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
