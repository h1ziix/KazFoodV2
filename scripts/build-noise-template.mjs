// Build noise-protocol.docx template from the source noise DOCX file
// by injecting docxtemplater placeholders.
//
// Usage: node scripts/build-noise-template.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import PizZip from "pizzip";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const SRC_DOCX = path.join(
  ROOT,
  "8. \u0428\u0443\u043C \u041F\u0440\u043E\u0442-\u043B \u0438\u0437\u043C\u0435\u0440 kAZfOOD.docx",
);
// Resolve by glob if name differs
function findNoiseDocx() {
  if (fs.existsSync(SRC_DOCX)) return SRC_DOCX;
  const entries = fs.readdirSync(ROOT);
  const match = entries.find((f) => /^8\..*\.docx$/i.test(f));
  if (!match) throw new Error("Source noise DOCX (8.*.docx) not found in project root");
  return path.join(ROOT, match);
}

const OUT_DOCX = path.join(ROOT, "public", "templates", "noise-protocol.docx");

function read(p) {
  return fs.readFileSync(p);
}

// XML helpers ----------------------------------------------------------------

// Find indices of all <w:tr ...> ... </w:tr> blocks inside a fragment.
function findRows(xml) {
  const rows = [];
  const re = /<w:tr[ >][\s\S]*?<\/w:tr>/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    rows.push({ start: m.index, end: m.index + m[0].length, text: m[0] });
  }
  return rows;
}

// Split a row's inner XML into its <w:tc>...</w:tc> blocks.
function splitCells(rowXml) {
  const cells = [];
  const re = /<w:tc>[\s\S]*?<\/w:tc>/g;
  let m;
  while ((m = re.exec(rowXml)) !== null) {
    cells.push(m[0]);
  }
  return cells;
}

// Extract tcPr from a cell, return { tcPr, rest }.
function splitCellParts(cellXml) {
  const tcPrMatch = cellXml.match(/<w:tcPr>[\s\S]*?<\/w:tcPr>/);
  const tcPr = tcPrMatch ? tcPrMatch[0] : "";
  return { tcPr };
}

// Build a clean cell with a single paragraph containing a placeholder string.
function buildCell(tcPr, placeholder) {
  const safe = placeholder == null ? "" : String(placeholder);
  // Escape XML special chars in placeholder text (but braces are intentional).
  const escaped = safe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return (
    `<w:tc>${tcPr}` +
    `<w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:color w:val="000000"/></w:rPr></w:pPr>` +
    `<w:r><w:rPr><w:color w:val="000000"/></w:rPr><w:t xml:space="preserve">${escaped}</w:t></w:r>` +
    `</w:p></w:tc>`
  );
}

// Build a single-cell row (section header). gridSpan must match table width.
function buildSectionRow(templateRow, placeholder) {
  // Reuse the template row but replace inner text with our placeholder.
  // The original section row has one <w:tc> with the section name <w:t>.
  // Replace its <w:t>...</w:t> content.
  const escaped = placeholder
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return templateRow.replace(
    /<w:t(?:\s[^>]*)?>[\s\S]*?<\/w:t>/,
    `<w:t xml:space="preserve">${escaped}</w:t>`,
  );
}

// Replace the first occurrence of a literal Russian phrase inside a <w:t>...</w:t>
// element with a placeholder. The phrase may span multiple <w:t> runs; we
// attempt a best-effort by looking for it inside text nodes after collapsing.
function replaceTextInRun(xml, fragmentText, placeholder) {
  // Find every <w:t ...>text</w:t> occurrence; if text contains fragmentText,
  // replace text with placeholder.
  const re = /(<w:t(?:\s[^>]*)?>)([\s\S]*?)(<\/w:t>)/g;
  let replaced = false;
  const out = xml.replace(re, (full, open, text, close) => {
    if (replaced) return full;
    if (text.includes(fragmentText)) {
      replaced = true;
      return `${open}${text.replace(fragmentText, placeholder)}${close}`;
    }
    return full;
  });
  if (!replaced) {
    console.warn(`[warn] fragment not found, skipped: "${fragmentText}"`);
  }
  return out;
}

