/**
 * Builds public/templates/safety-protocol.docx from the original
 * "12. Травма каз-рус ГОТОВО KazFood.docx" reference document.
 *
 * Strategy mirrors scripts/build-noise-template.mjs:
 *   - Use the ORIGINAL DOCX as the structural base.
 *   - Surgically replace inner text of existing <w:t> nodes with placeholders.
 *   - Replace admin pair rows + production pair rows with templated pairs
 *     wrapped in {#adminMeasurements}/{#productionMeasurements} loops.
 *   - Section rows ("1. Административно..." and "2. Производственный...") and
 *     header rows are kept verbatim.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import PizZip from "pizzip";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// ---------- helpers ----------

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
      `replaceWtExact: ${matches.length} matches for ${JSON.stringify(oldText.slice(0, 60))}`,
    );
  const m = matches[0];
  const attrs = m[1] ?? ' xml:space="preserve"';
  return xml.replace(m[0], `<w:t${attrs}>${newText}</w:t>`);
}

function locateRowByAnchor(xml, anchor) {
  const ai = xml.indexOf(anchor);
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

// ---------- main ----------

function main() {
  const originalPath = resolve(
    ROOT,
    "12. \u0422\u0440\u0430\u0432\u043c\u0430 \u043a\u0430\u0437-\u0440\u0443\u0441 \u0413\u041e\u0422\u041e\u0412\u041e KazFood.docx",
  );
  if (!existsSync(originalPath))
    throw new Error(`Original safety DOCX not found: ${originalPath}`);
  const outPath = resolve(ROOT, "public/templates/safety-protocol.docx");

  const zip = new PizZip(readFileSync(originalPath));
  const docFile = zip.file("word/document.xml");
  if (!docFile) throw new Error("word/document.xml missing");
  let xml = docFile.asText();

  // ===== A) Top-level text placeholders OUTSIDE the big table =====
  xml = injectTopLevelPlaceholders(xml);

  // ===== B) Templatize big table: replace admin pairs + production pairs =====
  xml = templatizeBigTable(xml);

  // Persist
  zip.file("word/document.xml", xml);
  const outDir = dirname(outPath);
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  writeFileSync(
    outPath,
    zip.generate({
      type: "nodebuffer",
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }),
  );
  console.log(`✓ Built ${outPath}`);
  console.log(`  document.xml size: ${xml.length} bytes`);
}

// ---------- A) top-level injection ----------

function injectTopLevelPlaceholders(xml) {
  // A.1) Protocol number "№1" — original is one <w:t xml:space="preserve"> №1</w:t>
  xml = replaceWtExact(xml, " \u21161", " \u2116{protocol.number}");

  // A.2) Customer name + address (single <w:t>)
  xml = replaceWtExact(
    xml,
    "\u0422\u041e\u041e \u00abKazEcoFood\u00bb, \u0410\u043b\u043c\u0430\u043d\u0438\u0441\u043a\u0430\u044f \u043e\u0431\u043b, \u041a\u0430\u0440\u0430\u0441\u0430\u0439\u0441\u043a\u0438\u0439 \u0440\u0430\u0439\u043e\u043d, \u0441\u0435\u043b\u043e \u041a\u043e\u043a\u043e\u0437\u0435\u043a, \u0443\u043b\u0438\u0446\u0430 \u041d\u0435\u0441\u0438\u0431\u0435\u043b\u0438, 715",
    "\u0422\u041e\u041e \u00ab{customer.name}\u00bb, {customer.address}",
  );

  // A.3) measurementPlace
  xml = replaceWtExact(
    xml,
    "1. \u0410\u0434\u043c\u0438\u043d\u0438\u0441\u0442\u0440\u0430\u0442\u0438\u0432\u043d\u043e \u2013 \u0443\u043f\u0440\u0430\u0432\u043b\u0435\u043d\u0447\u0435\u0441\u043a\u0438\u0439 \u043f\u0435\u0440\u0441\u043e\u043d\u0430\u043b,  2. \u041f\u0440\u043e\u0438\u0437\u0432\u043e\u0434\u0441\u0442\u0432\u0435\u043d\u043d\u044b\u0439 \u043f\u0435\u0440\u0441\u043e\u043d\u0430\u043b",
    "{measurementPlace}",
  );

  // A.4) MERGEFIELD date — collapse fldChar begin…end into a single run with
  //      placeholder. Display text inside is «10» апреля 2026 г. (line 1150).
  {
    const beginAnchor = "<w:instrText xml:space=\"preserve\"> MERGEFIELD \u0414\u0430\u0442\u0430_\u043f\u0440\u043e\u0432\u0435\u0434\u0435\u043d\u0438\u044f </w:instrText>";
    const beginIdx = xml.indexOf(beginAnchor);
    if (beginIdx === -1) throw new Error("MERGEFIELD instrText not found");
    // The fldChar begin <w:r>...</w:r> precedes this. Walk back to find <w:r ... fldChar="begin">
    // Easier: find the enclosing <w:r ...> that contains <w:fldChar w:fldCharType="begin"/>
    // by searching backwards.
    const fldBeginMarker = '<w:fldChar w:fldCharType="begin"/>';
    const fldBeginIdx = xml.lastIndexOf(fldBeginMarker, beginIdx);
    if (fldBeginIdx === -1) throw new Error("fldChar begin not found");
    const firstRunStart = xml.lastIndexOf("<w:r ", fldBeginIdx);
    if (firstRunStart === -1) throw new Error("first run for fldChar begin not found");
    // Find fldChar end marker AFTER beginIdx
    const fldEndMarker = '<w:fldChar w:fldCharType="end"/>';
    const fldEndIdx = xml.indexOf(fldEndMarker, beginIdx);
    if (fldEndIdx === -1) throw new Error("fldChar end not found");
    // Find end of containing <w:r>
    const lastRunEnd =
      xml.indexOf("</w:r>", fldEndIdx) + "</w:r>".length;
    // Extract <w:rPr> from the FIRST run for fidelity
    const firstRunEnd = findElementEnd(xml, "w:r", firstRunStart);
    const firstRunXml = xml.slice(firstRunStart, firstRunEnd);
    const rPrMatch = firstRunXml.match(/<w:rPr>[\s\S]*?<\/w:rPr>/);
    const rPr = rPrMatch ? rPrMatch[0] : "";
    const replacement = `<w:r>${rPr}<w:t xml:space="preserve">\u00ab{measurementDate.day}\u00bb {measurementDate.month} {measurementDate.year} \u0433.</w:t></w:r>`;
    xml = xml.slice(0, firstRunStart) + replacement + xml.slice(lastRunEnd);
  }

  // A.5) Signatures (footer, after the big table)
  //  - "Исаева А.В." — performer.fullName (single <w:t>)
  xml = replaceWtExact(xml, "\u0418\u0441\u0430\u0435\u0432\u0430 \u0410.\u0412.", "{performer.fullName}");
  //  - "Специалист лаборатории" — performer.position
  xml = replaceWtExact(
    xml,
    "\u043f\u0435\u0446\u0438\u0430\u043b\u0438\u0441\u0442 \u043b\u0430\u0431\u043e\u0440\u0430\u0442\u043e\u0440\u0438\u0438",
    "{performer.position}",
  );
  //  - "Богачев А.И." — representative.fullName
  xml = replaceWtExact(xml, "\u0411\u043e\u0433\u0430\u0447\u0435\u0432 \u0410.\u0418.", "{representative.fullName}");
  //  - "Начальник по " (note trailing space, then "БиОТ" in next run). The
  //    Russian text is split: "Начальник по " + "БиОТ". Collapse by
  //    replacing just the "Начальник по " <w:t> with {representative.position}
  //    and removing the "БиОТ" <w:t>. To stay strictly text-only and avoid
  //    structural changes, replace "Начальник по " with placeholder and
  //    blank "БиОТ".
  xml = replaceWtExact(
    xml,
    "\u041d\u0430\u0447\u0430\u043b\u044c\u043d\u0438\u043a \u043f\u043e ",
    "{representative.position}",
  );
  xml = replaceWtExact(xml, "\u0411\u0438\u041e\u0422", "");

  return xml;
}

// ---------- B) big table ----------

function templatizeBigTable(xml) {
  // Anchors for the two section rows
  const adminSectionAnchor =
    "<w:t>1. \u0410\u0434\u043c\u0438\u043d\u0438\u0441\u0442\u0440\u0430\u0442\u0438\u0432\u043d\u043e \u2013 \u0443\u043f\u0440\u0430\u0432\u043b\u0435\u043d\u0447\u0435\u0441\u043a\u0438\u0439 \u043f\u0435\u0440\u0441\u043e\u043d\u0430\u043b</w:t>";
  const prodSectionAnchor =
    "<w:t>\u041f\u0440\u043e\u0438\u0437\u0432\u043e\u0434\u0441\u0442\u0432\u0435\u043d\u043d\u044b\u0439 \u043f\u0435\u0440\u0441\u043e\u043d\u0430\u043b</w:t>";

  // The "Административно" section header row spans cells with broken text;
  // the anchor above might not be unique. Use a uniqueness-guaranteeing
  // longer fragment that includes "Административно" + " – управленческий".
  // Fall back: locate via "Административно" then walk back to <w:tr.
  let adminSec;
  try {
    adminSec = locateRowByAnchor(xml, adminSectionAnchor);
  } catch {
    adminSec = locateRowByAnchor(
      xml,
      "<w:t>\u0410\u0434\u043c\u0438\u043d\u0438\u0441\u0442\u0440\u0430\u0442\u0438\u0432\u043d\u043e</w:t>",
    );
  }

  const prodSec = locateRowByAnchor(xml, prodSectionAnchor, adminSec.end);

  // Big table boundary
  // The big table is the SECOND <w:tbl>. Find </w:tbl> after prodSec.end.
  const tblCloseIdx = xml.indexOf("</w:tbl>", prodSec.end);
  if (tblCloseIdx === -1) throw new Error("</w:tbl> not found after prod section");

  // Find FIRST admin data row pair (LONG then SHORT) right after adminSec.end
  const adminLongStart = xml.indexOf("<w:tr ", adminSec.end);
  if (adminLongStart === -1 || adminLongStart >= prodSec.start)
    throw new Error("No admin LONG row found");
  const adminLongEnd = findElementEnd(xml, "w:tr", adminLongStart);
  const adminShortStart = xml.indexOf("<w:tr ", adminLongEnd);
  if (adminShortStart === -1 || adminShortStart >= prodSec.start)
    throw new Error("No admin SHORT row found");
  const adminShortEnd = findElementEnd(xml, "w:tr", adminShortStart);

  const adminLongRow = xml.slice(adminLongStart, adminLongEnd);
  const adminShortRow = xml.slice(adminShortStart, adminShortEnd);

  // Same for production
  const prodLongStart = xml.indexOf("<w:tr ", prodSec.end);
  if (prodLongStart === -1 || prodLongStart >= tblCloseIdx)
    throw new Error("No prod LONG row found");
  const prodLongEnd = findElementEnd(xml, "w:tr", prodLongStart);
  const prodShortStart = xml.indexOf("<w:tr ", prodLongEnd);
  if (prodShortStart === -1 || prodShortStart >= tblCloseIdx)
    throw new Error("No prod SHORT row found");
  const prodShortEnd = findElementEnd(xml, "w:tr", prodShortStart);

  const prodLongRow = xml.slice(prodLongStart, prodLongEnd);
  const prodShortRow = xml.slice(prodShortStart, prodShortEnd);

  // 7 cells. LONG row placeholders:
  //   [code, position, count, equipment, documentation, result, nonComplianceReasons]
  // SHORT row placeholders:
  //   [null, null, null, null, finalNote, null, null]
  // (only cell 4 has text; others are vMerge continuation with empty <w:p>)
  const LONG_PH = [
    "{code}",
    "{position}",
    "{count}",
    "{equipment}",
    "{documentation}",
    "{result}",
    "{nonComplianceReasons}",
  ];
  const SHORT_PH = [null, null, null, null, "{finalNote}", null, null];

  const adminLongT = templatizeRow(adminLongRow, LONG_PH);
  const adminShortT = templatizeRow(adminShortRow, SHORT_PH);
  const prodLongT = templatizeRow(prodLongRow, LONG_PH);
  const prodShortT = templatizeRow(prodShortRow, SHORT_PH);

  // Build per-section block: pair = LONG + SHORT; wrap pair with loop.
  const adminBlock = wrapBlockWithLoop(
    adminLongT + adminShortT,
    "{#adminMeasurements}",
    "{/adminMeasurements}",
  );
  const prodBlock = wrapBlockWithLoop(
    prodLongT + prodShortT,
    "{#productionMeasurements}",
    "{/productionMeasurements}",
  );

  // Replace admin range (adminSec.end → prodSec.start) with adminBlock
  // and prod range (prodSec.end → tblCloseIdx) with prodBlock.
  const newXml =
    xml.slice(0, adminSec.end) +
    adminBlock +
    xml.slice(prodSec.start, prodSec.end) +
    prodBlock +
    xml.slice(tblCloseIdx);
  return newXml;
}

main();