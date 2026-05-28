/**
 * Builds public/templates/noise-protocol.docx from the original
 * "8. Шум протокол замера kAZfOOD.docx" reference document.
 *
 * Strategy:
 *   - Use the ORIGINAL DOCX as the structural base (preserves table grid,
 *     borders, merged cells, vertical text, header rows, footer, pagination).
 *   - Inject placeholders into existing <w:t> elements (preserving <w:rPr>).
 *   - Replace the 12 admin measurement rows with ONE templated row wrapped
 *     in {#adminMeasurements}…{/adminMeasurements}.
 *   - Replace the 41 production measurement rows with ONE templated row
 *     wrapped in {#productionMeasurements}…{/productionMeasurements}.
 *   - The two section rows ("1. Административно…", "2. Производственный…")
 *     are kept verbatim from the original.
 *
 * NEVER rebuild table grid, never alter widths, never regenerate borders.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import PizZip from "pizzip";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// ---------- helpers ----------

/**
 * Find the index of the closing tag for an element starting at `openIdx`.
 * Counts nested <tag …> and </tag> occurrences.
 * Returns the index AFTER the closing tag.
 */
function findElementEnd(xml, tag, openIdx) {
  const openRe = new RegExp(`<${tag}(?:\\s|>|/>)`, "g");
  const closeTag = `</${tag}>`;
  openRe.lastIndex = openIdx + 1;
  let depth = 1;
  while (depth > 0) {
    const closeIdx = xml.indexOf(closeTag, openRe.lastIndex - 1);
    if (closeIdx === -1) {
      throw new Error(`Unbalanced <${tag}> starting at ${openIdx}`);
    }
    openRe.lastIndex = openIdx + 1;
    let nextOpen = -1;
    while (true) {
      const m = openRe.exec(xml);
      if (!m) break;
      if (m.index > closeIdx) break;
      // ignore self-closing <tag …/>
      if (xml[m.index + m[0].length - 1] === ">" && xml[m.index + m[0].length - 2] === "/") {
        continue;
      }
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

/**
 * Locate <w:tr …> that contains the given anchor substring.
 * Returns { start, end } indices.
 */
function locateRowByAnchor(xml, anchor) {
  const anchorIdx = xml.indexOf(anchor);
  if (anchorIdx === -1) throw new Error(`Anchor not found: ${anchor.slice(0, 80)}`);
  const start = xml.lastIndexOf("<w:tr ", anchorIdx);
  if (start === -1) throw new Error(`<w:tr> before anchor not found`);
  const end = findElementEnd(xml, "w:tr", start);
  return { start, end };
}

/**
 * Replace `<w:t …>OLD</w:t>` (or `<w:t>OLD</w:t>`) where OLD matches `oldText`
 * exactly. Preserves the original attributes / xml:space.
 * Throws if zero or multiple matches.
 */
function replaceWtExact(xml, oldText, newText) {
  // Escape regex
  const esc = oldText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`<w:t(\\s[^>]*)?>${esc}</w:t>`, "g");
  const matches = [...xml.matchAll(re)];
  if (matches.length === 0) {
    throw new Error(`replaceWtExact: no match for "${oldText.slice(0, 60)}"`);
  }
  if (matches.length > 1) {
    throw new Error(
      `replaceWtExact: ${matches.length} matches for "${oldText.slice(0, 60)}"; need unique`
    );
  }
  const m = matches[0];
  const attrs = m[1] ?? "";
  return xml.replace(m[0], `<w:t${attrs || ' xml:space="preserve"'}>${newText}</w:t>`);
}

/**
 * Replace the inner text of an entire <w:r>…</w:r> run that contains the
 * given unique <w:t> text, leaving its <w:rPr> intact.
 */
function replaceWtAndKeepRpr(xml, oldText, newText) {
  return replaceWtExact(xml, oldText, newText);
}

/**
 * Builds a templated measurement row by taking an existing <w:tr> verbatim
 * (preserving cell widths, merged cells, borders) and replacing the text
 * content of its data <w:t> nodes with placeholders.
 *
 * The original row has 27 <w:tc>. We rewrite the inner <w:p> of each cell
 * to contain a single <w:r><w:t>{placeholder}</w:t></w:r> (preserving the
 * cell's own width/borders) for cells that are data-bearing; non-data
 * cells remain empty.
 *
 * To preserve original cell formatting precisely we DO NOT rewrite <w:tcPr>
 * or paragraph properties; we only replace the cell's inner runs.
 *
 * Returns a new <w:tr>…</w:tr> XML string.
 */
function templatizeRow(rowXml, placeholders) {
  // Split into 27 <w:tc>…</w:tc>
  const cells = [];
  let idx = 0;
  while (true) {
    const open = rowXml.indexOf("<w:tc>", idx);
    if (open === -1) break;
    const end = findElementEnd(rowXml, "w:tc", open);
    cells.push({ start: open, end });
    idx = end;
  }
  if (cells.length !== placeholders.length) {
    throw new Error(
      `templatizeRow: expected ${placeholders.length} cells, got ${cells.length}`
    );
  }

  // Rebuild the row by replacing each cell's <w:p>…</w:p> chain.
  // We keep <w:tc>…<w:tcPr>…</w:tcPr> intact and replace the <w:p> contents.
  let out = rowXml.slice(0, cells[0].start);
  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i];
    const cellXml = rowXml.slice(cell.start, cell.end);
    // Find <w:tcPr>…</w:tcPr> end
    const tcprStart = cellXml.indexOf("<w:tcPr>");
    let header;
    if (tcprStart === -1) {
      header = "<w:tc>";
    } else {
      const tcprEnd = findElementEnd(cellXml, "w:tcPr", tcprStart);
      header = cellXml.slice(0, tcprEnd);
    }
    // Locate first <w:p …> in cell to copy its pPr attributes for fidelity.
    const pOpen = cellXml.indexOf("<w:p ");
    let pTag = "<w:p>";
    if (pOpen !== -1) {
      const pClose = cellXml.indexOf(">", pOpen);
      pTag = cellXml.slice(pOpen, pClose + 1);
    }
    // Copy original <w:pPr>…</w:pPr> if present
    let pPr = "";
    const pPrStart = cellXml.indexOf("<w:pPr>", pOpen);
    if (pPrStart !== -1 && pPrStart < cellXml.indexOf("</w:p>", pOpen)) {
      const pPrEnd = findElementEnd(cellXml, "w:pPr", pPrStart);
      pPr = cellXml.slice(pPrStart, pPrEnd);
    }
    // Try to copy the FIRST <w:rPr>…</w:rPr> from the original cell for fidelity.
    let rPr = "";
    const firstR = cellXml.indexOf("<w:r ", pOpen);
    const firstRSelfClosed = cellXml.indexOf("<w:r>", pOpen);
    const rIdx =
      firstR !== -1 && (firstRSelfClosed === -1 || firstR < firstRSelfClosed)
        ? firstR
        : firstRSelfClosed;
    if (rIdx !== -1) {
      const rPrStart = cellXml.indexOf("<w:rPr>", rIdx);
      const rEnd = findElementEnd(cellXml, "w:r", rIdx);
      if (rPrStart !== -1 && rPrStart < rEnd) {
        const rPrEnd = findElementEnd(cellXml, "w:rPr", rPrStart);
        rPr = cellXml.slice(rPrStart, rPrEnd);
      }
    }
    const placeholder = placeholders[i];
    let body;
    if (placeholder === null) {
      // Empty cell — keep paragraph but no run
      body = `${pTag}${pPr}</w:p>`;
    } else {
      body = `${pTag}${pPr}<w:r>${rPr}<w:t xml:space="preserve">${placeholder}</w:t></w:r></w:p>`;
    }
    out += `${header}${body}</w:tc>`;
  }
  out += rowXml.slice(cells[cells.length - 1].end);
  return out;
}

