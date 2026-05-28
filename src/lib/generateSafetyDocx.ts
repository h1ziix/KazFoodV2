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
  const rootFlat = flatten({
    protocol: data.protocol,
    customer: data.customer,
    measurementDate: data.measurementDate,
    performer: data.performer,
    representative: data.representative,
  });
  rootFlat["measurementPlace"] = data.measurementPlace;

  // The safety template uses a fixed two-section layout:
  //   sections[0] -> adminMeasurements (rendered before the "2. Производственный..." section row)
  //   sections[1] -> productionMeasurements (rendered after that section row)
  // Any extra sections beyond index 1 are appended to productionMeasurements
  // to avoid data loss.
  const admin = data.sections[0]?.rows ?? [];
  const productionRows: SafetyRow[] = [];
  for (let i = 1; i < data.sections.length; i++) {
    productionRows.push(...data.sections[i].rows);
  }

  return {
    ...rootFlat,
    adminMeasurements: admin.map(mapRow),
    productionMeasurements: productionRows.map(mapRow),
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
