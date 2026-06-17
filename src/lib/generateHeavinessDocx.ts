import type {
  HeavinessIndicator,
  HeavinessProtocol,
  HeavinessWorkplace,
} from "@/types/heaviness";
import {
  renderBlob,
  renderDocument,
  TemplateRenderError,
} from "./docs/engine";
import { flatten } from "./docs/flatten";
import { expandIndicator } from "./docs/indicators";
import { restartListNumberingPerLoop } from "./docs/numberingRestart";
import { formatProtocolNumber } from "./docs/protocolNumber";

const TEMPLATE_URL = "/templates/heaviness-protocol.docx";

export { TemplateRenderError };

export async function generateHeavinessDocx(
  data: HeavinessProtocol,
): Promise<void> {
  await renderDocument({
    templateUrl: TEMPLATE_URL,
    data,
    buildContext: buildTemplateContext,
    filename: (d) => `Тяжесть_${d.protocol.number}.docx`,
    postProcess: restartListNumberingPerLoop,
  });
}

/**
 * Чистый рендер шаблона в Blob. Вынесен отдельно, чтобы можно было
 * вызывать как в браузере (через fetch), так и в Node-тесте напрямую.
 */
export function renderHeavinessBlob(
  templateBuffer: ArrayBuffer | Buffer,
  data: HeavinessProtocol,
): Blob {
  return renderBlob(
    templateBuffer,
    buildTemplateContext(data),
    restartListNumberingPerLoop,
  );
}

export function buildTemplateContext(
  data: HeavinessProtocol,
): Record<string, unknown> {
  // docxtemplater 3.x по умолчанию НЕ интерпретирует точку в тегах как path:
  // тег {protocol.number} ищет буквальный ключ "protocol.number". Поэтому
  // корневые объекты разворачиваем в плоские ключи через flatten().
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
    // Номер протокола «ПРОТОКОЛ № …» нумеруется по порядку, своя
    // последовательность на документ: позиция места в массиве → 001, 002, …
    // (см. formatProtocolNumber, как в напряжённости). Перекрывает ручной
    // protocol.number из rootFlat — тот теперь влияет только на имя файла.
    workplaces: data.workplaces.map((w, idx) => ({
      ...rootFlat,
      ...mapWorkplace(w),
      "protocol.number": formatProtocolNumber(idx + 1),
    })),
  };
}

function mapWorkplace(w: HeavinessWorkplace): Record<string, unknown> {
  const ind = (prefix: string, i: HeavinessIndicator) =>
    expandIndicator(prefix, i);
  return {
    rowNumber: w.rowNumber,
    code: w.code,
    position: w.position,
    measurementPlace: w.measurementPlace,
    workDescription: w.workDescription,
    finalAssessment: w.finalAssessment,
    ...ind("p1_1", w.p1_1_regional),
    ...ind("p1_2a", w.p1_2_general_1to5),
    ...ind("p1_2b", w.p1_2_general_over5),
    ...ind("p2_1", w.p2_1_alternating),
    ...ind("p2_2", w.p2_2_constant),
    ...ind("p2_3a", w.p2_3_fromSurface),
    ...ind("p2_3b", w.p2_3_fromFloor),
    ...ind("p3_1", w.p3_1_local),
    ...ind("p3_2", w.p3_2_regional),
    ...ind("p4_1", w.p4_1_oneHand),
    ...ind("p4_2", w.p4_2_twoHands),
    ...ind("p4_3", w.p4_3_bodyAndLegs),
    ...ind("p5", w.p5_pose),
    ...ind("p6", w.p6_bends),
    ...ind("p7_1", w.p7_1_horizontal),
    ...ind("p7_2", w.p7_2_vertical),
  };
}
