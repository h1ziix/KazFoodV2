import type {
  TensionIndicator,
  TensionProtocol,
  TensionWorkplace,
} from "@/types/tension";
import {
  renderBlob,
  renderDocument,
  TemplateRenderError,
} from "./docs/engine";
import { flatten } from "./docs/flatten";
import { expandIndicator } from "./docs/indicators";

const TEMPLATE_URL = "/templates/tension-protocol.docx";

export { TemplateRenderError };

export async function generateTensionDocx(
  data: TensionProtocol,
): Promise<void> {
  await renderDocument({
    templateUrl: TEMPLATE_URL,
    data,
    buildContext: buildTemplateContext,
    filename: (d) => `Напряженность_${d.protocol.number}.docx`,
  });
}

/**
 * Чистый рендер шаблона в Blob. Вынесен отдельно, чтобы его можно было
 * вызывать как в браузере (через fetch), так и в Node-тесте напрямую.
 */
export function renderTensionBlob(
  templateBuffer: ArrayBuffer | Buffer,
  data: TensionProtocol,
): Blob {
  return renderBlob(templateBuffer, buildTemplateContext(data));
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

function mapWorkplace(w: TensionWorkplace): Record<string, unknown> {
  const ind = (prefix: string, i: TensionIndicator) =>
    expandIndicator(prefix, i);
  return {
    rowNumber: w.rowNumber,
    code: w.code,
    position: w.position,
    measurementPlace: w.measurementPlace,
    workDescription: w.workDescription,
    finalAssessment: w.finalAssessment,

    ...ind("p1_1", w.p1_1_content),
    ...ind("p1_2", w.p1_2_signals),
    ...ind("p1_3", w.p1_3_distribution),
    ...ind("p1_4", w.p1_4_character),

    ...ind("p2_1", w.p2_1_duration),
    ...ind("p2_2", w.p2_2_density),
    ...ind("p2_3", w.p2_3_objects),
    ...ind("p2_4", w.p2_4_sizeLong),
    ...ind("p2_5", w.p2_5_optical),
    ...ind("p2_6", w.p2_6_videoTerminal),
    ...ind("p2_7", w.p2_7_voiceLoad),
    ...ind("p2_8", w.p2_8_speakLoad),

    ...ind("p3_1", w.p3_1_responsibility),
    ...ind("p3_2", w.p3_2_risk),
    ...ind("p3_3", w.p3_3_othersRisk),

    ...ind("p4_1", w.p4_1_elements),
    ...ind("p4_2", w.p4_2_duration),
    ...ind("p4_3", w.p4_3_active),
    ...ind("p4_4", w.p4_4_passive),

    ...ind("p5_1", w.p5_1_duration),
    ...ind("p5_2", w.p5_2_shift),
    ...ind("p5_3", w.p5_3_breaks),
  };
}
