import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";
import { saveAs } from "file-saver";
import type {
  HeavinessClass,
  HeavinessIndicator,
  HeavinessProtocol,
  HeavinessWorkplace,
} from "@/types/heaviness";

const TEMPLATE_URL = "/templates/heaviness-protocol.docx";
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

export async function generateHeavinessDocx(
  data: HeavinessProtocol,
): Promise<void> {
  const buffer = await fetchTemplate();
  const blob = renderHeavinessBlob(buffer, data);
  const filename = `Тяжесть_${data.protocol.number}.docx`;
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
 * Чистый рендер шаблона в Blob. Вынесен отдельно, чтобы можно было
 * вызывать как в браузере (через fetch), так и в Node-тесте напрямую.
 */
export function renderHeavinessBlob(
  templateBuffer: ArrayBuffer | Buffer,
  data: HeavinessProtocol,
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
  data: HeavinessProtocol,
): Record<string, unknown> {
  // docxtemplater 3.x по умолчанию НЕ интерпретирует точку в тегах как path:
  // тег {protocol.number} ищет буквальный ключ "protocol.number". Поэтому
  // корневые объекты разворачиваем в плоские ключи через flatten() — так же,
  // как это сделано в generateLightingDocx.ts.
  //
  // Кроме того, эти плоские корневые ключи нужны ВНУТРИ цикла {#workplaces}
  // (parent-scope для тегов с точкой docxtemplater тоже не использует), поэтому
  // копируем их в каждый элемент массива.
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

function mapWorkplace(w: HeavinessWorkplace): Record<string, unknown> {
  return {
    rowNumber: w.rowNumber,
    code: w.code,
    position: w.position,
    measurementPlace: w.measurementPlace,
    workDescription: w.workDescription,
    finalAssessment: w.finalAssessment,
    ...expandIndicator("p1_1", w.p1_1_regional),
    ...expandIndicator("p1_2a", w.p1_2_general_1to5),
    ...expandIndicator("p1_2b", w.p1_2_general_over5),
    ...expandIndicator("p2_1", w.p2_1_alternating),
    ...expandIndicator("p2_2", w.p2_2_constant),
    ...expandIndicator("p2_3a", w.p2_3_fromSurface),
    ...expandIndicator("p2_3b", w.p2_3_fromFloor),
    ...expandIndicator("p3_1", w.p3_1_local),
    ...expandIndicator("p3_2", w.p3_2_regional),
    ...expandIndicator("p4_1", w.p4_1_oneHand),
    ...expandIndicator("p4_2", w.p4_2_twoHands),
    ...expandIndicator("p4_3", w.p4_3_bodyAndLegs),
    ...expandIndicator("p5", w.p5_pose),
    ...expandIndicator("p6", w.p6_bends),
    ...expandIndicator("p7_1", w.p7_1_horizontal),
    ...expandIndicator("p7_2", w.p7_2_vertical),
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
  indicator: HeavinessIndicator,
): Record<string, string> {
  return {
    [`${prefix}_value`]: indicator.value,
    [`${prefix}_c1`]: classMark(indicator.class, "1"),
    [`${prefix}_c2`]: classMark(indicator.class, "2"),
    [`${prefix}_c31`]: classMark(indicator.class, "3.1"),
    [`${prefix}_c32`]: classMark(indicator.class, "3.2"),
  };
}

function classMark(actual: HeavinessClass, expected: HeavinessClass): string {
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
