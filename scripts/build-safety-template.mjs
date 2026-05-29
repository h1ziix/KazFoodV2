/**
 * Builds public/templates/safety-protocol.docx from the original
 * "12. Травма каз-рус ГОТОВО KazFood.docx" reference document.
 *
 * Strategy mirrors scripts/build-coding-template.js (the canonical fix for
 * the "только 2 раздела попадают в DOCX" регрессии):
 *   - Use the ORIGINAL DOCX as the structural base.
 *   - Surgically replace inner text of existing <w:t> nodes (вне таблицы)
 *     с плейсхолдерами.
 *   - Внутри большой таблицы оставляем заголовочную строку (шапку колонок)
 *     как есть, а блок «секции» строим из ТРЁХ шаблонных строк:
 *         1) section_header_row     — однострочный заголовок секции
 *            (родная "1. Административно..." строка, схлопнутая в один
 *             <w:r> с {section_header})
 *         2) LONG row               — первая строка данных, ячейки
 *            заменены на {code}|{position}|{count}|{equipment}|
 *            {documentation}|{result}|{nonComplianceReasons}
 *         3) SHORT row              — вторая строка пары (vMerge cont.),
 *            5-я ячейка = {finalNote}
 *     LONG+SHORT обёрнуты во ВНУТРЕННИЙ цикл {#rows}…{/rows}.
 *     Все три строки целиком обёрнуты во ВНЕШНИЙ цикл
 *     {#sections}…{/sections}.
 *   - Все оригинальные строки данных и второй заголовок ("Производственный
 *     персонал") выбрасываются — их размножает внешний цикл.
 *
 * Так получается:
 *
 *   {#sections}
 *     [заголовок раздела]
 *     {#rows}
 *       [LONG строка]
 *       [SHORT строка]
 *     {/rows}
 *   {/sections}
 *
 * Run:  node scripts/build-safety-template.mjs
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import PizZip from "pizzip";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

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
      `replaceWtExact: ${matches.length} matches for ${JSON.stringify(oldText.slice(0, 60))}`,
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

/**
 * Inject `{#tag}` right after the FIRST <w:t> opening and `{/tag}` just
 * before the LAST </w:t> closing inside `blockXml`. paragraphLoop:true
 * makes docxtemplater treat each enclosing <w:tr> as the loop body and
 * replicate every whole row of the block per item.
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

/**
 * Collapse run sequence between two <w:t> anchors (within `xml`) into a
 * single <w:r> that keeps the FIRST run's <w:rPr> and carries the
 * placeholder. Mirrors collapseRunRange from build-coding-template.js.
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

  // ===== B) Replace fixed two-section layout with a single
  //          {#sections}{#rows}…{/rows}{/sections} block. =====
  xml = templatizeBigTableDynamic(xml);

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

// ---------- A) top-level injection (без изменений) ----------

function injectTopLevelPlaceholders(xml) {
  xml = replaceWtExact(xml, " \u21161", " \u2116{protocol.number}");

  xml = replaceWtExact(
    xml,
    "\u0422\u041e\u041e \u00abKazEcoFood\u00bb, \u0410\u043b\u043c\u0430\u043d\u0438\u0441\u043a\u0430\u044f \u043e\u0431\u043b, \u041a\u0430\u0440\u0430\u0441\u0430\u0439\u0441\u043a\u0438\u0439 \u0440\u0430\u0439\u043e\u043d, \u0441\u0435\u043b\u043e \u041a\u043e\u043a\u043e\u0437\u0435\u043a, \u0443\u043b\u0438\u0446\u0430 \u041d\u0435\u0441\u0438\u0431\u0435\u043b\u0438, 715",
    "\u0422\u041e\u041e \u00ab{customer.name}\u00bb, {customer.address}",
  );

  xml = replaceWtExact(
    xml,
    "1. \u0410\u0434\u043c\u0438\u043d\u0438\u0441\u0442\u0440\u0430\u0442\u0438\u0432\u043d\u043e \u2013 \u0443\u043f\u0440\u0430\u0432\u043b\u0435\u043d\u0447\u0435\u0441\u043a\u0438\u0439 \u043f\u0435\u0440\u0441\u043e\u043d\u0430\u043b,  2. \u041f\u0440\u043e\u0438\u0437\u0432\u043e\u0434\u0441\u0442\u0432\u0435\u043d\u043d\u044b\u0439 \u043f\u0435\u0440\u0441\u043e\u043d\u0430\u043b",
    "{measurementPlace}",
  );

  // MERGEFIELD date collapse
  {
    const beginAnchor = "<w:instrText xml:space=\"preserve\"> MERGEFIELD \u0414\u0430\u0442\u0430_\u043f\u0440\u043e\u0432\u0435\u0434\u0435\u043d\u0438\u044f </w:instrText>";
    const beginIdx = xml.indexOf(beginAnchor);
    if (beginIdx === -1) throw new Error("MERGEFIELD instrText not found");
    const fldBeginMarker = '<w:fldChar w:fldCharType="begin"/>';
    const fldBeginIdx = xml.lastIndexOf(fldBeginMarker, beginIdx);
    if (fldBeginIdx === -1) throw new Error("fldChar begin not found");
    const firstRunStart = xml.lastIndexOf("<w:r ", fldBeginIdx);
    if (firstRunStart === -1) throw new Error("first run for fldChar begin not found");
    const fldEndMarker = '<w:fldChar w:fldCharType="end"/>';
    const fldEndIdx = xml.indexOf(fldEndMarker, beginIdx);
    if (fldEndIdx === -1) throw new Error("fldChar end not found");
    const lastRunEnd =
      xml.indexOf("</w:r>", fldEndIdx) + "</w:r>".length;
    const firstRunEnd = findElementEnd(xml, "w:r", firstRunStart);
    const firstRunXml = xml.slice(firstRunStart, firstRunEnd);
    const rPrMatch = firstRunXml.match(/<w:rPr>[\s\S]*?<\/w:rPr>/);
    const rPr = rPrMatch ? rPrMatch[0] : "";
    const replacement = `<w:r>${rPr}<w:t xml:space="preserve">\u00ab{measurementDate.day}\u00bb {measurementDate.month} {measurementDate.year} \u0433.</w:t></w:r>`;
    xml = xml.slice(0, firstRunStart) + replacement + xml.slice(lastRunEnd);
  }

  // Signatures
  xml = replaceWtExact(xml, "\u0418\u0441\u0430\u0435\u0432\u0430 \u0410.\u0412.", "{performer.fullName}");
  xml = replaceWtExact(
    xml,
    "\u043f\u0435\u0446\u0438\u0430\u043b\u0438\u0441\u0442 \u043b\u0430\u0431\u043e\u0440\u0430\u0442\u043e\u0440\u0438\u0438",
    "{performer.position}",
  );
  xml = replaceWtExact(xml, "\u0411\u043e\u0433\u0430\u0447\u0435\u0432 \u0410.\u0418.", "{representative.fullName}");
  xml = replaceWtExact(
    xml,
    "\u041d\u0430\u0447\u0430\u043b\u044c\u043d\u0438\u043a \u043f\u043e ",
    "{representative.position}",
  );
  xml = replaceWtExact(xml, "\u0411\u0438\u041e\u0422", "");

  return xml;
}

// ---------- B) big table — DYNAMIC single section block ----------

function templatizeBigTableDynamic(xml) {
  // Anchors for the two original section header rows.
  const adminSectionAnchor =
    "<w:t>1. \u0410\u0434\u043c\u0438\u043d\u0438\u0441\u0442\u0440\u0430\u0442\u0438\u0432\u043d\u043e \u2013 \u0443\u043f\u0440\u0430\u0432\u043b\u0435\u043d\u0447\u0435\u0441\u043a\u0438\u0439 \u043f\u0435\u0440\u0441\u043e\u043d\u0430\u043b</w:t>";
  const prodSectionAnchor =
    "<w:t>\u041f\u0440\u043e\u0438\u0437\u0432\u043e\u0434\u0441\u0442\u0432\u0435\u043d\u043d\u044b\u0439 \u043f\u0435\u0440\u0441\u043e\u043d\u0430\u043b</w:t>";

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

  const tblCloseIdx = xml.indexOf("</w:tbl>", prodSec.end);
  if (tblCloseIdx === -1)
    throw new Error("</w:tbl> not found after prod section");

  // First admin pair (LONG + SHORT) right after the admin section row.
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

  // 7 cells.
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

  const longT = templatizeRow(adminLongRow, LONG_PH);
  const shortT = templatizeRow(adminShortRow, SHORT_PH);

  // Inner {#rows} loop wraps the LONG+SHORT pair.
  const rowsBlock = wrapBlockWithLoop(longT + shortT, "{#rows}", "{/rows}");

  // Templatize the admin section header row: collapse its multi-run text
  // (которая фактически содержит "1. Административно – управленческий
  // персонал", фрагментированно) в один <w:r> с {section_header}.
  let sectionHeaderRowXml = xml.slice(adminSec.start, adminSec.end);
  {
    const firstWtMatch = sectionHeaderRowXml.match(/<w:t(?:\s[^>]*)?>[^<]*<\/w:t>/);
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

  // Outer {#sections} loop wraps the templatized header row + the rows block.
  const sectionBlock = wrapBlockWithLoop(
    sectionHeaderRowXml + rowsBlock,
    "{#sections}",
    "{/sections}",
  );

  // Splice: keep everything up to adminSec.start, then sectionBlock,
  // then drop all original section/data rows up to </w:tbl>.
  const newXml =
    xml.slice(0, adminSec.start) + sectionBlock + xml.slice(tblCloseIdx);
  return newXml;
}

main();
