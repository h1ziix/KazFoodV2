/**
 * scripts/test-emp.js
 *
 * Render the EMP protocol template with sample data and verify:
 *   - the new section row "1. Административно – управленческий
 *     персонал" appears exactly once,
 *   - the fixed "Диапазон 1" / "Диапазон 2" labels are present
 *     (instead of the previous frequency text like "5 Гц – 2 кГц"),
 *   - no unresolved {#…}/{/…} tokens remain,
 *   - the table count is unchanged (still 2),
 *   - per-iteration the loop still emits 3 <w:tr> blocks, plus the
 *     extra static section row, with no column drift.
 *
 *   node scripts/test-emp.js          # dry-run template
 *   node scripts/test-emp.js --live   # real template
 */

"use strict";

const fs = require("fs");
const path = require("path");
const PizZip = require("pizzip");
const Docxtemplater = require("docxtemplater");

const ROOT = path.resolve(__dirname, "..");
const TEMPLATE_LIVE = path.join(ROOT, "public", "templates", "emp-protocol.docx");
const TEMPLATE_DRY = path.join(
  ROOT,
  "public",
  "templates",
  "emp-protocol.dryrun.docx",
);
const OUT = path.join(ROOT, "test-emp-output.docx");

function makeMeas(rowNumber, pointNumber, place) {
  return {
    rowNumber,
    pointNumber,
    place,
    // The template ignores Name; Label is supplied separately.
    range1Label: "Диапазон 1",
    range1Name: "5 Гц – 2 кГц",
    range1Distance: "0,5",
    range1Height: "1,5",
    range1Time: "8",
    range1ElectricMeasured: "12,5",
    range1ElectricAllowed: "25",
    range1MagneticMeasured: "85",
    range1MagneticAllowed: "250",
    range2Label: "Диапазон 2",
    range2Name: "2 кГц – 400 кГц",
    range2Distance: "0,5",
    range2Height: "1,5",
    range2Time: "8",
    range2ElectricMeasured: "1,2",
    range2ElectricAllowed: "2,5",
    range2MagneticMeasured: "8,5",
    range2MagneticAllowed: "25",
  };
}

const data = {
  "protocol.number": "TEST-EMP-001",
  "protocol.year": "2026",
  "protocol.day": "25",
  "protocol.month": "мая",
  "protocol.dateYear": "2026",
  "customer.name": "ТОО «Test Company»",
  "customer.address": "Тестовый адрес, 123",
  "measurementDate.day": "25",
  "measurementDate.month": "мая",
  "measurementDate.year": "2026",
  purpose: "Тест section row + Диапазон",
  methodologyStandard: "МУК 4.3.045-96",
  productStandard: "Приказ МЗ РК",
  representative: "Иванов И.И.",
  placesList: "1. Кабинет директора, 2. Бухгалтерия",
  emp_measurements: [
    makeMeas(1, "1т", "Кабинет директора"),
    makeMeas(2, "2т", "Бухгалтерия"),
    makeMeas(3, "3т", "Архив"),
  ],
  "performer.fullName": "Тестов Т.Т.",
  "performer.position": "Инженер",
  "director.fullName": "Директоров Д.Д.",
};

function run() {
  const useLive = process.argv.includes("--live");
  const tpl = useLive ? TEMPLATE_LIVE : TEMPLATE_DRY;
  if (!fs.existsSync(tpl)) {
    throw new Error(
      `Template not found: ${tpl}\n` +
        (useLive
          ? "Run scripts/build-emp-template.js --apply first."
          : "Run scripts/build-emp-template.js first."),
    );
  }
  console.log(`Template: ${tpl}`);

  const zip = new PizZip(fs.readFileSync(tpl));
  const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });
  try {
    doc.render(data);
  } catch (err) {
    console.error("RENDER ERROR:", err.message);
    if (err.properties && err.properties.errors) {
      err.properties.errors.forEach((e, i) =>
        console.error(`  [${i}]`, e.message),
      );
    }
    process.exit(1);
  }
  const out = doc.getZip().generate({ type: "nodebuffer" });
  fs.writeFileSync(OUT, out);
  console.log(`OK: wrote ${OUT} (${out.length} bytes)`);

  const verifyZip = new PizZip(out);
  const xml = verifyZip.file("word/document.xml").asText();
  const sectionHits = (xml.match(/1\. Административно/g) || []).length;
  const d1Hits = (xml.match(/Диапазон 1/g) || []).length;
  const d2Hits = (xml.match(/Диапазон 2/g) || []).length;
  const freqOld = (xml.match(/5 Гц – 2 кГц/g) || []).length;
  const tblCount = (xml.match(/<w:tbl>/g) || []).length;
  const trCount = (xml.match(/<w:tr[ >]/g) || []).length;
  const placeHits = (xml.match(/Кабинет директора/g) || []).length;
  const leftover = xml.includes("{#") || xml.includes("{/");

  console.log("--- VERIFY ---");
  console.log("tables               :", tblCount);
  console.log("total <w:tr>         :", trCount);
  console.log("'Административно' row:", sectionHits);
  console.log("'Диапазон 1'         :", d1Hits);
  console.log("'Диапазон 2'         :", d2Hits);
  console.log("old frequency text   :", freqOld);
  console.log("'Кабинет директора'  :", placeHits);
  console.log("unresolved {#…}/{/…} :", leftover);

  // Expected rows in table 2: original 4 header rows + 1 section row
  //  + 3 measurements × 3 rows-per-iteration = 14
  // Table 1 contributes 1 row.
  // Total = 15.
  const expected =
    tblCount === 2 &&
    sectionHits === 1 &&
    d1Hits === 3 &&
    d2Hits === 3 &&
    freqOld === 0 &&
    placeHits === 2 &&
    !leftover &&
    trCount === 15;
  if (!expected) {
    console.error("FAIL: structural expectations not met.");
    process.exit(2);
  }
  console.log("ALL CHECKS PASSED");
}

run();
