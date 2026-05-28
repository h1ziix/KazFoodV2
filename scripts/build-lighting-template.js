/**
 * scripts/build-lighting-template.js
 *
 * Rebuild public/templates/lighting-protocol.docx so the measurement
 * table contains the two section-divider rows ("1. Административно –
 * управленческий персонал" and "2. Производственный персонал") taken
 * VERBATIM from the original reference DOCX
 *   "6. Освещ. протокол замеров KazFood.docx"
 *
 * Strategy (no XML hand-crafting, no table rebuild):
 *   1. Read the current template document.xml.
 *   2. Locate the single data row that contains both the loop opener
 *      "{#lighting_measurements}" and the loop closer
 *      "{/lighting_measurements}". This is the row we must clone.
 *   3. Produce two variants of that row:
 *        - admin row: loop renamed to {#adminMeasurements}…{/adminMeasurements}
 *        - prod  row: loop renamed to {#productionMeasurements}…{/productionMeasurements}
 *   4. Read section-row-1 and section-row-2 XML extracted from the
 *      reference DOCX (verified earlier). These are the EXACT <w:tr>
 *      blocks (gridSpan=9, bold center) from the original document.
 *   5. Replace the original data row with:
 *         <section-row-1><admin-row><section-row-2><prod-row>
 *   6. Write a *dry-run* DOCX next to the template so the result can be
 *      inspected before the real template is overwritten.
 *
 * Usage:
 *   node scripts/build-lighting-template.js            # dry-run only
 *   node scripts/build-lighting-template.js --apply    # overwrite template
 */

"use strict";

const fs = require("fs");
const path = require("path");
const PizZip = require("pizzip");

const ROOT = path.resolve(__dirname, "..");
const TEMPLATE = path.join(ROOT, "public", "templates", "lighting-protocol.docx");
const DRY_RUN_OUT = path.join(
  ROOT,
  "public",
  "templates",
  "lighting-protocol.dryrun.docx",
);

// --- The two section <w:tr> blocks pulled verbatim from the reference
// "6. Освещ. протокол замеров KazFood.docx" -> word/document.xml.
// gridSpan=9 spans the full 9-column measurement table. Style/borders/
// alignment/bold are exactly as authored in the original. ---

const SECTION_ROW_ADMIN =
  '<w:tr w:rsidR="00B165C8" w:rsidRPr="00CB1044" w14:paraId="7281DF87" w14:textId="77777777" w:rsidTr="00B851F2">' +
  '<w:trPr><w:trHeight w:val="140"/><w:jc w:val="center"/></w:trPr>' +
  '<w:tc><w:tcPr><w:tcW w:w="14312" w:type="dxa"/><w:gridSpan w:val="9"/><w:vAlign w:val="center"/></w:tcPr>' +
  '<w:p w14:paraId="2EA45C9E" w14:textId="7E06E680" w:rsidR="00B165C8" w:rsidRPr="00CB1044" w:rsidRDefault="003D3D2F" w:rsidP="002D5625">' +
  '<w:pPr><w:jc w:val="center"/><w:rPr><w:b/><w:lang w:eastAsia="ko-KR"/></w:rPr></w:pPr>' +
  '<w:r w:rsidRPr="003D3D2F"><w:rPr><w:b/><w:color w:val="000000"/></w:rPr>' +
  '<w:t>1. Административно – управленческий персонал</w:t></w:r></w:p></w:tc></w:tr>';

const SECTION_ROW_PROD =
  '<w:tr w:rsidR="00404FCE" w:rsidRPr="00CB1044" w14:paraId="376CD4EE" w14:textId="77777777" w:rsidTr="00404FCE">' +
  '<w:trPr><w:trHeight w:val="284"/><w:jc w:val="center"/></w:trPr>' +
  '<w:tc><w:tcPr><w:tcW w:w="14312" w:type="dxa"/><w:gridSpan w:val="9"/><w:vAlign w:val="center"/></w:tcPr>' +
  '<w:p w14:paraId="6B730AA9" w14:textId="77777777" w:rsidR="00404FCE" w:rsidRPr="00705AA7" w:rsidRDefault="00404FCE" w:rsidP="00404FCE">' +
  '<w:pPr><w:jc w:val="center"/><w:rPr><w:i/><w:color w:val="000000"/></w:rPr></w:pPr>' +
  '<w:r w:rsidRPr="001336E5"><w:rPr><w:b/><w:bCs/></w:rPr>' +
  '<w:t>2. Производственный персонал</w:t></w:r></w:p></w:tc></w:tr>';

