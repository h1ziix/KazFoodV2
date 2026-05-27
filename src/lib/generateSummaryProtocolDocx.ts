import type { SummaryFactor, SummaryProtocol } from "@/types/summary";
import { renderDocument, TemplateRenderError } from "./docs/engine";
import { flatten } from "./docs/flatten";
import { flattenWorkplaceFactors } from "./docs/rows";

const TEMPLATE_URL = "/templates/summary-protocol.docx";

export { TemplateRenderError };

export async function generateSummaryProtocolDocx(
  data: SummaryProtocol,
): Promise<void> {
  await renderDocument({
    templateUrl: TEMPLATE_URL,
    data,
    buildContext: buildTemplateContext,
    filename: (d) => `Сводный_протокол_${d.protocol.number}.docx`,
  });
}

/**
 * Flatten the protocol model into the shape expected by the docxtemplater
 * template:
 *   • all scalar/object fields available at top level via dotted keys;
 *   • `measuringTools` passed through as an array (looped with {#…/}).
 *   • `rows` — a single flat array combining section headers + factor
 *     rows. Each entry corresponds to ONE rendered row in the big table.
 *     The section pseudo-row is emitted as the first row of each new
 *     place (carrying showSection=true, placeNumber, placeName).
 *     Subsequent factor rows have showSection=false. The first factor
 *     row of a workplace carries `code`, `profession`, `count`; later
 *     factor rows in the same workplace have those fields blank so the
 *     leading columns appear empty (matching the source DOCX layout).
 */
export function buildTemplateContext(
  data: SummaryProtocol,
): Record<string, unknown> {
  const rows = flattenWorkplaceFactors(data.places, factorCells);

  return {
    ...flatten(data, { skipKeys: ["places", "measuringTools"] }),
    measuringTools: data.measuringTools.map((t) => ({ ...t })),
    rows,
  };
}

/**
 * Map a factor's `classValue` into the appropriate one of the six class
 * cells, leaving the others blank. The rendered cell content is "X кл"
 * (matches the source DOCX wording).
 */
function factorCells(factor: SummaryFactor): Record<string, string> {
  const cells: Record<string, string> = {
    factorName: factor.name,
    factorMethod: factor.method,
    factorNorm: factor.norm,
    factorActual: factor.actual,
    class2: "",
    class31: "",
    class32: "",
    class33: "",
    class34: "",
    class4: "",
  };
  const display = factor.classValue ? `${factor.classValue} кл` : "";
  switch (factor.classValue) {
    case "2":
      cells.class2 = display;
      break;
    case "3.1":
      cells.class31 = display;
      break;
    case "3.2":
      cells.class32 = display;
      break;
    case "3.3":
      cells.class33 = display;
      break;
    case "3.4":
      cells.class34 = display;
      break;
    case "4":
      cells.class4 = display;
      break;
    case "":
    default:
      // No class assigned; leave all cells blank.
      break;
  }
  return cells;
}
