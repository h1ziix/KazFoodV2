/**
 * Builds public/templates/coding-protocol.docx from the ORIGINAL reference
 * "3. Кодировка каз-рус kazfood.docx" via surgical XML edits.
 *
 * Strategy mirrors scripts/build-safety-template.mjs and
 * scripts/build-siz-template.js:
 *   - Use the ORIGINAL DOCX as the structural source-of-truth.
 *   - The HEADER ROW (row 0) is kept verbatim.
 *   - The TOTAL ROW (last row) keeps its multi-run structure; only the
 *     numeric "55" in "Итого: 55 р/м" is replaced with {grand_total}.
 *   - The ADMIN section header row (row 1, "1. Административно – ...")
 *     is templatized into a single-run row carrying "{section_header}".
 *   - The first admin data row (row 2) is templatized into a single row
 *     with placeholders {code}/{name}/{count}.
 *   - These two rows are wrapped TOGETHER in a single outer loop
 *     {#sections} ... {/sections}; inside, the data row is wrapped in
 *     an inner loop {#rows} ... {/rows}. This makes the generator emit
 *     N section blocks for N sections.
 *   - The original production section header row AND all original data
 *     rows are dropped (the outer loop replicates the admin block once
 *     per section, including section 2 and beyond).
 *   - The header paragraphs above the table (approval block) are surgically
 *     rewritten via single <w:t> replacements.
 *
 * Run: node scripts/build-coding-template.js
 */

"use strict";

const fs = require("fs");
const path = require("path");
const PizZip = require("pizzip");

const ROOT = path.resolve(__dirname, "..");
const ORIGINAL = path.join(ROOT, "3. Кодировка каз-рус kazfood.docx");
const OUT_TEMPLATE = path.join(ROOT, "public", "templates", "coding-protocol.docx");

// ---------- generic XML helpers (same shape as build-siz / build-safety) ----------

function findElementEnd(xml, tag, openIdx) {
  const openRe = new RegExp(`<${tag}(?:\\s|>|/>)`, "g");
  const closeTag = `</${tag}>`;
  openRe.lastIndex = openIdx + 1;
  let depth = 1;
  while (depth > 0) {
    const closeIdx = xml.indexOf(closeTag, openRe.lastIndex - 1);
    if (closeIdx === -1) throw new Error(`Unbalanced <${tag}> from ${openIdx}`);
    openRe.lastIndex = openIdx + 1;
    let nextOpen = -1;
    while (true) {
      const m = openRe.exec(xml);
      if (!m) break;
      if (m.index > closeIdx) break;
      if (
        xml[m.index + m[0].length - 1] === ">" &&
        xml[m.index + m[0].length - 2] === "/"
      )
        continue;
      nextOpen = m.index;
    }
    if (nextOpen !== -1 && nextOpen < closeIdx) {
      depth += 1;
      openRe.lastIndex = nextOpen + 1;
    } else {
      depth -= 1;
      if (depth === 0) return closeIdx + closeTag.length;
      openRe.lastIndex = closeIdx + closeTag.length;
    }
  }
  throw new Error(`Could not find end of <${tag}>`);
}

function replaceWtExact(xml, oldText, newText) {
  const esc = oldText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`<w:t(\\s[^>]*)?>${esc}</w:t>`, "g");
  const matches = [...xml.matchAll(re)];
  if (matches.length === 0)
    throw new Error(`replaceWtExact: no match for ${JSON.stringify(oldText.slice(0, 80))}`);
  if (matches.length > 1)
    throw new Error(`replaceWtExact: ${matches.length} matches for ${JSON.stringify(oldText.slice(0, 60))}`);
  const m = matches[0];
  const attrs = m[1] ?? ' xml:space="preserve"';
  return xml.replace(m[0], `<w:t${attrs}>${newText}</w:t>`);
}

function locateRowByAnchor(xml, anchor, fromIdx = 0) {
  const ai = xml.indexOf(anchor, fromIdx);
  if (ai === -1) throw new Error(`Anchor not found: ${anchor.slice(0, 80)}`);
  const start = xml.lastIndexOf("<w:tr ", ai);
  if (start === -1) throw new Error("<w:tr> before anchor not found");
  const end = findElementEnd(xml, "w:tr", start);
  return { start, end };
}

/**
 * Replace all <w:p> inside one <w:tc> with a single <w:p> that reuses the
 * first paragraph's <w:pPr> and the first run's <w:rPr>, containing one
 * <w:t> with `placeholder`. <w:tcPr> is preserved.
 */
