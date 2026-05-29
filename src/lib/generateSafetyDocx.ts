import type {
  SafetyProtocol,
  SafetyRow,
  SafetySection,
} from "@/types/safety";
import {
  renderBlob,
  renderDocument,
  TemplateRenderError,
} from "./docs/engine";
import { flatten } from "./docs/flatten";

const TEMPLATE_URL = "/templates/safety-protocol.docx";

export { TemplateRenderError };

export async function generateSafetyDocx(
  data: SafetyProtocol,
): Promise<void> {
  await renderDocument({
    templateUrl: TEMPLATE_URL,
    data,
    buildContext: buildTemplateContext,
    filename: (d) => `Травмобезопасность_${d.protocol.number}.docx`,
  });
}

export function renderSafetyBlob(
  templateBuffer: ArrayBuffer | Buffer,
  data: SafetyProtocol,
): Blob {
  return renderBlob(templateBuffer, buildTemplateContext(data));
}

/**
 * Контекст одного раздела. Шаблон safety-protocol.docx содержит ОДИН
 * блок секции (заголовочная строка + пара LONG/SHORT строк данных),
 * обёрнутый во внешний цикл {#sections}…{/sections}. Внутри блока пара
 * строк обёрнута во внутренний цикл {#rows}…{/rows}. См.
 * scripts/build-safety-template.mjs.
 *
 *   {#sections}
 *     {section_header}
 *     {#rows}
 *       {code}|{position}|{count}|{equipment}|{documentation}|
 *       {result}|{nonComplianceReasons}
 *       {finalNote}
 *     {/rows}
 *   {/sections}
 *
 * Заголовок раздела формируется как «{title}», т.к. в исходном DOCX
 * номер уже входил в title ("1. Административно – управленческий
 * персонал"). Если title не содержит "<number>." префикса — его добавим
 * автоматически.
 */
function buildSection(s: SafetySection): {
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
  data: SafetyProtocol,
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

function mapRow(r: SafetyRow): Record<string, unknown> {
  return {
    code: r.code,
    position: r.position,
    count: r.count,
    equipment: r.equipment,
    documentation: r.documentation,
    result: r.result,
    nonComplianceReasons: r.nonComplianceReasons,
    finalNote: r.finalNote,
  };
}
