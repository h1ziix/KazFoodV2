import type { ConclusionProtocol, ConclusionRow } from "@/types/conclusion";
import { renderDocument, TemplateRenderError } from "./docs/engine";
import { flatten } from "./docs/flatten";
import { expandClassCount } from "./docs/indicators";

const TEMPLATE_URL = "/templates/conclusion-protocol.docx";

export { TemplateRenderError };

export async function generateConclusionDocx(
  data: ConclusionProtocol,
): Promise<void> {
  await renderDocument({
    templateUrl: TEMPLATE_URL,
    data,
    buildContext: buildTemplateContext,
    filename: () => `Заключение_${data.measurementDate.year}.docx`,
  });
}

/**
 * Полностью декларативная сборка контекста для docxtemplater:
 *   • плоские дотированные ключи реквизитов (через flatten + skipKeys);
 *   • массив rows: для каждой строки таблицы выкладываем 6 классовых
 *     ячеек через shared helper expandClassCount() — никакого switch
 *     в этом файле.
 */
export function buildTemplateContext(
  data: ConclusionProtocol,
): Record<string, unknown> {
  return {
    ...flatten(data, { skipKeys: ["rows"] }),
    rows: data.rows.map(rowCells),
  };
}

function rowCells(r: ConclusionRow): Record<string, unknown> {
  const display = r.count === "" ? "" : String(r.count);
  return {
    labelKk: r.labelKk,
    labelRu: r.labelRu,
    ...expandClassCount("", r.classValue, display),
  };
}