// ---------- main ----------

function main() {
  const originalPath = resolve(
    ROOT,
    "8. \u0428\u0423\u041c \u043a\u0430\u0437-\u0440\u0443\u0441 \u0413\u041e\u0422\u041e\u0412\u041e kAZfOOD.docx"
  );
  if (!existsSync(originalPath)) {
    throw new Error(`Original noise DOCX not found: ${originalPath}`);
  }
  const outPath = resolve(ROOT, "public/templates/noise-protocol.docx");

  const zip = new PizZip(readFileSync(originalPath));
  const docFile = zip.file("word/document.xml");
  if (!docFile) throw new Error("word/document.xml missing");
  let xml = docFile.asText();

  // ----- 1) text-field placeholders (preserve rPr) -----

  // protocol number "1004 " (with trailing space inside <w:t xml:space="preserve">)
  xml = replaceWtExact(xml, "1004 ", "{protocol.number}");
  // "-ШУМ," suffix -> ","
  xml = replaceWtExact(xml, "-\u0428\u0423\u041c,", ",");
  // year split "202" + "6" -> empty + "{protocol.year}".
  // Search for the unique sequence and replace surgically.
  {
    const titleYearPattern =
      "<w:t>202</w:t></w:r><w:r w:rsidR=\"00987019\"><w:rPr><w:b/><w:sz w:val=\"24\"/><w:szCs w:val=\"24\"/><w:lang w:val=\"en-US\" w:eastAsia=\"en-US\"/></w:rPr><w:t>6</w:t>";
    if (xml.indexOf(titleYearPattern) === -1) {
      throw new Error("Title year split sequence not found");
    }
    const replacement =
      "<w:t></w:t></w:r><w:r w:rsidR=\"00987019\"><w:rPr><w:b/><w:sz w:val=\"24\"/><w:szCs w:val=\"24\"/><w:lang w:val=\"en-US\" w:eastAsia=\"en-US\"/></w:rPr><w:t>{protocol.year}</w:t>";
    xml = xml.replace(titleYearPattern, replacement);
  }
  // measurement date — appears twice with identical text
  // We need to replace BOTH; replaceWtExact disallows multiple. Do manually.
  {
    const target = "<w:t>\u00ab10\u00bb \u0430\u043f\u0440\u0435\u043b\u044f 2026 \u0433.</w:t>";
    const repl =
      '<w:t xml:space="preserve">\u00ab{measurementDate.day}\u00bb {measurementDate.month} {measurementDate.year} \u0433.</w:t>';
    const count = xml.split(target).length - 1;
    if (count !== 2) {
      throw new Error(`Expected 2 occurrences of measurement date, got ${count}`);
    }
    xml = xml.split(target).join(repl);
  }
  // customer ТОО «KazEcoFood», …
  xml = replaceWtExact(
    xml,
    "\u0422\u041e\u041e \u00abKazEcoFood\u00bb, \u0410\u043b\u043c\u0430\u043d\u0438\u0441\u043a\u0430\u044f \u043e\u0431\u043b, \u041a\u0430\u0440\u0430\u0441\u0430\u0439\u0441\u043a\u0438\u0439 \u0440\u0430\u0439\u043e\u043d, \u0441\u0435\u043b\u043e \u041a\u043e\u043a\u043e\u0437\u0435\u043a, \u0443\u043b\u0438\u0446\u0430 \u041d\u0435\u0441\u0438\u0431\u0435\u043b\u0438, 715",
    "\u0422\u041e\u041e \u00ab{customer.name}\u00bb, {customer.address}"
  );
  // purpose
  xml = replaceWtExact(
    xml,
    "\u0410\u0442\u0442\u0435\u0441\u0442\u0430\u0446\u0438\u044f \u0440\u0430\u0431\u043e\u0447\u0438\u0445 \u043c\u0435\u0441\u0442",
    "{purpose}"
  );
  // methodologyStandard — original has NBSP between "ISO" and "9612"
  xml = replaceWtExact(xml, "\u0413\u041e\u0421\u0422 ISO\u00a09612-2016", "{methodologyStandard}");
  // productStandard — collapse split runs into a single run with placeholder.
  // The original has 4 runs in a row: «Приказ … № Қ» + «Р» + « ДСМ-15. » +
  // «Об утверждении …». Replace all of them with a single run that keeps
  // the first run's <w:rPr> intact.
  {
    const prikazAnchor =
      "\u041f\u0440\u0438\u043a\u0430\u0437 \u041c\u0438\u043d\u0438\u0441\u0442\u0440\u0430";
    const startTextIdx = xml.indexOf(prikazAnchor);
    if (startTextIdx === -1) throw new Error("productStandard anchor not found");
    const runStart = xml.lastIndexOf("<w:r ", startTextIdx);
    const paragraphEnd = xml.indexOf("</w:p>", startTextIdx);
    if (runStart === -1 || paragraphEnd === -1)
      throw new Error("productStandard run boundaries not found");
    // Find end of the LAST <w:r> within this paragraph (just before </w:p>).
    const lastRunEnd = paragraphEnd;
    const segment = xml.slice(runStart, lastRunEnd);
    // Extract the FIRST run's <w:rPr>…</w:rPr> to keep formatting.
    const rPrMatch = segment.match(/<w:rPr>[\s\S]*?<\/w:rPr>/);
    const rPr = rPrMatch ? rPrMatch[0] : "";
    const replacement = `<w:r>${rPr}<w:t xml:space="preserve">{productStandard}</w:t></w:r>`;
    xml = xml.slice(0, runStart) + replacement + xml.slice(lastRunEnd);
  }
  // representative
  xml = replaceWtExact(xml, "\u0411\u043e\u0433\u0430\u0447\u0435\u0432 \u0410.\u0418.", "{representative}");
  // performer / director (in footer)
  xml = replaceWtExact(xml, "\u0414\u044c\u044f\u0447\u0435\u043d\u043a\u043e \u0418.\u0421.", "{performer.fullName}");
  // "Заведующий лабораторией" preceded by ~17 spaces — find by suffix
  {
    const re = /<w:t xml:space="preserve">(\s+\u0417\u0430\u0432\u0435\u0434\u0443\u044e\u0449\u0438\u0439 \u043b\u0430\u0431\u043e\u0440\u0430\u0442\u043e\u0440\u0438\u0435\u0439)<\/w:t>/g;
    const matches = [...xml.matchAll(re)];
    if (matches.length !== 1) {
      throw new Error(`Заведующий лабораторией: expected 1 match, got ${matches.length}`);
    }
    const leading = matches[0][1].match(/^\s+/)[0];
    xml = xml.replace(
      matches[0][0],
      `<w:t xml:space="preserve">${leading}{performer.position}</w:t>`
    );
  }
  xml = replaceWtExact(xml, "\u0414\u044c\u044f\u0447\u0435\u043d\u043a\u043e \u0412.\u0413.", "{director.fullName}");

  // ----- 2) measurement loops -----

  // The 27 cells per row map to these placeholders (null = empty cell).
  const PLACEHOLDERS = [
    "{rowNumber}", // 1
    "{pointNumber}", // 2
    "{place}", // 3 (gridSpan=2)
    "{time}", // 4
    "{ppePresent}", // 5
    "{ppeAbsent}", // 6
    "{sourceStationary}", // 7
    "{sourceNonStationary}", // 8
    "{oct31}", // 9
    "{oct63}", // 10
    "{oct125}", // 11
    "{oct250}", // 12
    "{oct500}", // 13
    "{oct1000}", // 14
    "{oct2000}", // 15
    "{oct4000}", // 16
    "{charBroadStationary}", // 17
    "{charBroadNonStationary}", // 18
    "{charBroadOscillating}", // 19
    "{charBroadImpulse}", // 20
    "{charTonalStationary}", // 21
    "{charTonalNonStationary}", // 22
    "{charTonalOscillating}", // 23
    "{charTonalImpulse}", // 24
    "{measured}", // 25 (LAэкв value)
    "{allowed}", // 26
  ];

  // Locate admin section row (anchor: "1. Административно – управленческий персонал")
  const adminSectionAnchor =
    "<w:t>1. \u0410\u0434\u043c\u0438\u043d\u0438\u0441\u0442\u0440\u0430\u0442\u0438\u0432\u043d\u043e \u2013 \u0443\u043f\u0440\u0430\u0432\u043b\u0435\u043d\u0447\u0435\u0441\u043a\u0438\u0439 \u043f\u0435\u0440\u0441\u043e\u043d\u0430\u043b</w:t>";
  const adminSection = locateRowByAnchor(xml, adminSectionAnchor);

  // Locate production section row (anchor: "2.  Производственный персонал")
  const prodSectionAnchor =
    "<w:t>2.  \u041f\u0440\u043e\u0438\u0437\u0432\u043e\u0434\u0441\u0442\u0432\u0435\u043d\u043d\u044b\u0439 \u043f\u0435\u0440\u0441\u043e\u043d\u0430\u043b</w:t>";
  const prodSection = locateRowByAnchor(xml, prodSectionAnchor);

  // Admin data rows: span from adminSection.end to prodSection.start
  // Production data rows: span from prodSection.end to "</w:tbl>"
  const tblCloseIdx = xml.indexOf("</w:tbl>", prodSection.end);
  if (tblCloseIdx === -1) throw new Error("</w:tbl> not found after production section");

  // Extract the first admin data row to use as the template row.
  const firstAdminRowStart = xml.indexOf("<w:tr ", adminSection.end);
  if (firstAdminRowStart === -1 || firstAdminRowStart >= prodSection.start) {
    throw new Error("No admin data row found between section rows");
  }
  const firstAdminRowEnd = findElementEnd(xml, "w:tr", firstAdminRowStart);
  const firstAdminRowXml = xml.slice(firstAdminRowStart, firstAdminRowEnd);

  // Count <w:tc> in this row to verify mapping size.
  const tcCount = (firstAdminRowXml.match(/<w:tc>/g) || []).length;
  // Adapt PLACEHOLDERS to actual count
  const placeholdersForRow = PLACEHOLDERS.slice(0, tcCount);
  while (placeholdersForRow.length < tcCount) placeholdersForRow.push(null);

  const templatedRow = templatizeRow(firstAdminRowXml, placeholdersForRow);

  // Build admin block: {#adminMeasurements} templatedRow {/adminMeasurements}
  // Place the loop tags INSIDE <w:t> elements before/after the row.
  // docxtemplater + paragraphLoop+linebreaks does not allow raw text between
  // <w:tr> elements (must be in <w:t>). We use the "row" template trick:
  // put the opening tag as the FIRST <w:t> inside the templated row and the
  // closing tag as the LAST <w:t>. With the row-replacement syntax (-w:tr),
  // docxtemplater removes the row when iterating empty arrays and duplicates
  // for each item.
  //
  // Format: {#adminMeasurements} on first <w:t>, suffix with the placeholder.
  // We'll prepend "{#adminMeasurements}" to the FIRST <w:t> content and
  // append "{/adminMeasurements}" to the LAST <w:t> content of the row.

  function wrapRowWithLoop(rowXml, openTag, closeTag) {
    // Find first real <w:t> element (NOT <w:tr, <w:tc, <w:tcPr, etc.)
    // Match <w:t> or <w:t followed by space/attributes (but not <w:tr, <w:tc, <w:tbl).
    const tOpenRe = /<w:t(?:\s[^>]*)?>/;
    const m = tOpenRe.exec(rowXml);
    if (!m) throw new Error("wrapRowWithLoop: no <w:t> found in row");
    const firstTContentStart = m.index + m[0].length;
    let out =
      rowXml.slice(0, firstTContentStart) +
      openTag +
      rowXml.slice(firstTContentStart);
    const lastTClose = out.lastIndexOf("</w:t>");
    out = out.slice(0, lastTClose) + closeTag + out.slice(lastTClose);
    return out;
  }

  const adminBlock = wrapRowWithLoop(
    templatedRow,
    "{#adminMeasurements}",
    "{/adminMeasurements}"
  );
  const prodBlock = wrapRowWithLoop(
    templatedRow,
    "{#productionMeasurements}",
    "{/productionMeasurements}"
  );

  // Replace admin data rows (from adminSection.end up to prodSection.start)
  // with the adminBlock. Then replace production data rows (from
  // prodSection.end up to </w:tbl>) with prodBlock.
  //
  // Care: we work right-to-left to keep indices valid.
  const newXml =
    xml.slice(0, adminSection.end) +
    adminBlock +
    xml.slice(prodSection.start, prodSection.end) +
    prodBlock +
    xml.slice(tblCloseIdx);

  // Persist
  zip.file("word/document.xml", newXml);
  const outDir = dirname(outPath);
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  writeFileSync(
    outPath,
    zip.generate({ type: "nodebuffer", mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" })
  );

  console.log(`✓ Built ${outPath}`);
  console.log(`  document.xml size: ${newXml.length} bytes`);
  console.log(`  cells per measurement row: ${tcCount}`);
}

main();