function rewriteCellText(cellXml, placeholder) {
  const pStart1 = cellXml.indexOf("<w:p ");
  const pStart2 = cellXml.indexOf("<w:p>");
  const firstP =
    pStart1 !== -1 && (pStart2 === -1 || pStart1 < pStart2) ? pStart1 : pStart2;
  if (firstP === -1) return cellXml;
  const header = cellXml.slice(0, firstP);
  const tcClose = cellXml.lastIndexOf("</w:tc>");
  const tail = cellXml.slice(tcClose);
  const pTagEnd = cellXml.indexOf(">", firstP) + 1;
  const pOpen = cellXml.slice(firstP, pTagEnd);
  let pPr = "";
  const pPrStart = cellXml.indexOf("<w:pPr>", firstP);
  if (pPrStart !== -1) {
    const firstPClose = cellXml.indexOf("</w:p>", firstP);
    if (pPrStart < firstPClose) {
      const pPrEnd = findElementEnd(cellXml, "w:pPr", pPrStart);
      pPr = cellXml.slice(pPrStart, pPrEnd);
    }
  }
  let rPr = "";
  const firstR1 = cellXml.indexOf("<w:r ", firstP);
  const firstR2 = cellXml.indexOf("<w:r>", firstP);
  const rIdx =
    firstR1 !== -1 && (firstR2 === -1 || firstR1 < firstR2) ? firstR1 : firstR2;
  if (rIdx !== -1 && rIdx < tcClose) {
    const rEnd = findElementEnd(cellXml, "w:r", rIdx);
    const rPrStart = cellXml.indexOf("<w:rPr>", rIdx);
    if (rPrStart !== -1 && rPrStart < rEnd) {
      const rPrEnd = findElementEnd(cellXml, "w:rPr", rPrStart);
      rPr = cellXml.slice(rPrStart, rPrEnd);
    }
  }
  const body =
    placeholder === null
      ? `${pOpen}${pPr}</w:p>`
      : `${pOpen}${pPr}<w:r>${rPr}<w:t xml:space="preserve">${placeholder}</w:t></w:r></w:p>`;
  return `${header}${body}${tail}`;
}

function templatizeRow(rowXml, placeholders) {
  const cells = [];
  let idx = 0;
  while (true) {
    const open = rowXml.indexOf("<w:tc>", idx);
    if (open === -1) break;
    const end = findElementEnd(rowXml, "w:tc", open);
    cells.push({ start: open, end });
    idx = end;
  }
  if (cells.length !== placeholders.length)
    throw new Error(
      `templatizeRow: expected ${placeholders.length} cells, got ${cells.length}`,
    );
  let out = rowXml.slice(0, cells[0].start);
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    const cellXml = rowXml.slice(c.start, c.end);
    out += rewriteCellText(cellXml, placeholders[i]);
  }
  out += rowXml.slice(cells[cells.length - 1].end);
  return out;
}

/**
 * Inject `{#tag}` right after the FIRST <w:t> opening and `{/tag}` just
 * before the LAST </w:t> closing inside `blockXml`. This makes
 * docxtemplater (paragraphLoop:true) treat the enclosing <w:tr> as the
 * looped block, repeating the entire row per item without splitting any
 * paragraph or run.
 */
function wrapBlockWithLoop(blockXml, openTag, closeTag) {
  const tRe = /<w:t(?:\s[^>]*)?>/g;
  const m = tRe.exec(blockXml);
  if (!m) throw new Error("wrapBlockWithLoop: no <w:t> in block");
  const firstStart = m.index + m[0].length;
  let out =
    blockXml.slice(0, firstStart) + openTag + blockXml.slice(firstStart);
  const lastClose = out.lastIndexOf("</w:t>");
  out = out.slice(0, lastClose) + closeTag + out.slice(lastClose);
  return out;
}

// ---------- main ----------

/**
 * Collapse the run sequence that contains startWtTag through the run that
 * contains endWtTag into a single <w:r> carrying the FIRST run's <w:rPr>
 * and the given placeholder. The run boundaries are detected by walking
 * back to the enclosing <w:r ...> of startWtTag and forward to the
 * </w:r> after endWtTag. Throws if either anchor cannot be found.
 *
 * Equivalent to siz collapseMeasurementPlaceRuns but parameterised.
 */
