/**
 * Тест генерации DOCX-документа №13 «Оценка обеспеченности СИЗ».
 *
 * Запуск: node scripts/test-siz.mjs
 *
 * Шаги:
 *   1) пересборка шаблона public/templates/siz-protocol.docx;
 *   2) рендер шаблона на ТРЁХ наборах данных (1, 3 и 10 разделов) —
 *      проверяет, что внешний цикл {#sections} корректно размножает
 *      блок секции на произвольное число разделов;
 *   3) сохранение последнего рендера в test-siz-output.docx;
 *   4) автопроверки на каждом наборе:
 *        – нет "undefined" в финальном XML;
 *        – нет незаменённых тегов { ... };
 *        – ВСЕ заголовки разделов присутствуют в DOCX;
 *        – ВСЕ коды рабочих мест присутствуют в DOCX
 *          (т.е. ВСЕ строки всех секций отрендерены);
 *        – нет остатков старой схемы adminRows / productionRows.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const TEMPLATE = resolve(ROOT, "public/templates/siz-protocol.docx");
const OUT = resolve(ROOT, "test-siz-output.docx");

// --- (1) пересобрать шаблон ---
execSync("node scripts/build-siz-template.js", { cwd: ROOT, stdio: "inherit" });

// --- утилиты (зеркало src/lib/docs + generateSizDocx) ---

function flatten(value, prefix = "", out = {}) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    if (prefix) out[prefix] = value;
    return out;
  }
  for (const [k, v] of Object.entries(value)) {
    const nextKey = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      flatten(v, nextKey, out);
    } else {
      out[nextKey] = v;
    }
  }
  return out;
}

function mapRow(r) {
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
    isMerged: merged,
    isSplit: !merged,
  };
}

// Зеркало isMergedRow из src/lib/generateSizDocx.ts: merged-вариант
// строки рисуется, если фактические колонки (issuedFact + certificate)
// пустые / «-» / «—» / «–».
const EMPTY_FACT_RE = /^\s*[-\u2013\u2014]?\s*$/;
function isMergedRow(r) {
  return EMPTY_FACT_RE.test(r.issuedFact) && EMPTY_FACT_RE.test(r.certificate);
}

function buildSection(s) {
  const trimmed = s.title.trim();
  const hasNumberPrefix = /^\d+\.\s*/.test(trimmed);
  const header = hasNumberPrefix ? trimmed : `${s.number}. ${trimmed}`;
  return { section_header: header, rows: s.rows.map(mapRow) };
}

function buildContext(data) {
  const rootFlat = flatten({
    protocol: data.protocol,
    customer: data.customer,
    measurementDate: data.measurementDate,
    performer: data.performer,
    representative: data.representative,
  });
  rootFlat["measurementPlace"] = data.measurementPlace;
  return { ...rootFlat, sections: data.sections.map(buildSection) };
}

// --- генератор тестовых данных ---

function row(code, position) {
  return {
    code,
    position,
    count: 1,
    normItems: "Жилет, Рубашка, Головной убор, ботинки",
    issuedFact: "Да",
    certificate: "В наличии",
    assessment: "Обеспечен",
    note: "-",
  };
}

const ADMIN_NORM_TEXT =
  '- не предусмотрено, согласно «Нормам выдачи специальной одежды и других средств индивидуальной защиты работникам организаций различных видов экономической деятельности», утвержденных Приказом Министра здравоохранения и социального развития РК от 8 декабря 2015 года № 943';

function adminRow(code, position) {
  return {
    code,
    position,
    count: 1,
    normItems: ADMIN_NORM_TEXT,
    issuedFact: "-",
    certificate: "-",
    assessment: "-",
    note: "-",
  };
}

function makeSection(number, rowsCount) {
  const rows = [];
  for (let i = 1; i <= rowsCount; i++) {
    const code = `${String(number).padStart(2, "0")} ${String(i).padStart(3, "0")} ${String(i).padStart(3, "0")}`;
    rows.push(row(code, `Должность ${number}.${i}`));
  }
  return { number, title: `${number}. Раздел ${number}`, rows };
}

function makeProtocol(sectionCount, rowsPerSection = 3) {
  const sections = [];
  for (let i = 1; i <= sectionCount; i++) {
    sections.push(makeSection(i, rowsPerSection));
  }
  return {
    protocol: { number: String(sectionCount) },
    customer: {
      name: "ТОО «KazEcoFood»",
      address:
        "Алманиская обл, Карасайский район, село Кокозек, улица Несибели, 715",
    },
    measurementPlace:
      "ТОО «KazEcoFood», Алманиская обл, Карасайский район, село Кокозек, улица Несибели, 715",
    measurementDate: { day: "10", month: "апреля", year: "2026" },
    sections,
    performer: {
      fullName: "Исаева А.В.",
      position: "Старший специалист лаборатории",
    },
    representative: { fullName: "Богачев А.И.", position: "Начальник по БиОТ" },
  };
}

