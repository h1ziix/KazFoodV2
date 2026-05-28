/**
 * scripts/test-lighting.js
 *
 * Render the lighting protocol DOCX template with a multi-section
 * example set (admin rows 1т…13т, then production rows 14т…16т) and
 * verify that the two section-divider rows from the reference DOCX are
 * present exactly once in the rendered output.
 *
 * By default this renders against the DRY-RUN template produced by
 * build-lighting-template.js (without --apply). Pass --live to render
 * against the real public/templates/lighting-protocol.docx instead.
 *
 *   node scripts/test-lighting.js          # dry-run template
 *   node scripts/test-lighting.js --live   # real template
 */

"use strict";

const fs = require("fs");
const path = require("path");
const PizZip = require("pizzip");
const Docxtemplater = require("docxtemplater");

const ROOT = path.resolve(__dirname, "..");
const TEMPLATE_LIVE = path.join(ROOT, "public", "templates", "lighting-protocol.docx");
const TEMPLATE_DRY = path.join(ROOT, "public", "templates", "lighting-protocol.dryrun.docx");
const OUT = path.join(ROOT, "test-lighting-output.docx");

function makeRow(rowNumber, pointNumber, place) {
  return {
    rowNumber,
    pointNumber,
    place,
    workCategory: "А-1",
    lightingSystem: "Искусственное общее",
    lightingType: "Люминесцентное, ЛБ-40",
    measured: 320,
    keo: "-",
    allowed: 300,
  };
}

const adminRows = [
  ["1т", "Кабинет директора"],
  ["2т", "Кабинет главного бухгалтера"],
  ["3т", "Кабинет менеджера"],
  ["4т", "Приёмная"],
  ["5т", "Отдел кадров"],
  ["6т", "Касса"],
  ["7т", "Архив"],
  ["8т", "Серверная"],
  ["9т", "Кабинет юриста"],
  ["10т", "Зал переговоров"],
  ["11т", "Кабинет экономиста"],
  ["12т", "Кабинет ОТ"],
  ["13т", "Кабинет инженера"],
];

const productionRows = [
  ["14т", "Цех №1"],
  ["15т", "Цех №2"],
  ["16т", "Склад готовой продукции"],
];

const data = {
  protocol: {
    number: "TEST-LIGHT-001",
    year: "2026",
    day: "25",
    month: "мая",
    dateYear: "2026",
  },
  customer: { name: "ТОО «Test Company»", address: "Тестовый адрес, 123" },
  measurementDate: { day: "25", month: "мая", year: "2026" },
  purpose: "Проверка section-rows",
  methodologyStandard: "ГОСТ 24940-96",
  productStandard: "Приказ МЗ РК",
  representative: "Иванов И.И.",
  roomDescription: "Тестовое помещение",
  "conditions.t": "20",
  "conditions.h": "50",
  "conditions.p": "700",
  placesList: "1. Офис, 2. Цех",
  places: [
    { number: 1, name: "Офис" },
    { number: 2, name: "Цех" },
  ],
  // adminMeasurements / productionMeasurements are what the new template
  // consumes. We also keep lighting_measurements for back-compat.
  adminMeasurements: adminRows.map(([pt, pl], i) => makeRow(i + 1, pt, pl)),
  productionMeasurements: productionRows.map(([pt, pl], i) =>
    makeRow(adminRows.length + i + 1, pt, pl),
  ),
  lighting_measurements: [
    ...adminRows.map(([pt, pl], i) => makeRow(i + 1, pt, pl)),
    ...productionRows.map(([pt, pl], i) =>
      makeRow(adminRows.length + i + 1, pt, pl),
    ),
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
          ? "Run scripts/build-lighting-template.js --apply first."
          : "Run scripts/build-lighting-template.js (no flag) first."),
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

  // Post-render structural verification.
  const verifyZip = new PizZip(out);
  const xml = verifyZip.file("word/document.xml").asText();
  const adminHits = (xml.match(/1\. Административно/g) || []).length;
  const prodHits = (xml.match(/2\. Производственный персонал/g) || []).length;
  const tblCount = (xml.match(/<w:tbl>/g) || []).length;
  const trCount = (xml.match(/<w:tr[ >]/g) || []).length;
  const dataRowHits = (xml.match(/Кабинет директора/g) || []).length;
  const prodCellHits = (xml.match(/Цех №1/g) || []).length;
  const leftover = xml.includes("{#") || xml.includes("{/");

  console.log("--- VERIFY ---");
  console.log("tables:", tblCount);
  console.log("rows  :", trCount);
  console.log("section-row 'Административно' occurrences:", adminHits);
  console.log("section-row 'Производственный' occurrences:", prodHits);
  console.log("admin first row 'Кабинет директора':", dataRowHits);
  console.log("production row 'Цех №1':", prodCellHits);
  console.log("unresolved {#…}/{/…} markers:", leftover);

  const expected =
    tblCount === 2 &&
    adminHits === 1 &&
    prodHits === 1 &&
    dataRowHits === 1 &&
    prodCellHits === 1 &&
    !leftover &&
    // header(1) + numbering(1) + section1(1) + 13 admin data rows
    //  + section2(1) + 3 production data rows = 20; plus first table (1) = 21
    trCount === 21;
  if (!expected) {
    console.error("FAIL: structural expectations not met.");
    process.exit(2);
  }
  console.log("ALL CHECKS PASSED");
}

run();