function collapseRunRange(xml, startWtTag, endWtTag, placeholder) {
  const startTextIdx = xml.indexOf(startWtTag);
  if (startTextIdx === -1)
    throw new Error(
      `collapseRunRange: start anchor not found: ${startWtTag.slice(0, 80)}`,
    );
  const runStartA = xml.lastIndexOf("<w:r>", startTextIdx);
  const runStartB = xml.lastIndexOf("<w:r ", startTextIdx);
  const runStart = Math.max(runStartA, runStartB);
  if (runStart === -1)
    throw new Error("collapseRunRange: enclosing <w:r> not found");
  const firstRunEnd = findElementEnd(xml, "w:r", runStart);
  const firstRunXml = xml.slice(runStart, firstRunEnd);
  const rPrMatch = firstRunXml.match(/<w:rPr>[\s\S]*?<\/w:rPr>/);
  const rPr = rPrMatch ? rPrMatch[0] : "";

  const endTextIdx = xml.indexOf(endWtTag, runStart);
  if (endTextIdx === -1)
    throw new Error(
      `collapseRunRange: end anchor not found: ${endWtTag.slice(0, 80)}`,
    );
  const lastRunCloseEnd =
    xml.indexOf("</w:r>", endTextIdx) + "</w:r>".length;
  if (lastRunCloseEnd < endTextIdx)
    throw new Error("collapseRunRange: </w:r> after end anchor not found");

  const replacement = `<w:r>${rPr}<w:t xml:space="preserve">${placeholder}</w:t></w:r>`;
  return xml.slice(0, runStart) + replacement + xml.slice(lastRunCloseEnd);
}