function renderAndVerify(label, data, writeOut = false) {
  const tpl = readFileSync(TEMPLATE);
  const zip = new PizZip(tpl);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
  });

  try {
    doc.render(buildContext(data));
  } catch (err) {
    console.error(`[${label}] RENDER ERROR:`, err.message);
    if (err.properties?.errors) {
      err.properties.errors.forEach((e, i) =>
        console.error(`  [${i}]`, e.message, e.properties?.explanation ?? ""),
      );
    }
    process.exit(1);
  }

  const out = doc.getZip().generate({
    type: "nodebuffer",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
  if (writeOut) {
    writeFileSync(OUT, out);
    console.log(`[${label}] wrote ${OUT} (${out.length} bytes)`);
  }

  const verifyZip = new PizZip(out);
  const rawXml = verifyZip.file("word/document.xml").asText();
  const xmlText = rawXml.replace(/<[^>]+>/g, "");

  const undefMatches = [...xmlText.matchAll(/.{0,40}undefined.{0,40}/g)].map(
    (m) => m[0],
  );
  if (undefMatches.length > 0) {
    console.error(
      `[${label}] FAIL: найдено ${undefMatches.length} вхождений 'undefined':`,
    );
    undefMatches.slice(0, 10).forEach((s, i) => console.error(`  [${i}]`, s));
    process.exit(2);
  }

  const tagMatches = [
    ...xmlText.matchAll(/\{[a-zA-Z_][a-zA-Z0-9_.#/]*\}/g),
  ].map((m) => m[0]);
  if (tagMatches.length > 0) {
    console.error(
      `[${label}] FAIL: остались незаменённые теги (${tagMatches.length}):`,
    );
    tagMatches.slice(0, 20).forEach((s, i) => console.error(`  [${i}]`, s));
    process.exit(3);
  }

  // Regression: убедиться, что старой схемы adminRows/productionRows
  // в финальном XML НЕТ (на случай ошибочной протечки через шаблон).
  if (rawXml.indexOf("adminRows") !== -1) {
    console.error(`[${label}] FAIL: 'adminRows' остался в финальном XML`);
    process.exit(6);
  }
  if (rawXml.indexOf("productionRows") !== -1) {
    console.error(`[${label}] FAIL: 'productionRows' остался в финальном XML`);
    process.exit(6);
  }

  function mustContain(needle) {
    if (xmlText.indexOf(needle) === -1) {
      console.error(`[${label}] FAIL: ожидался текст «${needle}»`);
      process.exit(4);
    }
  }

  for (const s of data.sections) {
    mustContain(`${s.number}. Раздел ${s.number}`);
  }
  for (const s of data.sections) {
    for (const r of s.rows) {
      mustContain(r.code);
    }
  }

  const totalRows = data.sections.reduce((a, s) => a + s.rows.length, 0);
  console.log(
    `[${label}] OK ✅  разделов=${data.sections.length}, строк=${totalRows}`,
  );
}

/**
 * Дополнительная проверка для смешанного протокола: убедиться, что
 * после рендера в финальном XML присутствуют ОБА варианта data-row:
 *   – merged admin row: «не предусмотрено» внутри ячейки с
 *     <w:gridSpan w:val="3"/>;
 *   – split prod row: 8 раздельных ячеек, текст «В наличии»
 *     находится в отдельной (НЕ объединённой) <w:tc>.
 * Также проверяем, что НЕ протекли управляющие токены {-w:tr …},
 * {#rows}, {/isMerged} и т.п.
 */
function renderMixedAndVerifyLayout(label, data, writeOut) {
  const tpl = readFileSync(TEMPLATE);
  const zip = new PizZip(tpl);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
  });

  try {
    doc.render(buildContext(data));
  } catch (err) {
    console.error(`[${label}] RENDER ERROR:`, err.message);
    if (err.properties?.errors) {
      err.properties.errors.forEach((e, i) =>
        console.error(`  [${i}]`, e.message, e.properties?.explanation ?? ""),
      );
    }
    process.exit(1);
  }

  const out = doc.getZip().generate({
    type: "nodebuffer",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
  if (writeOut) {
    writeFileSync(OUT, out);
    console.log(`[${label}] wrote ${OUT} (${out.length} bytes)`);
  }

  const verifyZip = new PizZip(out);
  const rawXml = verifyZip.file("word/document.xml").asText();

  // (1) merged admin row: gridSpan=3 + длинный текст «не предусмотрено».
  //     В оригинале <w:gridSpan w:val="3"/> встречается именно в admin
  //     data row для normItems-ячейки. Должно быть >= 1 такой ячейки
  //     с текстом «не предусмотрено» внутри.
  const normTextIdx = rawXml.indexOf("не предусмотрено");
  if (normTextIdx === -1) {
    console.error(
      `[${label}] FAIL: ожидался merged-текст «не предусмотрено», но он отсутствует`,
    );
    process.exit(10);
  }
  // Найти <w:tc> вокруг этого текста и проверить наличие gridSpan=3.
  const tcStart = rawXml.lastIndexOf("<w:tc>", normTextIdx);
  const tcEnd = rawXml.indexOf("</w:tc>", normTextIdx);
  if (tcStart === -1 || tcEnd === -1) {
    console.error(`[${label}] FAIL: не нашёл <w:tc> вокруг norm-текста`);
    process.exit(11);
  }
  const tcXml = rawXml.slice(tcStart, tcEnd);
  if (tcXml.indexOf('<w:gridSpan w:val="3"/>') === -1) {
    console.error(
      `[${label}] FAIL: merged-ячейка normItems не содержит gridSpan=3 — структура admin-строки потеряна`,
    );
    console.error(tcXml.slice(0, 600));
    process.exit(12);
  }

  // (2) split prod row: текст «В наличии» должен быть в отдельной
  //     <w:tc> БЕЗ gridSpan (т.е. структура prod-строки сохранена).
  const splitIdx = rawXml.indexOf("В наличии");
  if (splitIdx === -1) {
    console.error(`[${label}] FAIL: ожидался prod-текст «В наличии»`);
    process.exit(13);
  }
  const tcStart2 = rawXml.lastIndexOf("<w:tc>", splitIdx);
  const tcEnd2 = rawXml.indexOf("</w:tc>", splitIdx);
  const certCell = rawXml.slice(tcStart2, tcEnd2);
  if (certCell.indexOf("<w:gridSpan") !== -1) {
    console.error(
      `[${label}] FAIL: prod-ячейка certificate неожиданно содержит gridSpan — структура prod-строки нарушена`,
    );
    process.exit(14);
  }

  // (3) Управляющие токены не должны протечь в финальный XML.
  for (const leak of [
    "{#rows}",
    "{/rows}",
    "{#sections}",
    "{/sections}",
    "{-w:tr",
    "{/isMerged}",
    "isMerged}",
  ]) {
    if (rawXml.indexOf(leak) !== -1) {
      console.error(`[${label}] FAIL: токен «${leak}» протёк в финальный XML`);
      process.exit(15);
    }
  }

  console.log(
    `[${label}] OK ✅  merged-row (gridSpan=3) + split-row (8 cells) присутствуют, токены не протекли`,
  );
}

console.log("--- siz: dynamic sections regression test ---");
renderAndVerify("1 section", makeProtocol(1, 3));
renderAndVerify("3 sections", makeProtocol(3, 3));
renderAndVerify("10 sections", makeProtocol(10, 2));

// Mixed: admin section (merged rows) + production section (split rows).
// Используется для финального test-siz-output.docx, чтобы можно было
// глазами сравнить с оригиналом «13. СИЗ каз-рус ГОТОВо kazfood.docx».
function makeMixedProtocol() {
  const admin = {
    number: 1,
    title: "1. Администрация – 3 рабочих мест",
    rows: [
      adminRow("01 001 001", "Директор"),
      adminRow("01 001 002", "Управляющий производством"),
      adminRow("01 001 003", "Бухгалтер"),
    ],
  };
  const prod = {
    number: 2,
    title: "2. Производственный персонал",
    rows: [
      row("01 002 001", "Технолог оператор"),
      row("01 002 002", "Лаборант"),
      row("01 002 003", "Грузчик"),
    ],
  };
  return {
    protocol: { number: "MIXED" },
    customer: {
      name: "ТОО «KazEcoFood»",
      address:
        "Алманиская обл, Карасайский район, село Кокозек, улица Несибели, 715",
    },
    measurementPlace:
      "ТОО «KazEcoFood», Алманиская обл, Карасайский район, село Кокозек, улица Несибели, 715",
    measurementDate: { day: "10", month: "апреля", year: "2026" },
    sections: [admin, prod],
    performer: {
      fullName: "Исаева А.В.",
      position: "Старший специалист лаборатории",
    },
    representative: { fullName: "Богачев А.И.", position: "Начальник по БиОТ" },
  };
}

renderMixedAndVerifyLayout("mixed admin+prod", makeMixedProtocol(), true);

console.log("✅ All scenarios passed.");
