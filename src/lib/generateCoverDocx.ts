import type { CoverDocument } from "@/types/cover";
import { renderDocument, TemplateRenderError } from "./docs/engine";
import { flatten } from "./docs/flatten";

const TEMPLATE_URL = "/templates/cover-protocol.docx";

export { TemplateRenderError };

export async function generateCoverDocx(data: CoverDocument): Promise<void> {
  await renderDocument({
    templateUrl: TEMPLATE_URL,
    data,
    buildContext: buildTemplateContext,
    filename: (d) =>
      `Обложка_${d.customer.organization.replace(/[«»"\\/]+/g, "").trim()}.docx`,
  });
}

/**
 * Cover is a pure flat-scalar document: no loops, no indicators, no
 * sections, no aggregations. The shared `flatten()` is sufficient.
 */
export function buildTemplateContext(
  data: CoverDocument,
): Record<string, unknown> {
  return flatten(data);
}
