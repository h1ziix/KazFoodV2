import type { SizProtocol, SizRow } from "@/types/siz";
import {
  renderBlob,
  renderDocument,
  TemplateRenderError,
} from "./docs/engine";
import { flatten } from "./docs/flatten";

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
  const rootFlat = flatten({
    protocol: data.protocol,
    customer: data.customer,
    measurementDate: data.measurementDate,
    performer: data.performer,
    representative: data.representative,
  });
  rootFlat["measurementPlace"] = data.measurementPlace;

  // The СИЗ template uses a fixed two-section layout that mirrors the
  // original DOCX:
  //   sections[0] -> adminRows       (rendered between the
  //                                   "1. Администрация..." section row
  //                                   and the "2. Производственный..."
  //                                   section row)
  //   sections[1] -> productionRows  (rendered after the
  //                                   "2. Производственный..." row)
  // Any extra sections beyond index 1 are appended to productionRows
  // to avoid data loss.
  const admin = data.sections[0]?.rows ?? [];
  const productionRows: SizRow[] = [];
  for (let i = 1; i < data.sections.length; i++) {
    productionRows.push(...data.sections[i].rows);
  }

  return {
    ...rootFlat,
    adminRows: admin.map(mapRow),
    productionRows: productionRows.map(mapRow),
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
