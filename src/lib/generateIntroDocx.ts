import type { IntroDocument } from "@/types/intro";
import { renderDocument, TemplateRenderError } from "./docs/engine";
import { flatten } from "./docs/flatten";

const TEMPLATE_URL = "/templates/intro-protocol.docx";

export { TemplateRenderError };

export async function generateIntroDocx(data: IntroDocument): Promise<void> {
  await renderDocument({
    templateUrl: TEMPLATE_URL,
    data,
    buildContext: buildTemplateContext,
    filename: (d) =>
      `Введение_${d.customer.name.replace(/[«»"\\/]+/g, "").trim()}.docx`,
  });
}

/**
 * Intro is a flat-scalar document (no loops, no indicators, no
 * sections, no aggregations) — every placeholder maps to a leaf in the
 * data tree. The shared `flatten()` is sufficient.
 */
export function buildTemplateContext(
  data: IntroDocument,
): Record<string, unknown> {
  return flatten(data);
}