const LOOP_OPEN_ORIG = "{#lighting_measurements}";
const LOOP_CLOSE_ORIG = "{/lighting_measurements}";

const LOOP_OPEN_ADMIN = "{#adminMeasurements}";
const LOOP_CLOSE_ADMIN = "{/adminMeasurements}";
const LOOP_OPEN_PROD = "{#productionMeasurements}";
const LOOP_CLOSE_PROD = "{/productionMeasurements}";

function findEnclosingTr(xml, needle) {
  const idx = xml.indexOf(needle);
  if (idx < 0) throw new Error(`Cannot find marker: ${needle}`);
  // Find the last "<w:tr " or "<w:tr>" before idx.
  let trStart = -1;
  for (const open of ["<w:tr ", "<w:tr>"]) {
    const i = xml.lastIndexOf(open, idx);
    if (i > trStart) trStart = i;
  }
  if (trStart < 0) throw new Error("No enclosing <w:tr> found");
  const closeTag = "</w:tr>";
  const endIdx = xml.indexOf(closeTag, idx);
  if (endIdx < 0) throw new Error("No </w:tr> after marker");
  return { start: trStart, end: endIdx + closeTag.length };
}

function main() {
  const apply = process.argv.includes("--apply");

  const buf = fs.readFileSync(TEMPLATE);
  const zip = new PizZip(buf);
  const docFile = zip.file("word/document.xml");
  if (!docFile) throw new Error("word/document.xml missing");
  let xml = docFile.asText();

  // Sanity: must contain exactly one loop and a single data row holding it.
  const openCount = (xml.match(/\{#lighting_measurements\}/g) || []).length;
  const closeCount = (xml.match(/\{\/lighting_measurements\}/g) || []).length;
  if (openCount !== 1 || closeCount !== 1) {
    throw new Error(
      `Expected one open and one close loop marker; found open=${openCount}, close=${closeCount}.`,
    );
  }

  const openSpan = findEnclosingTr(xml, LOOP_OPEN_ORIG);
  const closeSpan = findEnclosingTr(xml, LOOP_CLOSE_ORIG);
  if (openSpan.start !== closeSpan.start || openSpan.end !== closeSpan.end) {
    throw new Error(
      "Loop opener and closer are not in the same <w:tr>; aborting to avoid table damage.",
    );
  }

  const dataRow = xml.slice(openSpan.start, openSpan.end);

  // Build the admin and production clones by renaming the loop tags
  // inside the row (no other change — cell widths, paragraph props,
  // styling are byte-identical to the original).
  const adminRow = dataRow
    .replace(LOOP_OPEN_ORIG, LOOP_OPEN_ADMIN)
    .replace(LOOP_CLOSE_ORIG, LOOP_CLOSE_ADMIN);
  const prodRow = dataRow
    .replace(LOOP_OPEN_ORIG, LOOP_OPEN_PROD)
    .replace(LOOP_CLOSE_ORIG, LOOP_CLOSE_PROD);

  const replacement =
    SECTION_ROW_ADMIN + adminRow + SECTION_ROW_PROD + prodRow;

  const newXml =
    xml.slice(0, openSpan.start) + replacement + xml.slice(openSpan.end);

  // Cheap structural sanity check.
  const before = {
    tbl: (xml.match(/<w:tbl>/g) || []).length,
    tblEnd: (xml.match(/<\/w:tbl>/g) || []).length,
    tr: (xml.match(/<w:tr[ >]/g) || []).length,
  };
  const after = {
    tbl: (newXml.match(/<w:tbl>/g) || []).length,
    tblEnd: (newXml.match(/<\/w:tbl>/g) || []).length,
    tr: (newXml.match(/<w:tr[ >]/g) || []).length,
  };
  console.log("Row counts before:", before);
  console.log("Row counts after :", after);
  if (before.tbl !== after.tbl || before.tblEnd !== after.tblEnd) {
    throw new Error("Table count changed — aborting.");
  }
  if (after.tr !== before.tr + 3) {
    throw new Error(
      `Expected +3 rows (section1, prod-section, prod-data clone) — got ${after.tr - before.tr}`,
    );
  }

  // Loop markers must now be exactly the two new pairs and none of the original.
  if (newXml.includes(LOOP_OPEN_ORIG) || newXml.includes(LOOP_CLOSE_ORIG)) {
    throw new Error("Original loop markers still present after edit.");
  }
  for (const m of [LOOP_OPEN_ADMIN, LOOP_CLOSE_ADMIN, LOOP_OPEN_PROD, LOOP_CLOSE_PROD]) {
    if (!newXml.includes(m)) throw new Error(`Missing replacement marker ${m}`);
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