// Replace all simple <w:t> matches with placeholder for exact match
function replaceExactText(xml, exactText, placeholder) {
  const re = /(<w:t(?:\s[^>]*)?>)([\s\S]*?)(<\/w:t>)/g;
  let replaced = false;
  const out = xml.replace(re, (full, open, text, close) => {
    if (replaced) return full;
    if (text.trim() === exactText.trim()) {
      replaced = true;
      return `${open}${placeholder}${close}`;
    }
    return full;
  });
  if (!replaced) {
    console.warn(`[warn] exact text not found, skipped: "${exactText}"`);
  }
  return out;
}

// Main -----------------------------------------------------------------------

function main() {
  const src = findNoiseDocx();
  console.log(`Source: ${src}`);
  const buf = read(src);
  const zip = new PizZip(buf);
  let doc = zip.file("word/document.xml").asText();

  // 1. Replace header field values with placeholders.
  // From inspection of the source DOCX, the protocol header contains these
  // fixed-text fragments (Russian) that we substitute one-by-one.
  // Protocol number is split across runs ("1004 " | "-ШУМ" | " " | "202" | "6")
  // Replace using exact small-text matches with placeholders, blanking adjacent
  // runs so only one placeholder remains.
  const headerReplacements = [
    // Protocol number block: "1004 " + "-ШУМ," + " " + "202" + "6"
    ["1004 ", "{protocol.number}"],
    ["-ШУМ,", ""],
    ["202", ""],
    ["6", "{protocol.year}"],
    // Customer
    [
      "Алманиская обл, Карасайский район, село Кокозек, улица Несибели, 715",
      "{customer.address}",
    ],
    ["KazEcoFood", "{customer.name}"],
    // Personnel
    ["Богачев А.И.", "{representative}"],
    ["Аттестация рабочих мест", "{purpose}"],
    // Methodology standard appears as "ҚАЗ ISO\u00A09612-2016" in one run.
    ["ГОСТ ISO\u00A09612-2016", "{methodologyStandard}"],
    // Order text: blank out the runs that follow the start, keep first run as
    // the placeholder. Split runs: "Приказ ... 2022 года № Қ" | "Р" | " ДСМ-15. "
    [
      "Приказ Министра здравоохранения Республики Казахстан от 16 февраля 2022 года № Қ",
      "{productStandard}",
    ],
    ["Р", ""],
    [" ДСМ-15. ", ""],
    ["Дьяченко И.С.", "{performer.fullName}"],
    ["Заведующий лабораторией", "{performer.position}"],
    ["Дьяченко В.Г.", "{director.fullName}"],
  ];

  for (const [text, placeholder] of headerReplacements) {
    doc = replaceTextInRun(doc, text, placeholder);
  }

  // 2. Locate the measurement table and replace rows 5..end with templated
  //    rows controlled by docxtemplater loops.
  // Find first <w:tbl> that contains the SEQ field (the measurement table).
  const seqIdx = doc.indexOf("SEQ");
  const tblStart = doc.lastIndexOf("<w:tbl>", seqIdx);
  const tblEnd = doc.indexOf("</w:tbl>", seqIdx) + "</w:tbl>".length;
  if (tblStart < 0 || tblEnd < 0) throw new Error("Measurement table not found");

  const tblXml = doc.slice(tblStart, tblEnd);
  const rows = findRows(tblXml);
  if (rows.length < 6) throw new Error(`Unexpected row count: ${rows.length}`);

  // Keep rows 0..3 (image + headers), drop row 4 (first section header) and
  // everything after that we replace with our templated section+data rows.
  const keepRowsXml = rows
    .slice(0, 4)
    .map((r) => r.text)
    .join("");

  // Build section header template (reuse original row 5's structure).
  const sectionRowTemplate = buildSectionRow(
    rows[4].text,
    "{number}. {name}",
  );

  // Build data row template using row 6's cell structure (preserving tcPr).
  const dataRowOriginal = rows[5].text;
  const trOpenMatch = dataRowOriginal.match(/^<w:tr[^>]*>/);
  const trOpen = trOpenMatch ? trOpenMatch[0] : "<w:tr>";
  const cells = splitCells(dataRowOriginal);
  if (cells.length !== 26) {
    throw new Error(`Expected 26 cells in data row, got ${cells.length}`);
  }

  // Map placeholders to columns 1..26.
  // Column meaning (from spec inspection):
  //   1: rowNumber, 2: pointNumber, 3: place, 4: time,
  //   5: ppe ('+'/'-'), 6: ppeAbsent ('+'/'-'),
  //   7: sourceStationary, 8: sourceNonStationary,
  //   9..16: octave bands 31.5, 63, 125, 250, 500, 1000, 2000, 4000 Hz
  //   (col 16 is also used by 8000 Hz in source; we map oct[7] to col 16)
  //   17..18: character broadband (stationary / non-stationary)
  //   19..20: character broadband (oscillating / impulse)
  //   21..22: character tonal (stationary / non-stationary)
  //   23..24: character tonal (oscillating / impulse)
  //   25: measured (Lэкв)
  //   26: allowed
  const placeholders = [
    "{rowNumber}",
    "{pointNumber}",
    "{place}",
    "{time}",
    "{ppePresent}",
    "{ppeAbsent}",
    "{sourceStationary}",
    "{sourceNonStationary}",
    "{oct31}",
    "{oct63}",
    "{oct125}",
    "{oct250}",
    "{oct500}",
    "{oct1000}",
    "{oct2000}",
    "{oct4000}",
    "{charBroadStationary}",
    "{charBroadNonStationary}",
    "{charBroadOscillating}",
    "{charBroadImpulse}",
    "{charTonalStationary}",
    "{charTonalNonStationary}",
    "{charTonalOscillating}",
    "{charTonalImpulse}",
    "{measured}",
    "{allowed}",
  ];

  // Compose templated body with docxtemplater loop markers.
  //
  // Layout:
  //   [section row]  "{#measurements}{-w:tr showPlace}{placeNumber}. {placeName}{/}"
  //                  - {#measurements} starts the outer loop here
  //                  - the rest makes the row conditional on showPlace
  //   [data row]     "{rowNumber}|...|{allowed}{/measurements}"
  //                  - {/measurements} closes the outer loop here
  //
  // Docxtemplater expands the outer loop to span both rows because the open
  // and close tags live in separate <w:tr> elements.

  // Section header row: starts the measurements loop, then conditional.
  const sectionRowConditional = buildSectionRow(
    rows[4].text,
    "{#measurements}{-w:tr showPlace}{placeNumber}. {placeName}{/}",
  );

  // Build data row with placeholders; close the measurements loop in the
  // last cell.
  const cellsForLoop = placeholders.slice();
  cellsForLoop[cellsForLoop.length - 1] =
    `${cellsForLoop[cellsForLoop.length - 1]}{/measurements}`;

  const newDataRow = `${trOpen}${cells
    .map((cell, i) => {
      const { tcPr } = splitCellParts(cell);
      return buildCell(tcPr, cellsForLoop[i]);
    })
    .join("")}</w:tr>`;

  // Reassemble table.
  const newTblInner = keepRowsXml + sectionRowConditional + newDataRow;
  // Need to preserve the original tbl wrapper + tblPr/tblGrid. Find them.
  const tblOpenMatch = tblXml.match(/^<w:tbl>([\s\S]*?)<w:tr[ >]/);
  if (!tblOpenMatch) throw new Error("Cannot parse table opening");
  const tblHeader = tblOpenMatch[1]; // tblPr + tblGrid
  const newTbl = `<w:tbl>${tblHeader}${newTblInner}</w:tbl>`;

  doc = doc.slice(0, tblStart) + newTbl + doc.slice(tblEnd);

  // 3. Replace measurement date placeholders. The source contains literal
  // text "<10> апреля 2026 г." inside <w:t>. Note: the source actually has
  // unescaped "<10>" inside the text node (technically malformed XML). We
  // operate on <w:t> blocks with a regex that allows <10> as inner text.
  doc = doc.replace(
    /(<w:t(?:\s[^>]*)?>)((?:[^<]|<\d)*?)(<\/w:t>)/g,
    (full, open, text, close) => {
      let next = text;
      if (next.includes("«10»")) {
        next = next.replace("«10»", "{measurementDate.day}");
      }
      if (next.includes("апреля")) {
        next = next.replace("апреля", "{measurementDate.month}");
      }
      if (next.includes("2026 г.")) {
        next = next.replace("2026 г.", "{measurementDate.year} г.");
      }
      return next === text ? full : `${open}${next}${close}`;
    },
  );

  // Write the modified document.xml back into the zip
  zip.file("word/document.xml", doc);

  // Ensure output directory exists
  const outDir = path.dirname(OUT_DOCX);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outBuf = zip.generate({ type: "nodebuffer" });
  fs.writeFileSync(OUT_DOCX, outBuf);
  console.log(`Wrote: ${OUT_DOCX} (${outBuf.length} bytes)`);
}

main();
