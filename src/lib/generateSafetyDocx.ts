import type {
  SafetyProtocol,
  SafetyRow,
} from "@/types/safety";
import {
  renderBlob,
  renderDocument,
  TemplateRenderError,
} from "./docs/engine";
import { flatten } from "./docs/flatten";
import { flattenSectionsRows } from "./docs/rows";

const TEMPLATE_URL = "/templates/safety-protocol.docx";

export { TemplateRenderError };

export async function generateSafetyDocx(
  data: SafetyProtocol,
): Promise<void> {
  await renderDocument({
    templateUrl: TEMPLATE_URL,
    data,
    buildContext: buildTemplateContext,
    filename: (d) => `Травмобезопасность_${d.protocol.number}.docx`,
  });
}

export function renderSafetyBlob(
  templateBuffer: ArrayBuffer | Buffer,
  data: SafetyProtocol,
): Blob {
  return renderBlob(templateBuffer, buildTemplateContext(data));
}

export function buildTemplateContext(
  data: SafetyProtocol,
): Record<string, unknown> {
  // docxtemplater 3.x не разворачивает теги с точкой автоматически —
  // используем плоские ключи и пробрасываем их во вложенные циклы.
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
    sections: flattenSectionsRows(data.sections, mapRow, rootFlat),
  };
}

function mapRow(r: SafetyRow): Record<string, unknown> {
  return {
    code: r.code,
    position: r.position,
    count: r.count,
    equipment: r.equipment,
    documentation: r.documentation,
    result: r.result,
    nonComplianceReasons: r.nonComplianceReasons,
    finalNote: r.finalNote,
  };
}
