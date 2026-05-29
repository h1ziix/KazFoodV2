/**
 * Builds public/templates/siz-protocol.docx from the ORIGINAL reference
 * "13. СИЗ каз-рус ГОТОВо kazfood.docx" via surgical XML edits on the
 * existing word/document.xml.
 *
 * Strategy (mirrors scripts/build-coding-template.js and the fixed
 * scripts/build-safety-template.mjs — the canonical pattern for
 * documents with N разделов), but the СИЗ table has TWO distinct row
 * layouts that must both be preserved byte-to-byte from the original:
 *
 *   ─ Administrative data row (6 <w:tc>, grid units 1+2+1+3+1+1=9):
 *     | code | position(gs=2) | count | normItems(gs=3, merges norm+
 *       issuedFact+certificate) | assessment | note |
 *     Used when issuedFact/certificate are "-" — visually the long
 *     "не предусмотрено, согласно Нормам…" text fills the merged area.
 *
 *   ─ Production data row (8 <w:tc>, grid units 1+2+1+1+1+1+1+1=9):
 *     | code | position(gs=2) | count | normItems | issuedFact |
 *       certificate | assessment | note |
 *     Used for productive workers with split factual columns.
 *
 *   - The ORIGINAL DOCX is the structural source-of-truth.
 *   - Top-level placeholders OUTSIDE the main table are injected by
 *     surgical <w:t> replacements / run collapses.
 *   - Inside the main table we keep the column-header row(s) verbatim,
 *     and BUILD ONE GENERIC SECTION BLOCK that consists of:
 *         1) section_header_row — the admin section row (one big cell
 *            with gridSpan=9), collapsed into a single <w:r> carrying
 *            {section_header}.
 *         2) admin_data_row     — the original 6-cell admin row,
 *            templatized to 6 placeholders, wrapped in a conditional
 *            {-w:tr isMerged}…{/isMerged} so it renders only when the
 *            current item has isMerged === true.
 *         3) prod_data_row      — the original 8-cell production row,
 *            templatized to 8 placeholders, wrapped in
 *            {-w:tr isSplit}…{/isSplit} so it renders only when
 *            isSplit === true (mutually exclusive с isMerged — оба
 *            флага выставляются в generateSizDocx.ts.mapRow()).
 *     The two data rows together are wrapped in the INNER loop
 *     {#rows}…{/rows} (open in first <w:t> of admin row's first cell,
 *     close in last <w:t> of prod row's last cell — paragraphLoop=true
 *     promotes this to a per-row iteration that emits exactly one of
 *     the two row variants per item).
 *     Both data rows + section header are wrapped in the OUTER loop
 *     {#sections}…{/sections}.
 *   - Everything between the admin section row start and the closing
 *     </w:tbl> (original admin data rows + original production section
 *     row + production data rows) is dropped — the outer loop
 *     replicates the templated triplet N times.
 *
 * Final shape:
 *     {#sections}
 *       {section_header}
 *       {#rows}
 *         [-w:tr isMerged]   admin 6-cell row (gridSpan=3 on normItems)
 *                            {code}|{position}|{count}|{normItems}|
 *                            {assessment}|{note}
 *         [-w:tr isSplit]    prod 8-cell row
 *                            {code}|{position}|{count}|{normItems}|
 *                            {issuedFact}|{certificate}|{assessment}|
 *                            {note}
 *       {/rows}
 *     {/sections}
 *
 * Run: node scripts/build-siz-template.js
 */

"use strict";

const fs = require("fs");
const path = require("path");
const PizZip = require("pizzip");

const ROOT = path.resolve(__dirname, "..");
const ORIGINAL = path.join(
  ROOT,
  "13. \u0421\u0418\u0417 \u043a\u0430\u0437-\u0440\u0443\u0441 \u0413\u041e\u0422\u041e\u0412\u043e kazfood.docx",
);
const OUT_TEMPLATE = path.join(
  ROOT,
  "public",
  "templates",
  "siz-protocol.docx",
);

