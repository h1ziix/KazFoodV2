/**
 * scripts/build-emp-template.js
 *
 * Converts public/templates/emp-protocol.docx from the old
 * single static section layout to the Meteo-style dynamic layout.
 *
 * CURRENT template state (produced by the previous version of this script):
 *   - Static section row: "1. Административно – управленческий персонал"
 *   - Loop row 1:         {#emp_measurements}...cells...
 *   - Loop row 2:         ...cells...
 *   - Loop row 3:         ...cells...{/emp_measurements}
 *
 * TARGET template state (matching the Meteo pattern):
 *   - Conditional section row: {#measurements}{-w:tr showPlace}{placeNumber}. {placeName}{/}
 *   - Loop row 1 (unchanged):  ...cells...
 *   - Loop row 2 (unchanged):  ...cells...
 *   - Loop row 3 (close loop): ...cells...{/measurements}
 *
 * The {range1Label}/{range2Label} tokens from the previous build are
 * preserved — they remain in the template cells unchanged.
 *
 * Usage:
 *   node scripts/build-emp-template.js           # dry-run only
 *   node scripts/build-emp-template.js --apply   # overwrite template
 */

"use strict";

const fs = require("fs");
const path = require("path");
const PizZip = require("pizzip");

const ROOT = path.resolve(__dirname, "..");
const TEMPLATE = path.join(ROOT, "public", "templates", "emp-protocol.docx");
const DRY_RUN_OUT = path.join(ROOT, "public", "templates", "emp-protocol.dryrun.docx");

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
 * carrying `placeholder`.  Special XML characters are escaped.
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
  if (countMatches(xml, /\{#emp_measurements\}/g) !== 1) {
    throw new Error("Expected exactly one {#emp_measurements}");
  }
  if (countMatches(xml, /\{\/emp_measurements\}/g) !== 1) {
    throw new Error("Expected exactly one {/emp_measurements}");
  }
  if (!xml.includes("1. Административно")) {
    throw new Error("Static section row not found");
  }

  // Locate key rows.
  const sectionRow = findEnclosingTr(xml, "1. Административно");
  const firstLoopRow = findEnclosingTr(xml, "{#emp_measurements}");
  const lastLoopRow = findEnclosingTr(xml, "{/emp_measurements}");

  // Ordering sanity.
  if (!(sectionRow.start < firstLoopRow.start)) {
    throw new Error("Section row must come before the loop opener.");
  }
  if (!(firstLoopRow.start <= lastLoopRow.start)) {
    throw new Error("First loop row must not be after last loop row.");
  }

  // Build replacement rows.
  const newSectionRow = buildSectionRow(
    sectionRow.text,
    "{#measurements}{-w:tr showPlace}{placeNumber}. {placeName}{/}",
  );

  // Extract all loop rows (from first to last, inclusive) and rename tags.
  const loopXml = xml.slice(firstLoopRow.start, lastLoopRow.end);
  const newLoopXml = loopXml
    .replace("{#emp_measurements}", "")
    .replace("{/emp_measurements}", "{/measurements}");

  // Replace the static section row + all loop rows with new rows.
  const regionStart = sectionRow.start;
  const regionEnd = lastLoopRow.end;
  const newXml =
    xml.slice(0, regionStart) + newSectionRow + newLoopXml + xml.slice(regionEnd);

  // Structural checks.
  const beforeTr = countMatches(xml, /<w:tr[ >]/g);
  const afterTr = countMatches(newXml, /<w:tr[ >]/g);
  const beforeTbl = countMatches(xml, /<w:tbl>/g);
  const afterTbl = countMatches(newXml, /<w:tbl>/g);

  console.log(`<w:tr> count: ${beforeTr} → ${afterTr} (expected unchanged)`);
  console.log(`<w:tbl> count: ${beforeTbl} → ${afterTbl} (expected unchanged)`);

  if (beforeTbl !== afterTbl) throw new Error("Table count changed — aborting.");
  if (afterTr !== beforeTr) {
    throw new Error(
      `Expected no change in <w:tr> count (section row replaced in-place); got ${afterTr - beforeTr}`,
    );
  }

  // Old markers gone, new markers present.
  if (newXml.includes("{#emp_measurements}")) throw new Error("Old {#emp_measurements} still present");
  if (newXml.includes("{/emp_measurements}")) throw new Error("Old {/emp_measurements} still present");
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
