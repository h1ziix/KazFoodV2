/**
 * scripts/build-lighting-template.js
 *
 * Converts public/templates/lighting-protocol.docx from the old
 * two-section static layout to the Meteo-style dynamic layout.
 *
 * CURRENT template state (produced by the previous version of this script):
 *   - Static section row: "1. Административно – управленческий персонал"
 *   - Admin data row:     {#adminMeasurements}...cells...{/adminMeasurements}
 *   - Static section row: "2. Производственный персонал"
 *   - Production data row:{#productionMeasurements}...cells...{/productionMeasurements}
 *
 * TARGET template state (matching the Meteo pattern):
 *   - Conditional section row: {#measurements}{-w:tr showPlace}{placeNumber}. {placeName}{/}
 *   - Data row:                ...cells...{/measurements}
 *
 * The conditional section row is derived from the existing "1. Административно"
 * static row — same XML structure, only the <w:t> text is replaced with
 * the docxtemplater placeholder.  This preserves borders/spans/styles.
 *
 * Usage:
 *   node scripts/build-lighting-template.js           # dry-run only
 *   node scripts/build-lighting-template.js --apply   # overwrite template
 */

"use strict";

const fs = require("fs");
const path = require("path");
const PizZip = require("pizzip");

const ROOT = path.resolve(__dirname, "..");
const TEMPLATE = path.join(ROOT, "public", "templates", "lighting-protocol.docx");
const DRY_RUN_OUT = path.join(ROOT, "public", "templates", "lighting-protocol.dryrun.docx");

/** Find the <w:tr>…</w:tr> span that contains `needle`. */
function findEnclosingTr(xml, needle) {
  const idx = xml.indexOf(needle);
  if (idx < 0) throw new Error(`Marker not found: ${needle}`);
  const s1 = xml.lastIndexOf("<w:tr ", idx);
  const s2 = xml.lastIndexOf("<w:tr>", idx);
  const start = Math.max(s1, s2);
  if (start < 0) throw new Error(`No enclosing <w:tr> for: ${needle}`);
  const end = xml.indexOf("</w:tr>", idx) + "</w:tr>".length;
  if (end < "</w:tr>".length) throw new Error(`No </w:tr> after: ${needle}`);
  return { start, end, text: xml.slice(start, end) };
}

/**
 * Replace the first <w:t>…</w:t> in `rowXml` with a new text node
 * carrying `placeholder`.  Special XML characters in the placeholder
 * are escaped.  The replacement node always uses xml:space="preserve"
 * so leading/trailing spaces in the placeholder are preserved.
 */
function buildSectionRow(rowXml, placeholder) {
  const escaped = placeholder
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return rowXml.replace(
    /<w:t(?:\s[^>]*)?>[\s\S]*?<\/w:t>/,
    `<w:t xml:space="preserve">${escaped}</w:t>`,
  );
}

function countMatches(s, re) {
  return (s.match(re) || []).length;
}

function main() {
  const apply = process.argv.includes("--apply");

  const buf = fs.readFileSync(TEMPLATE);
  const zip = new PizZip(buf);
  const docFile = zip.file("word/document.xml");
  if (!docFile) throw new Error("word/document.xml missing");
  const xml = docFile.asText();

  // Verify current template state.
  for (const marker of [
    "{#adminMeasurements}",
    "{/adminMeasurements}",
    "{#productionMeasurements}",
    "{/productionMeasurements}",
  ]) {
    if (countMatches(xml, new RegExp(marker.replace(/[{}#/]/g, "\\$&"), "g")) !== 1) {
      throw new Error(`Expected exactly one ${marker} in the template`);
    }
  }

  // Locate the four rows that will be collapsed into two.
  const sectionRow1 = findEnclosingTr(xml, "1. Административно");
  const adminDataRow = findEnclosingTr(xml, "{#adminMeasurements}");
  const sectionRow2 = findEnclosingTr(xml, "2. Производственный");
  const prodDataRow = findEnclosingTr(xml, "{#productionMeasurements}");

  // Ordering sanity.
  if (!(sectionRow1.start < adminDataRow.start &&
        adminDataRow.start < sectionRow2.start &&
        sectionRow2.start < prodDataRow.start)) {
    throw new Error("Rows are not in expected order; aborting.");
  }

  // Build replacement rows.
  const newSectionRow = buildSectionRow(
    sectionRow1.text,
    "{#measurements}{-w:tr showPlace}{placeNumber}. {placeName}{/}",
  );

  const newDataRow = adminDataRow.text
    .replace("{#adminMeasurements}", "")
    .replace("{/adminMeasurements}", "{/measurements}");

  // Replace the entire 4-row span with the 2 new rows.
  const regionStart = sectionRow1.start;
  const regionEnd = prodDataRow.end;
  const newXml =
    xml.slice(0, regionStart) + newSectionRow + newDataRow + xml.slice(regionEnd);

  // Structural checks.
  const beforeTr = countMatches(xml, /<w:tr[ >]/g);
  const afterTr = countMatches(newXml, /<w:tr[ >]/g);
  const beforeTbl = countMatches(xml, /<w:tbl>/g);
  const afterTbl = countMatches(newXml, /<w:tbl>/g);

  console.log(`<w:tr> count: ${beforeTr} → ${afterTr} (expected -2)`);
  console.log(`<w:tbl> count: ${beforeTbl} → ${afterTbl} (expected unchanged)`);

  if (beforeTbl !== afterTbl) throw new Error("Table count changed — aborting.");
  if (afterTr !== beforeTr - 2) {
    throw new Error(
      `Expected -2 <w:tr> (removed 2 static section rows); got ${afterTr - beforeTr}`,
    );
  }

  // Old markers gone, new markers present.
  for (const m of ["{#adminMeasurements}", "{/adminMeasurements}", "{#productionMeasurements}", "{/productionMeasurements}"]) {
    if (newXml.includes(m)) throw new Error(`Old marker still present: ${m}`);
  }
  if (!newXml.includes("{#measurements}")) throw new Error("Missing {#measurements}");
  if (!newXml.includes("{/measurements}")) throw new Error("Missing {/measurements}");
  if (!newXml.includes("{-w:tr showPlace}")) throw new Error("Missing {-w:tr showPlace}");

  zip.file("word/document.xml", newXml);
  const out = zip.generate({ type: "nodebuffer" });

  if (apply) {
    fs.writeFileSync(TEMPLATE, out);
    console.log(`APPLIED: overwrote ${TEMPLATE} (${out.length} bytes)`);
  } else {
    fs.writeFileSync(DRY_RUN_OUT, out);
    console.log(`DRY-RUN: wrote ${DRY_RUN_OUT} (${out.length} bytes)`);
    console.log("Re-run with --apply to overwrite the real template.");
  }
}

main();
