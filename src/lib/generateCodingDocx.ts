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
 * Контекст для одной секции. Шаблон ссылается на:
 *   {section1_header}  — заголовочная строка раздела
 *   {#section1_rows}{code}|{name}|{count}{/section1_rows}
 * Заголовок совпадает с оригинальным DOCX: "<number>. <title>"
 * (БЕЗ суффикса "— N рабочих мест"; в оригинале его не было).
 *
 * Возвращает плоские ключи (header / rows), которые caller разворачивает
 * в `section1_header` / `section1_rows` / `section2_header` / `section2_rows`.
 * docxtemplater 3.x не интерпретирует точку как путь в стандартной
 * конфигурации, поэтому имена кладутся подчёркиванием (см. flatten.ts).
 */
function buildSection(
  s: CodingSection | undefined,
): { header: string; rows: Record<string, unknown>[] } {
  if (!s) return { header: "", rows: [] };
  return {
    header: `${s.number}. ${s.title}`,
    rows: s.rows.map(mapRow),
  };
}

export function buildTemplateContext(
  data: CodingProtocol,
): Record<string, unknown> {
  const rootFlat = flatten({ approval: data.approval });
  const s1 = buildSection(data.sections[0]);
  const s2 = buildSection(data.sections[1]);

  return {
    ...rootFlat,
    section1_header: s1.header,
    section1_rows: s1.rows,
    section2_header: s2.header,
    section2_rows: s2.rows,
    grand_total: sumBy(data.sections, (s) => sumBy(s.rows, (r) => r.count)),
  };
}
