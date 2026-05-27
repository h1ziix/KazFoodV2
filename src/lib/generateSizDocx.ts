import type { SizProtocol, SizRow } from "@/types/siz";
import {
  renderBlob,
  renderDocument,
  TemplateRenderError,
} from "./docs/engine";
import { flatten } from "./docs/flatten";
import { flattenSectionsRows } from "./docs/rows";

const TEMPLATE_URL = "/templates/siz-protocol.docx";

export { TemplateRenderError };

export async function generateSizDocx(data: SizProtocol): Promise<void> {
  await renderDocument({
    templateUrl: TEMPLATE_URL,
    data,
    buildContext: buildTemplateContext,
    filename: (d) => `СИЗ_${d.protocol.number}.docx`,
  });
}

export function renderSizBlob(
  templateBuffer: ArrayBuffer | Buffer,
  data: SizProtocol,
): Blob {
  return renderBlob(templateBuffer, buildTemplateContext(data));
}

export function buildTemplateContext(
  data: SizProtocol,
): Record<string, unknown> {
  // docxtemplater 3.x не разворачивает теги с точкой как путь — раскладываем
  // в плоские ключи и пробрасываем в каждый элемент вложенных циклов.
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

function mapRow(r: SizRow): Record<string, unknown> {
  return {
    code: r.code,
    position: r.position,
    count: r.count,
    normItems: r.normItems,
    issuedFact: r.issuedFact,
    certificate: r.certificate,
    assessment: r.assessment,
    note: r.note,
  };
}
