import type { SizProtocol, SizRow, SizSection } from "@/types/siz";
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

/**
 * Контекст одного раздела. Шаблон siz-protocol.docx содержит ОДИН
 * блок секции (заголовочная строка + ДВЕ кандидатные data-строки),
 * обёрнутый во внешний цикл {#sections}…{/sections}. Внутри блока
 * data-строки обёрнуты во внутренний цикл {#rows}…{/rows} и в
 * взаимоисключающие условия {-w:tr isMerged} (6-cell admin-вариант
 * с gridSpan=3 на normItems) и {-w:tr ^isMerged} (обычная 8-cell
 * production-строка). Подробнее: scripts/build-siz-template.js.
 *
 *   {#sections}
 *     {section_header}
 *     {#rows}
 *       [-w:tr isMerged]   admin: {code}|{position}|{count}|
 *                          {normItems(gs=3)}|{assessment}|{note}
 *       [-w:tr isSplit]    prod : {code}|{position}|{count}|
 *                          {normItems}|{issuedFact}|{certificate}|
 *                          {assessment}|{note}
 *     {/rows}
 *   {/sections}
 *
 * Заголовок раздела формируется как «{title}», если title уже
 * содержит "N." префикс (в существующем example data так и есть),
 * иначе — "{number}. {title}". Аналогично generateSafetyDocx и
 * generateCodingDocx.
 */
function buildSection(s: SizSection): {
  section_header: string;
  rows: Record<string, unknown>[];
} {
  const trimmed = s.title.trim();
  const hasNumberPrefix = /^\d+\.\s*/.test(trimmed);
  const header = hasNumberPrefix ? trimmed : `${s.number}. ${trimmed}`;
  return {
    section_header: header,
    rows: s.rows.map(mapRow),
  };
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

  return {
    ...rootFlat,
    sections: data.sections.map(buildSection),
  };
}

function mapRow(r: SizRow): Record<string, unknown> {
  const merged = isMergedRow(r);
  return {
    code: r.code,
    position: r.position,
    count: r.count,
    normItems: r.normItems,
    issuedFact: r.issuedFact,
    certificate: r.certificate,
    assessment: r.assessment,
    note: r.note,
    /**
     * Признак «merged-row»: в оригинальном DOCX строки для
     * административных должностей объединяют 3 колонки
     * (normItems + issuedFact + certificate) в одну ячейку с
     * gridSpan=3, в которой целиком умещается длинный текст
     * «- не предусмотрено, согласно Нормам…». Производственные
     * строки имеют 8 отдельных колонок.
     *
     * Авто-детект: если фактические колонки (issuedFact и
     * certificate) пустые / «-» / «—» / «–», то рендерим merged-
     * вариант. Иначе — 8-колоночная split-строка. Флаги
     * взаимоисключающие и оба используются в шаблоне
     * (см. scripts/build-siz-template.js, {-w:tr isMerged} /
     * {-w:tr isSplit}).
     */
    isMerged: merged,
    isSplit: !merged,
  };
}

const EMPTY_FACT_RE = /^\s*[-\u2013\u2014]?\s*$/;

function isMergedRow(r: SizRow): boolean {
  return EMPTY_FACT_RE.test(r.issuedFact) && EMPTY_FACT_RE.test(r.certificate);
}