// ---------- generic XML helpers ----------

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
    throw new Error(
      `replaceWtExact: no match for ${JSON.stringify(oldText.slice(0, 80))}`,
    );
  if (matches.length > 1)
    throw new Error(
      `replaceWtExact: ${matches.length} matches for ${JSON.stringify(
        oldText.slice(0, 60),
      )}`,
    );
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

/**
 * Collapse the run sequence containing startWtTag through the run
 * containing endWtTag into a single <w:r> that keeps the FIRST run's
 * <w:rPr> and carries the placeholder. (Mirror of the same helper in
 * build-coding-template.js / build-safety-template.mjs.)
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

// ---------- main ----------

function main() {
  if (!fs.existsSync(ORIGINAL))
    throw new Error(`Original СИЗ DOCX not found: ${ORIGINAL}`);

  const zip = new PizZip(fs.readFileSync(ORIGINAL));
  const docFile = zip.file("word/document.xml");
  if (!docFile) throw new Error("word/document.xml missing in original");
  let xml = docFile.asText();

  // A) Top-level placeholders OUTSIDE the data row block
  xml = injectTopLevelPlaceholders(xml);

  // B) Templatize the main table: single dynamic {#sections}{#rows}…
  xml = templatizeMainTableDynamic(xml);

  // Persist
  zip.file("word/document.xml", xml);
  const outDir = path.dirname(OUT_TEMPLATE);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const out = zip.generate({
    type: "nodebuffer",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
  fs.writeFileSync(OUT_TEMPLATE, out);
  console.log(`Wrote ${OUT_TEMPLATE} (${out.length} bytes)`);
  console.log(`  document.xml size: ${xml.length} bytes`);
}

// ---------- A) top-level injection (без изменений; перенесено из старой версии) ----------

function injectTopLevelPlaceholders(xml) {
  // A.1) Protocol number appears twice in the title block
  xml = replaceWtExact(xml, "\u21161 ", "\u2116{protocol.number} ");
  xml = replaceWtExact(xml, " \u21161", " \u2116{protocol.number}");

  // A.2) Customer name + address (single <w:t>)
  xml = replaceWtExact(
    xml,
    "\u0422\u041e\u041e \u00abKazEcoFood\u00bb, \u0410\u043b\u043c\u0430\u043d\u0438\u0441\u043a\u0430\u044f \u043e\u0431\u043b, \u041a\u0430\u0440\u0430\u0441\u0430\u0439\u0441\u043a\u0438\u0439 \u0440\u0430\u0439\u043e\u043d, \u0441\u0435\u043b\u043e \u041a\u043e\u043a\u043e\u0437\u0435\u043a, \u0443\u043b\u0438\u0446\u0430 \u041d\u0435\u0441\u0438\u0431\u0435\u043b\u0438, 715",
    "\u0422\u041e\u041e \u00ab{customer.name}\u00bb, {customer.address}",
  );

  // A.3) measurementPlace — run sequence "ТОО «" … ", 715"
  xml = collapseMeasurementPlaceRuns(xml);

  // A.4) Date "«10» апреля 2026 г." (plain <w:t>)
  xml = replaceWtExact(
    xml,
    "\u00ab10\u00bb \u0430\u043f\u0440\u0435\u043b\u044f 2026 \u0433.",
    "\u00ab{measurementDate.day}\u00bb {measurementDate.month} {measurementDate.year} \u0433.",
  );

  // A.5) Signatures
  xml = replaceWtExact(
    xml,
    "\u0418\u0441\u0430\u0435\u0432\u0430 \u0410.\u0412.",
    "{performer.fullName}",
  );
  xml = collapsePerformerPositionRussian(xml);
  xml = replaceWtExact(
    xml,
    "\u0411\u043e\u0433\u0430\u0447\u0435\u0432 \u0410.\u0418.",
    "{representative.fullName}",
  );
  xml = replaceWtExact(
    xml,
    "\u041d\u0430\u0447\u0430\u043b\u044c\u043d\u0438\u043a \u043f\u043e ",
    "{representative.position}",
  );
  xml = replaceWtExact(xml, "\u0411\u0438\u041e\u0422", "");

  return xml;
}

function collapseMeasurementPlaceRuns(xml) {
  const firstAnchor = '<w:t xml:space="preserve">\u0422\u041e\u041e \u00ab</w:t>';
  let firstIdx = xml.indexOf(firstAnchor);
  if (firstIdx === -1) {
    const alt = "<w:t>\u0422\u041e\u041e \u00ab</w:t>";
    firstIdx = xml.indexOf(alt);
    if (firstIdx === -1)
      throw new Error("collapseMeasurementPlaceRuns: 'ТОО «' anchor not found");
  }
  const firstRunStart = xml.lastIndexOf("<w:r>", firstIdx);
  const firstRunStartAttr = xml.lastIndexOf("<w:r ", firstIdx);
  const runStart = Math.max(firstRunStart, firstRunStartAttr);
  if (runStart === -1)
    throw new Error("collapseMeasurementPlaceRuns: enclosing <w:r> not found");
  const runEnd = findElementEnd(xml, "w:r", runStart);
  const firstRunXml = xml.slice(runStart, runEnd);
  const rPrMatch = firstRunXml.match(/<w:rPr>[\s\S]*?<\/w:rPr>/);
  const rPr = rPrMatch ? rPrMatch[0] : "";

  const endAnchor1 = '<w:t xml:space="preserve">, 715</w:t>';
  const endAnchor2 = "<w:t>, 715</w:t>";
  let endTextIdx = xml.indexOf(endAnchor1, runStart);
  if (endTextIdx === -1) endTextIdx = xml.indexOf(endAnchor2, runStart);
  if (endTextIdx === -1)
    throw new Error("collapseMeasurementPlaceRuns: ', 715' anchor not found");
  const lastRunCloseEnd =
    xml.indexOf("</w:r>", endTextIdx) + "</w:r>".length;

  const replacement = `<w:r>${rPr}<w:t xml:space="preserve">{measurementPlace}</w:t></w:r>`;
  return xml.slice(0, runStart) + replacement + xml.slice(lastRunCloseEnd);
}

function collapsePerformerPositionRussian(xml) {
  const firstAnchor1 = '<w:t xml:space="preserve">\u0421\u0442\u0430\u0440\u0448\u0438\u0439 \u0441</w:t>';
  const firstAnchor2 = '<w:t>\u0421\u0442\u0430\u0440\u0448\u0438\u0439 \u0441</w:t>';
  let firstIdx = xml.indexOf(firstAnchor1);
  if (firstIdx === -1) firstIdx = xml.indexOf(firstAnchor2);
  if (firstIdx === -1)
    throw new Error("collapsePerformerPositionRussian: 'Старший с' not found");
  const runStartA = xml.lastIndexOf("<w:r>", firstIdx);
  const runStartB = xml.lastIndexOf("<w:r ", firstIdx);
  const runStart = Math.max(runStartA, runStartB);
  if (runStart === -1)
    throw new Error("collapsePerformerPositionRussian: enclosing <w:r> not found");
  const runEnd = findElementEnd(xml, "w:r", runStart);
  const firstRunXml = xml.slice(runStart, runEnd);
  const rPrMatch = firstRunXml.match(/<w:rPr>[\s\S]*?<\/w:rPr>/);
  const rPr = rPrMatch ? rPrMatch[0] : "";

  const endAnchor1 = '<w:t xml:space="preserve">\u0440\u0430\u0442\u043e\u0440\u0438\u0438</w:t>';
  const endAnchor2 = '<w:t>\u0440\u0430\u0442\u043e\u0440\u0438\u0438</w:t>';
  let endTextIdx = xml.indexOf(endAnchor1, runStart);
  if (endTextIdx === -1) endTextIdx = xml.indexOf(endAnchor2, runStart);
  if (endTextIdx === -1)
    throw new Error("collapsePerformerPositionRussian: 'ратории' not found");
  const lastRunCloseEnd =
    xml.indexOf("</w:r>", endTextIdx) + "</w:r>".length;

  const replacement = `<w:r>${rPr}<w:t xml:space="preserve">{performer.position}</w:t></w:r>`;
  return xml.slice(0, runStart) + replacement + xml.slice(lastRunCloseEnd);
}

// ---------- B) main table — DYNAMIC single section block ----------

function templatizeMainTableDynamic(xml) {
  const adminAnchor = "\u0410\u0434\u043c\u0438\u043d\u0438\u0441\u0442\u0440\u0430\u0446\u0438\u044f"; // "Администрация"
  const prodAnchor = "\u0440\u043e\u0438\u0437\u0432\u043e\u0434\u0441\u0442\u0432\u0435\u043d\u043d\u044b\u0439"; // "роизводственный"

  const adminSec = locateRowByAnchor(xml, adminAnchor);
  const prodSec = locateRowByAnchor(xml, prodAnchor, adminSec.end);

  const tblCloseIdx = xml.indexOf("</w:tbl>", prodSec.end);
  if (tblCloseIdx === -1)
    throw new Error("</w:tbl> not found after prod section row");

  // FIRST ADMIN data row — the 6-<w:tc> variant with gridSpan=3 on
  // normItems (merges normItems + issuedFact + certificate visually).
  // Sits right after adminSec.end.
  const adminRowStart = xml.indexOf("<w:tr ", adminSec.end);
  if (adminRowStart === -1 || adminRowStart >= prodSec.start)
    throw new Error("No admin data row found");
  const adminRowEnd = findElementEnd(xml, "w:tr", adminRowStart);
  const adminRowXml = xml.slice(adminRowStart, adminRowEnd);

  // FIRST PRODUCTION data row — the 8-<w:tc> variant. Sits right
  // after prodSec.end.
  const prodRowStart = xml.indexOf("<w:tr ", prodSec.end);
  if (prodRowStart === -1 || prodRowStart >= tblCloseIdx)
    throw new Error("No production data row found");
  const prodRowEnd = findElementEnd(xml, "w:tr", prodRowStart);
  const prodRowXml = xml.slice(prodRowStart, prodRowEnd);

  // ADMIN row: 6 cells. The 4th cell (gridSpan=3) holds normItems and
  // visually covers what would be norm + issuedFact + certificate in
  // the prod layout. Open BOTH the inner {#rows} loop AND the
  // {-w:tr isMerged} row-conditional on the FIRST cell's placeholder
  // text; close the row-conditional in the LAST cell. The {/rows}
  // close is emitted on the prod row's last cell so that one inner
  // iteration covers both candidate rows (only one will survive due
  // to the mutually exclusive conditionals).
  const ADMIN_PH = [
    "{#rows}{-w:tr isMerged}{code}",
    "{position}",
    "{count}",
    "{normItems}",
    "{assessment}",
    "{note}{/isMerged}",
  ];
  const adminRowT = templatizeRow(adminRowXml, ADMIN_PH);

  // PROD row: 8 cells.
  const PROD_PH = [
    "{-w:tr isSplit}{code}",
    "{position}",
    "{count}",
    "{normItems}",
    "{issuedFact}",
    "{certificate}",
    "{assessment}",
    "{note}{/isSplit}{/rows}",
  ];
  const prodRowT = templatizeRow(prodRowXml, PROD_PH);

  // SECTION HEADER ROW = the admin section row, collapsed into a single
  // <w:r> carrying {section_header}. The row has one big gridSpan cell
  // whose text is fragmented across many runs.
  let sectionHeaderRowXml = xml.slice(adminSec.start, adminSec.end);
  {
    const firstWtMatch = sectionHeaderRowXml.match(
      /<w:t(?:\s[^>]*)?>[^<]*<\/w:t>/,
    );
    if (!firstWtMatch) throw new Error("Section header row has no <w:t>");
    const firstWtFull = firstWtMatch[0];
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

  // Outer {#sections} loop wraps section header + both candidate data
  // rows (admin + prod), bracketed by the inner {#rows}…{/rows} loop
  // that is embedded inside the row placeholders above.
  const sectionBlock = wrapBlockWithLoop(
    sectionHeaderRowXml + adminRowT + prodRowT,
    "{#sections}",
    "{/sections}",
  );

  // Splice:
  //   [..adminSec.start]                            keep (header + col-headers)
  //   sectionBlock                                  the outer loop
  //   [tblCloseIdx..]                               keep (</w:tbl> + footer)
  return xml.slice(0, adminSec.start) + sectionBlock + xml.slice(tblCloseIdx);
}

main();
