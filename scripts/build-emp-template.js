/**
 * scripts/build-emp-template.js
 *
 * Rebuild public/templates/emp-protocol.docx so the EMP measurement
 * table:
 *
 *   1. Contains the section-divider row
 *        "1. Административно – управленческий персонал"
 *      taken VERBATIM from the reference DOCX
 *        "7. ЭМП каз-рус ГОТОВО KazFood.docx"
 *      (gridSpan=19, full borders, bold centered).  The row is
 *      inserted between the existing header rows and the first
 *      <w:tr> that opens the {#emp_measurements} loop, so it stays
 *      static (one row in the output) and does NOT become part of
 *      every loop iteration.
 *
 *   2. Uses fixed range labels "Диапазон 1" / "Диапазон 2" instead
 *      of free-form frequency text. The data-driven placeholders
 *      {range1Name} and {range2Name} are renamed to {range1Label}
 *      and {range2Label}, and src/lib/generateEmpDocx.ts supplies
 *      constant values for them.
 *
 * Strategy is byte-surgical: we never rebuild the table, only
 *   - insert one extra <w:tr> immediately before the loop opener
 *     row, and
 *   - rename two placeholder tokens inside cells.
 * All tblPr / trPr / tcPr / tblGrid / vMerge / borders / fonts /
 * row heights are preserved exactly.
 *
 * Usage:
 *   node scripts/build-emp-template.js            # dry-run
 *   node scripts/build-emp-template.js --apply    # overwrite
 */

"use strict";

const fs = require("fs");
const path = require("path");
const PizZip = require("pizzip");

const ROOT = path.resolve(__dirname, "..");
const TEMPLATE = path.join(ROOT, "public", "templates", "emp-protocol.docx");
const DRY_RUN_OUT = path.join(
  ROOT,
  "public",
  "templates",
  "emp-protocol.dryrun.docx",
);

// Verbatim <w:tr> for the admin/management section divider, copied
// from the reference DOCX (word/document.xml @ ~98700).  gridSpan=19
// matches the 19-column tblGrid of the EMP measurement table.
const SECTION_ROW_ADMIN =
  '<w:tr w:rsidR="00C77C4B" w:rsidRPr="00B074D9" w14:paraId="03C89ABD" w14:textId="77777777" w:rsidTr="00671A2C">' +
  '<w:trPr><w:trHeight w:val="285"/><w:jc w:val="center"/></w:trPr>' +
  '<w:tc><w:tcPr><w:tcW w:w="15186" w:type="dxa"/><w:gridSpan w:val="19"/>' +
  '<w:tcBorders>' +
  '<w:top w:val="single" w:sz="4" w:space="0" w:color="auto"/>' +
  '<w:left w:val="single" w:sz="4" w:space="0" w:color="auto"/>' +
  '<w:bottom w:val="single" w:sz="4" w:space="0" w:color="auto"/>' +
  '<w:right w:val="single" w:sz="4" w:space="0" w:color="auto"/>' +
  '</w:tcBorders><w:vAlign w:val="center"/></w:tcPr>' +
  '<w:p w14:paraId="0E5C3E24" w14:textId="559B3275" w:rsidR="00C77C4B" w:rsidRPr="00B074D9" w:rsidRDefault="006B79A0" w:rsidP="00C77C4B">' +
  '<w:pPr><w:jc w:val="center"/><w:rPr><w:b/><w:bCs/></w:rPr></w:pPr>' +
  '<w:r w:rsidRPr="00077081"><w:rPr><w:b/><w:color w:val="000000"/></w:rPr>' +
  '<w:t>1. Административно – управленческий персонал</w:t></w:r></w:p></w:tc></w:tr>';

const LOOP_OPEN = "{#emp_measurements}";
const RENAMES = [
  ["{range1Name}", "{range1Label}"],
  ["{range2Name}", "{range2Label}"],
];

function findEnclosingTr(xml, needle) {
  const idx = xml.indexOf(needle);
  if (idx < 0) throw new Error(`marker not found: ${needle}`);
  const s1 = xml.lastIndexOf("<w:tr ", idx);
  const s2 = xml.lastIndexOf("<w:tr>", idx);
  const start = Math.max(s1, s2);
  if (start < 0) throw new Error("no <w:tr> before marker");
  const end = xml.indexOf("</w:tr>", idx) + "</w:tr>".length;
  return { start, end };
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
  let xml = docFile.asText();

  // Sanity: structure expectations.
  const openCount = countMatches(xml, /\{#emp_measurements\}/g);
  const closeCount = countMatches(xml, /\{\/emp_measurements\}/g);
  if (openCount !== 1 || closeCount !== 1) {
    throw new Error(
      `Expected 1 open & 1 close emp_measurements loop; found ${openCount}/${closeCount}`,
    );
  }
  for (const [from] of RENAMES) {
    const c = countMatches(xml, new RegExp(from.replace(/[{}]/g, "\\$&"), "g"));
    if (c !== 1) {
      throw new Error(`Expected exactly one ${from}; found ${c}`);
    }
  }

  // Insert section row immediately BEFORE the <w:tr> containing the
  // loop opener — so it stays a static, single row (NOT part of the
  // loop) in the rendered DOCX.
  const loopRow = findEnclosingTr(xml, LOOP_OPEN);
  const before = xml.slice(0, loopRow.start);
  const after = xml.slice(loopRow.start);
  let newXml = before + SECTION_ROW_ADMIN + after;

  // Rename placeholder tokens. Each appears exactly once (asserted
  // above) so plain .replace is safe.
  for (const [from, to] of RENAMES) {
    newXml = newXml.replace(from, to);
  }

  // Structural sanity.
  const beforeStats = {
    tbl: countMatches(xml, /<w:tbl>/g),
    tblEnd: countMatches(xml, /<\/w:tbl>/g),
    tr: countMatches(xml, /<w:tr[ >]/g),
  };
  const afterStats = {
    tbl: countMatches(newXml, /<w:tbl>/g),
    tblEnd: countMatches(newXml, /<\/w:tbl>/g),
    tr: countMatches(newXml, /<w:tr[ >]/g),
  };
  console.log("Row counts before:", beforeStats);
  console.log("Row counts after :", afterStats);
  if (beforeStats.tbl !== afterStats.tbl || beforeStats.tblEnd !== afterStats.tblEnd) {
    throw new Error("Table count drift — aborting.");
  }
  if (afterStats.tr !== beforeStats.tr + 1) {
    throw new Error(
      `Expected +1 <w:tr> (section row); got ${afterStats.tr - beforeStats.tr}`,
    );
  }

  // The original {range1Name}/{range2Name} must be gone; the new
  // labels must be present exactly once each.
  for (const [from] of RENAMES) {
    if (newXml.includes(from)) {
      throw new Error(`Original placeholder ${from} still present`);
    }
  }
  for (const [, to] of RENAMES) {
    if (countMatches(newXml, new RegExp(to.replace(/[{}]/g, "\\$&"), "g")) !== 1) {
      throw new Error(`New placeholder ${to} missing or duplicated`);
    }
  }

  // Section row must appear inside the table region, NOT inside the
  // loop body.
  const newOpenIdx = newXml.indexOf(LOOP_OPEN);
  const sectionIdx = newXml.indexOf(
    "1. Административно – управленческий персонал",
  );
  if (sectionIdx < 0 || sectionIdx > newOpenIdx) {
    throw new Error("Section row not placed before loop opener");
  }

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
