/**
 * Тест генерации DOCX-документа №12 «Оценка травмобезопасности».
 *
 * Запуск: node scripts/test-safety.mjs
 *
 * Шаги:
 *   1) пересборка шаблона public/templates/safety-protocol.docx;
 *   2) рендер шаблона на ТРЁХ наборах данных (1, 3 и 10 разделов) —
 *      это проверяет, что внешний цикл {#sections} корректно
 *      размножает блок секции на произвольное число разделов;
 *   3) сохранение последнего рендера в test-safety-output.docx;
 *   4) автопроверки на каждом наборе:
 *        – нет "undefined" в финальном XML;
 *        – нет незаменённых тегов { ... };
 *        – ВСЕ заголовки разделов присутствуют в DOCX;
 *        – ВСЕ коды рабочих мест присутствуют в DOCX
 *          (т.е. ВСЕ строки всех секций отрендерены).
 */

import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const TEMPLATE = resolve(ROOT, "public/templates/safety-protocol.docx");
const OUT = resolve(ROOT, "test-safety-output.docx");

// --- (1) пересобрать шаблон ---
execSync("node scripts/build-safety-template.mjs", {
  cwd: ROOT,
  stdio: "inherit",
});

// --- утилиты (зеркало src/lib/docs + generateSafetyDocx) ---

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

function buildSection(s) {
  const trimmed = s.title.trim();
  const hasNumberPrefix = /^\d+\.\s*/.test(trimmed);
  const header = hasNumberPrefix ? trimmed : `${s.number}. ${trimmed}`;
  return {
    section_header: header,
    rows: s.rows.map(mapRow),
  };
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
  return {
    ...rootFlat,
    sections: data.sections.map(buildSection),
  };
}

// --- генератор тестовых данных ---

function row(code, position) {
  return {
    code,
    position,
    count: 1,
    equipment: "Оборудование согласно перечня",
    documentation: "в наличии",
    result: "соответствует",
    nonComplianceReasons: "отсутствуют",
    finalNote: "соответствует стандартам",
  };
}

function makeSection(number, title, rowsCount) {
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
    sections.push(makeSection(i, `Раздел ${i}`, rowsPerSection));
  }
  return {
    protocol: { number: String(sectionCount) },
    customer: {
      name: "KazEcoFood",
      address:
        "Алманиская обл, Карасайский район, село Кокозек, улица Несибели, 715",
    },
    measurementPlace: sections.map((s) => `${s.number}. Раздел ${s.number}`).join(", "),
    measurementDate: { day: "10", month: "апреля", year: "2026" },
    sections,
    performer: { fullName: "Исаева А.В.", position: "Специалист лаборатории" },
    representative: { fullName: "Богачев А.И.", position: "Начальник по БиОТ" },
  };
}

// --- рендер + проверки ---

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

  // --- автопроверки финального DOCX ---
  const verifyZip = new PizZip(out);
  const xmlText = verifyZip
    .file("word/document.xml")
    .asText()
    .replace(/<[^>]+>/g, "");

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

  function mustContain(needle) {
    if (xmlText.indexOf(needle) === -1) {
      console.error(`[${label}] FAIL: ожидался текст «${needle}»`);
      process.exit(4);
    }
  }

  // Каждый заголовок раздела ДОЛЖЕН встретиться — это и есть основной
  // тест регрессии (раньше рендерились только sections[0] и sections[1]).
  for (const s of data.sections) {
    mustContain(`${s.number}. Раздел ${s.number}`);
  }
  // Каждая строка каждой секции должна быть отрендерена.
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

// --- прогоны ---

console.log("--- safety: dynamic sections regression test ---");
renderAndVerify("1 section",   makeProtocol(1, 3));
renderAndVerify("3 sections",  makeProtocol(3, 3));
renderAndVerify("10 sections", makeProtocol(10, 2), /*writeOut*/ true);

console.log("✅ All 3 dynamic-section scenarios passed.");
