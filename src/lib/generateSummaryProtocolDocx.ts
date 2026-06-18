import type { SummaryFactor, SummaryProtocol } from "@/types/summary";
import { renderDocument, TemplateRenderError } from "./docs/engine";
import { flatten } from "./docs/flatten";
import { flattenWorkplaceFactors } from "./docs/rows";
import { expandClassCount } from "./docs/indicators";

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
/** Пустой фактор — для рабочего места без измерений: строка появляется в
 *  таблице с заполненными колонками должности и пустыми колонками факторов. */
const EMPTY_FACTOR: SummaryFactor = {
  name: "",
  method: "",
  norm: "",
  actual: "",
  classValue: "",
};

export function buildTemplateContext(
  data: SummaryProtocol,
): Record<string, unknown> {
  const rows = flattenWorkplaceFactors(data.places, factorCells, EMPTY_FACTOR);

  return {
    ...flatten(data, { skipKeys: ["places", "measuringTools"] }),
    measuringTools: data.measuringTools.map((t) => ({ ...t })),
    rows,
  };
}

/**
 * Суффиксы шести классовых колонок сводного — РОВНО как в шаблоне
 * (class2…class4), а не дефолтные c2…c4 из indicators.ts.
 */
const SUMMARY_CLASS_SUFFIXES = {
  "2": "class2",
  "3.1": "class31",
  "3.2": "class32",
  "3.3": "class33",
  "3.4": "class34",
  "4": "class4",
} as const;

/**
 * Map a factor's `classValue` into the appropriate one of the six class
 * cells, leaving the others blank. The rendered cell content is "X кл"
 * (matches the source DOCX wording).
 */
function factorCells(factor: SummaryFactor): Record<string, string> {
  const display = factor.classValue ? `${factor.classValue} кл` : "";
  return {
    factorName: factor.name,
    factorMethod: factor.method,
    factorNorm: factor.norm,
    factorActual: factor.actual,
    ...expandClassCount("", factor.classValue, display, SUMMARY_CLASS_SUFFIXES),
  };
}
