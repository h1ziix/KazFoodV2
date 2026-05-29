import type { CodingProtocol, CodingRow, CodingSection } from "@/types/coding";
import {
  renderBlob,
  renderDocument,
  TemplateRenderError,
} from "./docs/engine";
import { flatten } from "./docs/flatten";
import { sumBy } from "./docs/aggregate";

const TEMPLATE_URL = "/templates/coding-protocol.docx";

export { TemplateRenderError };

export async function generateCodingDocx(data: CodingProtocol): Promise<void> {
  await renderDocument({
    templateUrl: TEMPLATE_URL,
    data,
    buildContext: buildTemplateContext,
    filename: (d) =>
      `Кодировка_${d.approval.organization.replace(/[«»"\\/]+/g, "")}.docx`,
  });
}

export function renderCodingBlob(
  templateBuffer: ArrayBuffer | Buffer,
  data: CodingProtocol,
): Blob {
  return renderBlob(templateBuffer, buildTemplateContext(data));
}

function mapRow(r: CodingRow): Record<string, unknown> {
  return {
    code: r.code,
    name: r.name,
    count: r.count,
  };
}

/**
 * Контекст для одной секции. Шаблон содержит ОДИН блок секции
 * (заголовочная строка + строка данных), обёрнутый во внешний цикл
 * {#sections}…{/sections}. Внутри блока:
 *   {section_header}                                       — заголовок раздела
 *   {#rows}{code}|{name}|{count}{/rows}                    — строки данных
 * Заголовок совпадает с оригинальным DOCX: "<number>. <title>"
 * (БЕЗ суффикса "— N рабочих мест"; в оригинале его не было).
 */
function buildSection(s: CodingSection): {
  section_header: string;
  rows: Record<string, unknown>[];
} {
  return {
    section_header: `${s.number}. ${s.title}`,
    rows: s.rows.map(mapRow),
  };
}

export function buildTemplateContext(
  data: CodingProtocol,
): Record<string, unknown> {
  const rootFlat = flatten({ approval: data.approval });

  return {
    ...rootFlat,
    sections: data.sections.map(buildSection),
    grand_total: sumBy(data.sections, (s) => sumBy(s.rows, (r) => r.count)),
  };
}
