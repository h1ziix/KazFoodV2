/**
 * Builds public/templates/siz-protocol.docx from the ORIGINAL reference
 * "13. СИЗ каз-рус ГОТОВо kazfood.docx" via surgical XML edits on the
 * existing word/document.xml.
 *
 * Strategy mirrors scripts/build-safety-template.mjs:
 *   - The ORIGINAL DOCX is the structural source-of-truth.
 *   - We do NOT rebuild document.xml. We only:
 *       * replace inner text of existing <w:t> nodes with placeholders;
 *       * collapse the MERGEFIELD «дата проведения» run group into a
 *         single placeholder run, preserving its <w:rPr>;
 *       * replace each data row's cell paragraphs with a single
 *         placeholder run (keeping the cell's <w:tcPr> intact);
 *       * wrap the admin row block with {#adminRows}..{/adminRows} and
 *         the production row block with {#productionRows}..{/productionRows}.
 *   - The page setup, header1.xml ("Приложение № 5 к Приказу МЗ РК 1057
 *     от 28.12.2015г."), styles, numbering, fonts, table geometry,
 *     paragraph properties, run formatting, borders, widths, merged
 *     cells, footer/signature layout and all spacing are preserved
 *     exactly because the entire docx package is reused.
 *
 * Run: node scripts/build-siz-template.js
 */

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

/**
 * Replace the text inside an EXACT <w:t>oldText</w:t> match.
 * The match must be unique inside `xml`; otherwise throws (caller
 * should pick a more specific anchor).
 */
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

/**
 * Locate a <w:tr> by an anchor string contained somewhere inside it.
 * Returns { start, end } byte offsets.
 */
function locateRowByAnchor(xml, anchor, fromIdx = 0) {
  const ai = xml.indexOf(anchor, fromIdx);
  if (ai === -1) throw new Error(`Anchor not found: ${anchor.slice(0, 80)}`);
  const start = xml.lastIndexOf("<w:tr ", ai);
  if (start === -1) throw new Error("<w:tr> before anchor not found");
  const end = findElementEnd(xml, "w:tr", start);
  return { start, end };
}

/**
 * Inside one <w:tc>...</w:tc> XML chunk, REPLACE all paragraphs with a
 * single <w:p> that reuses the FIRST paragraph's <w:pPr> and the FIRST
 * run's <w:rPr>, containing a single <w:t> with `placeholder`.
 *
 * If placeholder === null, leaves a single empty paragraph (used when a
 * cell should render as empty during loop iteration but exists in the
 * row template).
 *
 * Critically: <w:tcPr> (width, gridSpan, vMerge, borders, vAlign,
 * shading) is left untouched.
 */
