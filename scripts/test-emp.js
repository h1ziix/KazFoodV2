/**
 * scripts/test-emp.js
 *
 * Render the EMP protocol template with multi-place sample data and
 * verify dynamic section rows appear via the {-w:tr showPlace} pattern.
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
const TEMPLATE_DRY = path.join(ROOT, "public", "templates", "emp-protocol.dryrun.docx");
const OUT = path.join(ROOT, "test-emp-output.docx");

function makeMeas(rowNumber, pointNumber, place) {
  return {
    rowNumber,
    pointNumber,
    place,
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

const places = [
  {
    number: 1,
    name: "Административно – управленческий персонал",
    measurements: [
      makeMeas(1, "1т", "Кабинет директора"),
      makeMeas(2, "2т", "Бухгалтерия"),
      makeMeas(3, "3т", "Архив"),
    ],
  },
  {
    number: 2,
    name: "Производственный персонал",
    measurements: [
      makeMeas(4, "4т", "Цех №1"),
    ],
  },
];

// Build the flat measurements array the same way generateEmpDocx.ts does.
const measurements = [];
for (const place of places) {
  place.measurements.forEach((meas, i) => {
    measurements.push({
      ...meas,
      showPlace: i === 0,
      placeNumber: place.number,
      placeName: place.name,
    });
  });
}

const placesList = places.map((p) => `${p.number}. ${p.name}`).join(", ");

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
  purpose: "Тест dynamic section rows + Диапазон",
  methodologyStandard: "МУК 4.3.045-96",
  productStandard: "Приказ МЗ РК",
  representative: "Иванов И.И.",
  placesList,
  measurements,
  // Backward-compat: older templates used {#emp_measurements}.
  emp_measurements: measurements,
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

  const adminHits = (xml.match(/Административно/g) || []).length;
  const prodHits = (xml.match(/Производственный персонал/g) || []).length;
  const d1Hits = (xml.match(/Диапазон 1/g) || []).length;
  const d2Hits = (xml.match(/Диапазон 2/g) || []).length;
  const tblCount = (xml.match(/<w:tbl>/g) || []).length;
  const trCount = (xml.match(/<w:tr[ >]/g) || []).length;
  const firstRow = (xml.match(/Кабинет директора/g) || []).length;
  const leftover = xml.includes("{#") || xml.includes("{/");

  // 2 places × 1 section row each = 2 section rows.
  // 4 measurements × 3 rows-per-measurement = 12 data rows.
  // + 4 header rows in the EMP table + 1 row in table 1 = 19 total.
  const expectedTr = 19;
  // Each place name appears once in placesList and once in its section row → 2 hits each.
  // "Кабинет директора" is the {place} of measurement 1 — appears only in the data row (1 hit).

  console.log("--- VERIFY ---");
  console.log("tables:", tblCount);
  console.log("rows  :", trCount, `(expected ${expectedTr})`);
  console.log("'Административно' section:", adminHits, "(expected 2)");
  console.log("'Производственный персонал' section:", prodHits, "(expected 2)");
  console.log("'Диапазон 1':", d1Hits, "(expected 4)");
  console.log("'Диапазон 2':", d2Hits, "(expected 4)");
  console.log("'Кабинет директора':", firstRow, "(expected 1)");
  console.log("unresolved {#…}/{/…} markers:", leftover);

  const ok =
    tblCount === 2 &&
    adminHits === 2 &&
    prodHits === 2 &&
    d1Hits === 4 &&
    d2Hits === 4 &&
    firstRow === 1 &&
    !leftover &&
    trCount === expectedTr;

  if (!ok) {
    console.error("FAIL: structural expectations not met.");
    process.exit(2);
  }
  console.log("ALL CHECKS PASSED");
}

run();
