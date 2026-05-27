import type { CodingProtocol, CodingRow, CodingSection } from "@/types/coding";
import {
  renderBlob,
  renderDocument,
  TemplateRenderError,
} from "./docs/engine";
import { flatten } from "./docs/flatten";
import { flattenSectionsRows } from "./docs/rows";
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
 * Derive per-section aggregates declaratively. Зам. switch/if по
 * docType — это просто чистая функция, вызванная для каждой секции.
 * Использует sumBy() (src/lib/docs/aggregate.ts) — никакого ручного
 * reduce внутри generator-а.
 */
function sectionAggregates(s: CodingSection) {
  const total = sumBy(s.rows, (r) => r.count);
  return {
    section_count: total,
    // Полный заголовок строки-разделителя в финальной таблице.
    section_header: `${s.number}. ${s.title} — ${total} рабочих мест`,
  };
}

export function buildTemplateContext(
  data: CodingProtocol,
): Record<string, unknown> {
  const rootFlat = flatten({ approval: data.approval });

  // Денормализуем агрегаты в каждую секцию. flattenSectionsRows
  // прокидывает rootFlat в каждый row, поэтому section_header будет
  // доступен и на уровне rows (мы используем его только в section row
  // шаблона, но это безопасно).
  const enriched = data.sections.map((s) => ({
    ...s,
    title: s.title, // оригинальный title сохраняется
  }));

  const sectionsCtx = flattenSectionsRows(
    enriched,
    mapRow,
    rootFlat,
  ).map((sectionCtx, idx) => ({
    ...sectionCtx,
    ...sectionAggregates(data.sections[idx]),
  }));

  return {
    ...rootFlat,
    sections: sectionsCtx,
    grand_total: sumBy(data.sections, (s) => sumBy(s.rows, (r) => r.count)),
  };
}