function build() {
  if (!fs.existsSync(ORIGINAL))
    throw new Error(`Original coding DOCX not found: ${ORIGINAL}`);

  const origBuf = fs.readFileSync(ORIGINAL);
  const zip = new PizZip(origBuf);
  const docFile = zip.file("word/document.xml");
  if (!docFile) throw new Error("Original DOCX missing word/document.xml");
  let xml = docFile.asText();

  // ----- A) Header paragraphs (approval block) -----
  // The original sequence (preceding the table) contains, fragmented
  // across multiple runs each with its own <w:rPr>:
  //   "Директор "                          (single <w:t>)
  //   "ТОО «" + "KazEcoFood" + "»"          (3 runs)
  //   "Балян" + "  Л.Н."                    (2 runs)
  //   "«" + "20" + "»" + " " + "апреля" + " " + "202" + "6" + " г."  (date split)
  //
  // For each multi-run fragment we collapse the run span [startAnchor…
  // endAnchor] into a SINGLE <w:r> that keeps the first run's <w:rPr>
  // and carries the placeholder. This is identical to the technique used
  // in scripts/build-siz-template.js (collapseMeasurementPlaceRuns).
  xml = replaceWtExact(xml, "Директор ", "{approval.position}");
  xml = collapseRunRange(
    xml,
    "<w:t>ТОО «</w:t>",
    "<w:t>»</w:t>",
    "{approval.organization}",
  );
  xml = collapseRunRange(
    xml,
    "<w:t>Балян</w:t>",
    '<w:t xml:space="preserve">  Л.Н.</w:t>',
    "{approval.fullName}",
  );
  // The date «20» апреля 2026 г. starts with a standalone "«" <w:t> AFTER
  // the organisation closing "»" (so we anchor by walking forward from
  // there). The endAnchor " г." is the unique date suffix run.
  xml = collapseRunRange(
    xml,
    "<w:t>«</w:t>",
    '<w:t xml:space="preserve"> г.</w:t>',
    "«{approval.date.day}» {approval.date.month} {approval.date.year} г.",
  );

  // ----- B) Table mutation -----
  // Locate the two section rows by their text anchor. The admin section
  // header row becomes our TEMPLATE section header (collapsed to
  // {section_header}). The first admin data row becomes our TEMPLATE
  // data row. Together they form a single "section block" that is
  // wrapped in the outer {#sections}…{/sections} loop. Everything
  // between the admin block and the total row (production section
  // header + all original data rows) is dropped.

  // Admin section row anchor (text part that appears nowhere else).
  const adminSection = locateRowByAnchor(
    xml,
    "<w:t>Административно – управленческий персонал</w:t>",
  );
  // Production section row anchor: still needed only to find the end
  // of the dropped region.
  const prodSection = locateRowByAnchor(
    xml,
    "<w:t>Производственный персонал</w:t>",
    adminSection.end,
  );

  // First data row after admin section.
  const adminDataStart = xml.indexOf("<w:tr ", adminSection.end);
  if (adminDataStart === -1 || adminDataStart >= prodSection.start)
    throw new Error("No admin data row found");
  const adminDataEnd = findElementEnd(xml, "w:tr", adminDataStart);

  // Total row = last <w:tr ...> before </w:tbl> after prodSection.
  const tblCloseIdx = xml.indexOf("</w:tbl>", prodSection.end);
  if (tblCloseIdx === -1) throw new Error("</w:tbl> not found after prod section");
  const lastTrStart = xml.lastIndexOf("<w:tr ", tblCloseIdx);
  if (lastTrStart === -1 || lastTrStart <= adminDataEnd)
    throw new Error("Total row not found after admin data row");
  const totalRowStart = lastTrStart;
  const totalRowEnd = findElementEnd(xml, "w:tr", totalRowStart);
  const totalRowXml = xml.slice(totalRowStart, totalRowEnd);

  // --- Build the templatized section-header row ---
  // The admin section header row contains the multi-run text
  // "1. Административно – управленческий персонал". Collapse the entire
  // run sequence inside that row into a single <w:r> carrying
  // {section_header}. We do this by running collapseRunRange on the
  // row XML in isolation. The first <w:t> in the row holds the leading
  // "1." (or its fragment), and the last <w:t> in the row holds the
  // tail of the title.
  let sectionHeaderRowXml = xml.slice(adminSection.start, adminSection.end);
  {
    // Find first and last <w:t…>…</w:t> inside the row.
    const firstWtOpen = sectionHeaderRowXml.search(/<w:t(?:\s[^>]*)?>/);
    if (firstWtOpen === -1)
      throw new Error("Section header row has no <w:t>");
    const firstWtOpenMatch = sectionHeaderRowXml
      .slice(firstWtOpen)
      .match(/<w:t(?:\s[^>]*)?>/)[0];
    const firstWtCloseRel = sectionHeaderRowXml.indexOf(
      "</w:t>",
      firstWtOpen + firstWtOpenMatch.length,
    );
    const firstWtFull = sectionHeaderRowXml.slice(
      firstWtOpen,
      firstWtCloseRel + "</w:t>".length,
    );
    const lastWtClose = sectionHeaderRowXml.lastIndexOf("</w:t>");
    const lastWtOpen = sectionHeaderRowXml.lastIndexOf("<w:t", lastWtClose);
    const lastWtFull = sectionHeaderRowXml.slice(
      lastWtOpen,
      lastWtClose + "</w:t>".length,
    );
    sectionHeaderRowXml = collapseRunRange(
      sectionHeaderRowXml,
      firstWtFull,
      lastWtFull,
      "{section_header}",
    );
  }

  // --- Build the templatized data row (inside inner {#rows} loop) ---
  const adminDataXml = xml.slice(adminDataStart, adminDataEnd);
  const ROW_PH = ["{code}", "{name}", "{count}"];
  const dataRowT = templatizeRow(adminDataXml, ROW_PH);
  const dataRowBlock = wrapBlockWithLoop(dataRowT, "{#rows}", "{/rows}");

  // --- Build the section block (header row + data-row loop), wrapped
  //     in the outer {#sections}…{/sections} loop. We inject the outer
  //     loop tags into the FIRST <w:t> of the section header row and
  //     the LAST </w:t> of the data row block, so paragraphLoop:true
  //     replicates the two whole rows per section. ---
  const sectionBlockInner = sectionHeaderRowXml + dataRowBlock;
  const sectionBlock = wrapBlockWithLoop(
    sectionBlockInner,
    "{#sections}",
    "{/sections}",
  );

  // Total row: replace the literal "55" inside «Итого: 55 р/м» with
  // "{grand_total}". The "55" appears inside a single <w:t> together
  // with "Итого: ". Use replaceWtExact for surgical safety.
  const totalRowNew = totalRowXml.replace(
    "<w:t xml:space=\"preserve\">Итого: 55 </w:t>",
    "<w:t xml:space=\"preserve\">Итого: {grand_total} </w:t>",
  );
  if (totalRowNew === totalRowXml) {
    throw new Error("Total row: 'Итого: 55 ' fragment not found");
  }

  // Splice the new table region:
  //   [..adminSection.start]   keep (everything up to and including header row)
  //   sectionBlock             outer {#sections} loop (header row + {#rows} data row)
  //   totalRowNew              replaces the original total row
  //   [tblCloseIdx..]          keep (</w:tbl> + footer)
  xml =
    xml.slice(0, adminSection.start) +
    sectionBlock +
    totalRowNew +
    xml.slice(tblCloseIdx);

  zip.file("word/document.xml", xml);
  const out = zip.generate({ type: "nodebuffer", compression: "DEFLATE" });
  fs.writeFileSync(OUT_TEMPLATE, out);
  console.log(
    `Wrote ${OUT_TEMPLATE} (${out.length} bytes) from original (${origBuf.length} bytes)`,
  );
  console.log(`  document.xml size: ${xml.length} bytes`);
}

build();
