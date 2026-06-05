/**
 * scripts/test-lighting.js
 *
 * Render the lighting protocol DOCX template with a multi-place
 * example set and verify that section divider rows appear dynamically
 * for each place (using the {-w:tr showPlace} Meteo-style pattern).
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

function makeRow(rowNumber, pointNumber, place, workCategory, measured, allowed) {
  return {
    rowNumber,
    pointNumber,
    place,
    workCategory,
    lightingSystem: "Искусственное, общее, равномерное",
    lightingType: "Светодиодное",
    measured,
    keo: "-",
    allowed,
  };
}

const places = [
  {
    number: 1,
    name: "Административно – управленческий персонал",
    measurements: [
      ["1т", "Кабинет директора", "А-1", 461, 300],
      ["2т", "Главный бухгалтер", "А-1", 540, 300],
      ["3т", "Кабинет менеджера", "А-1", 510, 400],
      ["4т", "Приёмная", "А-1", 480, 300],
      ["5т", "Отдел кадров", "А-1", 520, 300],
      ["6т", "Касса", "А-1", 590, 300],
      ["7т", "Архив", "А-1", 430, 300],
      ["8т", "Серверная", "А-1", 470, 300],
      ["9т", "Кабинет юриста", "А-1", 505, 300],
      ["10т", "Зал переговоров", "А-1", 570, 300],
      ["11т", "Кабинет экономиста", "А-1", 545, 300],
      ["12т", "Кабинет ОТ", "А-1", 555, 300],
      ["13т", "Кабинет инженера", "А-1", 580, 300],
    ],
  },
  {
    number: 2,
    name: "Производственный персонал",
    measurements: [
      ["14т", "Цех №1", "Б-2", 250, 200],
      ["15т", "Цех №2", "Б-2", 280, 200],
      ["16т", "Склад готовой продукции", "Б-2", 310, 200],
    ],
  },
];

// Build the flat measurements array the same way generateLightingDocx.ts does.
const measurements = [];
let rowNum = 1;
for (const place of places) {
  place.measurements.forEach((row, i) => {
    measurements.push({
      ...makeRow(rowNum++, row[0], row[1], row[2], row[3], row[4]),
      showPlace: i === 0,
      placeNumber: place.number,
      placeName: place.name,
    });
  });
}

const placesList = places.map((p) => `${p.number}. ${p.name}`).join(", ");

const data = {
  "protocol.number": "TEST-LIGHT-001",
  "protocol.year": "2026",
  "protocol.day": "25",
  "protocol.month": "мая",
  "protocol.dateYear": "2026",
  "customer.name": "ТОО «Test Company»",
  "customer.address": "Тестовый адрес, 123",
  "measurementDate.day": "25",
  "measurementDate.month": "мая",
  "measurementDate.year": "2026",
  purpose: "Проверка dynamic section-rows",
  methodologyStandard: "ГОСТ 24940-96",
  productStandard: "Приказ МЗ РК",
  representative: "Иванов И.И.",
  roomDescription: "Тестовое помещение",
  "conditions.t": "20",
  "conditions.h": "50",
  "conditions.p": "700",
  placesList,
  measurements,
  // Backward-compat keys (for any un-rebuilt old templates).
  adminMeasurements: measurements.filter((r) => r.placeNumber === 1),
  productionMeasurements: measurements.filter((r) => r.placeNumber === 2),
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
  const adminHits = (xml.match(/Административно/g) || []).length;
  const prodHits = (xml.match(/Производственный персонал/g) || []).length;
  const tblCount = (xml.match(/<w:tbl>/g) || []).length;
  const trCount = (xml.match(/<w:tr[ >]/g) || []).length;
  const firstAdminRow = (xml.match(/Кабинет директора/g) || []).length;
  const firstProdRow = (xml.match(/Цех №1/g) || []).length;
  const leftover = xml.includes("{#") || xml.includes("{/");

  console.log("--- VERIFY ---");
  console.log("tables:", tblCount);
  console.log("rows  :", trCount);
  console.log("'Административно' section hits:", adminHits);
  console.log("'Производственный персонал' section hits:", prodHits);
  console.log("'Кабинет директора' data row:", firstAdminRow);
  console.log("'Цех №1' data row:", firstProdRow);
  console.log("unresolved {#…}/{/…} markers:", leftover);

  // header(1) + numbering(1) + section1(1) + 13 admin data rows
  // + section2(1) + 3 production data rows = 20, plus first table (1) = 21
  const expectedTr = 21;
  // Each place name appears once in the placesList field and once in its
  // dynamic section header row, so the expected hit count per place is 2.
  const ok =
    tblCount === 2 &&
    adminHits === 2 &&
    prodHits === 2 &&
    firstAdminRow === 1 &&
    firstProdRow === 1 &&
    !leftover &&
    trCount === expectedTr;

  if (!ok) {
    console.error(`FAIL: expected trCount=${expectedTr}, got ${trCount}; or other check failed.`);
    process.exit(2);
  }
  console.log("ALL CHECKS PASSED");
}

run();