function rewriteCellText(cellXml, placeholder) {
  // Locate <w:tcPr>...</w:tcPr> end (everything before the FIRST <w:p>)
  const pStart1 = cellXml.indexOf("<w:p ");
  const pStart2 = cellXml.indexOf("<w:p>");
  const firstP =
    pStart1 !== -1 && (pStart2 === -1 || pStart1 < pStart2) ? pStart1 : pStart2;
  if (firstP === -1) return cellXml; // nothing to do
  const header = cellXml.slice(0, firstP);
  const tcClose = cellXml.lastIndexOf("</w:tc>");
  const tail = cellXml.slice(tcClose);

  // First <w:p ...> tag opening (we keep its attributes if any)
  const pTagEnd = cellXml.indexOf(">", firstP) + 1;
  const pOpen = cellXml.slice(firstP, pTagEnd);

  // Capture the first <w:pPr>...</w:pPr> if present inside the first <w:p>
  let pPr = "";
  const pPrStart = cellXml.indexOf("<w:pPr>", firstP);
  if (pPrStart !== -1) {
    const firstPClose = cellXml.indexOf("</w:p>", firstP);
    if (pPrStart < firstPClose) {
      const pPrEnd = findElementEnd(cellXml, "w:pPr", pPrStart);
      pPr = cellXml.slice(pPrStart, pPrEnd);
    }
  }

  // Capture the first <w:rPr>...</w:rPr> from the first non-pPr run
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

/**
 * Replace every <w:tc> body in a row with the corresponding placeholder
 * (or null to leave empty). `placeholders.length` must equal the number
 * of <w:tc> cells in the row.
 */
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
 * before the LAST </w:t> closing inside `blockXml`. This is the trick
 * used by build-safety-template.mjs to wrap a multi-row block in a
 * docxtemplater loop without splitting any paragraph or run.
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

function main() {
  if (!fs.existsSync(ORIGINAL))
    throw new Error(`Original СИЗ DOCX not found: ${ORIGINAL}`);

  const zip = new PizZip(fs.readFileSync(ORIGINAL));
  const docFile = zip.file("word/document.xml");
  if (!docFile) throw new Error("word/document.xml missing in original");
  let xml = docFile.asText();

  // A) Top-level placeholders OUTSIDE the data row block
  xml = injectTopLevelPlaceholders(xml);

  // B) Templatize the data rows of the main table (admin + production)
  xml = templatizeMainTable(xml);

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

// ---------- A) top-level injection ----------

function injectTopLevelPlaceholders(xml) {
  // A.1) Protocol number appears twice in the title block:
  //   "№1 " (Kazakh title: "№1 ХАТТАМАСЫ")  — UNIQUE
  //   " №1" (Russian title: "ПРОТОКОЛ №1")  — UNIQUE
  xml = replaceWtExact(xml, "\u21161 ", "\u2116{protocol.number} ");
  xml = replaceWtExact(xml, " \u21161", " \u2116{protocol.number}");

  // A.2) Customer name + address — appears as ONE single <w:t> in the
  // "Тапсырыс берушінің атауы..." paragraph.
  xml = replaceWtExact(
    xml,
    "\u0422\u041e\u041e \u00abKazEcoFood\u00bb, \u0410\u043b\u043c\u0430\u043d\u0438\u0441\u043a\u0430\u044f \u043e\u0431\u043b, \u041a\u0430\u0440\u0430\u0441\u0430\u0439\u0441\u043a\u0438\u0439 \u0440\u0430\u0439\u043e\u043d, \u0441\u0435\u043b\u043e \u041a\u043e\u043a\u043e\u0437\u0435\u043a, \u0443\u043b\u0438\u0446\u0430 \u041d\u0435\u0441\u0438\u0431\u0435\u043b\u0438, 715",
    "\u0422\u041e\u041e \u00ab{customer.name}\u00bb, {customer.address}",
  );

  // A.3) measurementPlace — the "Өлшеу жүргізу орны" paragraph splits
  // its text across many runs. Collapse the run sequence that starts
  // with "ТОО «" and ends with ", 715" into a single placeholder run.
  xml = collapseMeasurementPlaceRuns(xml);

  // A.4) Date — original is plain text "«10» апреля 2026 г." (no
  // MERGEFIELD in this template). Replace via a single <w:t>.
  xml = replaceWtExact(
    xml,
    "\u00ab10\u00bb \u0430\u043f\u0440\u0435\u043b\u044f 2026 \u0433.",
    "\u00ab{measurementDate.day}\u00bb {measurementDate.month} {measurementDate.year} \u0433.",
  );

  // A.5) Signature/footer block (paragraphs after the main table).
  //   - "Исаева А.В."  -> {performer.fullName}
  xml = replaceWtExact(
    xml,
    "\u0418\u0441\u0430\u0435\u0432\u0430 \u0410.\u0412.",
    "{performer.fullName}",
  );
  //   - "Зертхананың аға маманы" -> single <w:t> Kazakh performer position?
  // The schema only has performer.position (Russian); we leave the
  // Kazakh static text untouched to preserve the visual layout and
  // inject the Russian position by replacing the existing run that
  // contains "ертхананың аға маманы" (… no, that's Kazakh text). The
  // original document has, on the LAST paragraph of the performer
  // line, the Russian fragment split as "Старший с" + "пециалист лабо"
  // + "ратории". Collapse those three consecutive <w:t> values to a
  // single placeholder.
  xml = collapsePerformerPositionRussian(xml);

  //   - representative.fullName "Богачев А.И."
  xml = replaceWtExact(
    xml,
    "\u0411\u043e\u0433\u0430\u0447\u0435\u0432 \u0410.\u0418.",
    "{representative.fullName}",
  );
  //   - representative.position is split: "Начальник по " + "БиОТ".
  // Replace the first with the placeholder and blank the second.
  xml = replaceWtExact(
    xml,
    "\u041d\u0430\u0447\u0430\u043b\u044c\u043d\u0438\u043a \u043f\u043e ",
    "{representative.position}",
  );
  xml = replaceWtExact(xml, "\u0411\u0438\u041e\u0422", "");

  return xml;
}

/**
 * The "Өлшеу жүргізу орны (место проведения оценки): ТОО «KazEcoFood», …,
 * 715" paragraph fragments the value text across many runs. Find the
 * first run whose <w:t> starts with "ТОО «" AND the run sequence ends
 * with the <w:t>", 715"</w:t>, then collapse that range to a single run
 * carrying the FIRST run's <w:rPr> and the placeholder.
 */
function collapseMeasurementPlaceRuns(xml) {
  const firstAnchor = '<w:t xml:space="preserve">\u0422\u041e\u041e \u00ab</w:t>';
  let firstIdx = xml.indexOf(firstAnchor);
  if (firstIdx === -1) {
    // try the variant without xml:space
    const alt = "<w:t>\u0422\u041e\u041e \u00ab</w:t>";
    firstIdx = xml.indexOf(alt);
    if (firstIdx === -1)
      throw new Error("collapseMeasurementPlaceRuns: 'ТОО «' anchor not found");
  }
  // The run that contains this <w:t> starts a bit before.
  const firstRunStart = xml.lastIndexOf("<w:r>", firstIdx);
  const firstRunStartAttr = xml.lastIndexOf("<w:r ", firstIdx);
  const runStart = Math.max(firstRunStart, firstRunStartAttr);
  if (runStart === -1)
    throw new Error("collapseMeasurementPlaceRuns: enclosing <w:r> not found");
  const runEnd = findElementEnd(xml, "w:r", runStart);
  const firstRunXml = xml.slice(runStart, runEnd);
  const rPrMatch = firstRunXml.match(/<w:rPr>[\s\S]*?<\/w:rPr>/);
  const rPr = rPrMatch ? rPrMatch[0] : "";

  // Locate end run: the one containing <w:t...>, 715</w:t>
  const endAnchor1 = '<w:t xml:space="preserve">, 715</w:t>';
  const endAnchor2 = "<w:t>, 715</w:t>";
  let endTextIdx = xml.indexOf(endAnchor1, runStart);
  if (endTextIdx === -1) endTextIdx = xml.indexOf(endAnchor2, runStart);
  if (endTextIdx === -1)
    throw new Error("collapseMeasurementPlaceRuns: ', 715' anchor not found");
  // End of enclosing run
  const lastRunCloseEnd =
    xml.indexOf("</w:r>", endTextIdx) + "</w:r>".length;

  const replacement = `<w:r>${rPr}<w:t xml:space="preserve">{measurementPlace}</w:t></w:r>`;
  return xml.slice(0, runStart) + replacement + xml.slice(lastRunCloseEnd);
}

/**
 * Collapse the three Russian fragments of the performer position:
 *   "Старший с" + "пециалист лабо" + "ратории"
 * into a single run with {performer.position}, preserving the first
 * fragment's <w:rPr>.
 */
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

// ---------- B) main table ----------

/**
 * Templatize the main PPE table:
 *   - section header rows ("1. Администрация..." and "2. Производственный...")
 *     are kept VERBATIM (their bilingual styling is part of the original
 *     visual layout);
 *   - all 13 admin data rows (rows under "1. Администрация...") are
 *     replaced by ONE templated row wrapped with
 *     {#adminRows}...{/adminRows};
 *   - all 18 production data rows (rows under "2. Производственный...")
 *     are replaced by ONE templated row wrapped with
 *     {#productionRows}...{/productionRows}.
 *
 * Cell layouts differ between admin (6 cells, merged norm/issued/cert
 * spans) and production (8 cells, every column distinct), so we use the
 * FIRST data row of each section as the template for that section.
 */
function templatizeMainTable(xml) {
  // Locate the two section header rows
  const adminSecAnchor =
    "<w:t>1. </w:t>"; // unique enough? probably not — disambiguate by combining with "Администрация"
  // Instead, find "Администрация" as text fragment.
  const adminAnchor = "\u0410\u0434\u043c\u0438\u043d\u0438\u0441\u0442\u0440\u0430\u0446\u0438\u044f"; // "Администрация"
  // "Производственный" is split as "П" + "роизводственный" in the
  // original XML. Use the suffix as anchor.
  const prodAnchor = "\u0440\u043e\u0438\u0437\u0432\u043e\u0434\u0441\u0442\u0432\u0435\u043d\u043d\u044b\u0439"; // "роизводственный"

  const adminSec = locateRowByAnchor(xml, adminAnchor);
  const prodSec = locateRowByAnchor(xml, prodAnchor, adminSec.end);

  // Find the end of the enclosing <w:tbl> (after prodSec)
  const tblCloseIdx = xml.indexOf("</w:tbl>", prodSec.end);
  if (tblCloseIdx === -1)
    throw new Error("</w:tbl> not found after prod section row");

  // FIRST admin data row sits right after adminSec.end
  const adminRowStart = xml.indexOf("<w:tr ", adminSec.end);
  if (adminRowStart === -1 || adminRowStart >= prodSec.start)
    throw new Error("No admin data row found");
  const adminRowEnd = findElementEnd(xml, "w:tr", adminRowStart);
  const adminRowXml = xml.slice(adminRowStart, adminRowEnd);

  // FIRST production data row sits right after prodSec.end
  const prodRowStart = xml.indexOf("<w:tr ", prodSec.end);
  if (prodRowStart === -1 || prodRowStart >= tblCloseIdx)
    throw new Error("No production data row found");
  const prodRowEnd = findElementEnd(xml, "w:tr", prodRowStart);
  const prodRowXml = xml.slice(prodRowStart, prodRowEnd);

  // Admin row has 6 cells:
  //   [code, position(gridSpan=2), count, normItems(gridSpan=3), assessment, note]
  // Production row has 8 cells:
  //   [code, position(gridSpan=2), count, normItems, issuedFact, certificate, assessment, note]
  const ADMIN_PH = [
    "{code}",
    "{position}",
    "{count}",
    "{normItems}",
    "{assessment}",
    "{note}",
  ];
  const PROD_PH = [
    "{code}",
    "{position}",
    "{count}",
    "{normItems}",
    "{issuedFact}",
    "{certificate}",
    "{assessment}",
    "{note}",
  ];

  const adminRowT = templatizeRow(adminRowXml, ADMIN_PH);
  const prodRowT = templatizeRow(prodRowXml, PROD_PH);

  const adminBlock = wrapBlockWithLoop(
    adminRowT,
    "{#adminRows}",
    "{/adminRows}",
  );
  const prodBlock = wrapBlockWithLoop(
    prodRowT,
    "{#productionRows}",
    "{/productionRows}",
  );

  // Splice:
  //   [..adminSec.end]   -> keep
  //   [adminSec.end..prodSec.start]   -> replace with adminBlock
  //   [prodSec.start..prodSec.end]   -> keep
  //   [prodSec.end..tblCloseIdx]   -> replace with prodBlock
  //   [tblCloseIdx..]   -> keep
  return (
    xml.slice(0, adminSec.end) +
    adminBlock +
    xml.slice(prodSec.start, prodSec.end) +
    prodBlock +
    xml.slice(tblCloseIdx)
  );
}

main();
