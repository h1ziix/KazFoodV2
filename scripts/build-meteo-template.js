// Build meteo-protocol.docx template from the source meteo DOCX (file №5)
// by injecting docxtemplater placeholders.
//
// Architecture (mirrors scripts/build-noise-template.mjs but tightened):
//   1. Replace header literal phrases with {placeholder} text ONLY inside
//      the body region between the end of the first table (which is the
//      laboratory accreditation header — must remain intact) and the start
//      of the second table (the measurements table). This avoids hijacking
//      short tokens like "9", "4", "6", "Р" that also occur in the lab
//      header.
//   2. Replace the measurement-date occurrence in the "Дата проведения
//      измерений" line via a final pass over all <w:t> nodes — the protocol
//      header date was already consumed by step 1.
//   3. Rebuild the measurements table: keep first 3 header rows, drop the
//      rest, append a section-header row that opens {#measurements} and a
//      cleaned-up data row that closes it.
//
// Usage: node scripts/build-meteo-template.js

const fs = require("node:fs");
const path = require("node:path");
const PizZip = require("pizzip");

const ROOT = path.resolve(__dirname, "..");

function findMeteoDocx() {
  const entries = fs.readdirSync(ROOT);
  const match = entries.find((f) => /^5\..*\.docx$/i.test(f));
  if (!match) {
    throw new Error(
      "Source meteo DOCX (5.*.docx) not found in project root",
    );
  }
  return path.join(ROOT, match);
}

const OUT_DOCX = path.join(
  ROOT,
  "public",
  "templates",
  "meteo-protocol.docx",
);

function read(p) {
  return fs.readFileSync(p);
}

// XML helpers ----------------------------------------------------------------

function findRows(xml) {
  const rows = [];
  const re = /<w:tr[ >][\s\S]*?<\/w:tr>/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    rows.push({ start: m.index, end: m.index + m[0].length, text: m[0] });
  }
  return rows;
}

function splitCells(rowXml) {
  const cells = [];
  const re = /<w:tc>[\s\S]*?<\/w:tc>/g;
  let m;
  while ((m = re.exec(rowXml)) !== null) {
    cells.push(m[0]);
  }
  return cells;
}

function splitCellParts(cellXml) {
  const tcPrMatch = cellXml.match(/<w:tcPr>[\s\S]*?<\/w:tcPr>/);
  const tcPr = tcPrMatch ? tcPrMatch[0] : "";
  return { tcPr };
}

function buildCell(tcPr, placeholder) {
  const safe = placeholder == null ? "" : String(placeholder);
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

function buildSectionRow(templateRow, placeholder) {
  const escaped = placeholder
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return templateRow.replace(
    /<w:t(?:\s[^>]*)?>[\s\S]*?<\/w:t>/,
    `<w:t xml:space="preserve">${escaped}</w:t>`,
  );
}

// Replace the first <w:t>...</w:t> whose text contains fragmentText, but
// only within the [startIdx, endIdx) slice of xml. Returns the new full xml.
// `endIdx` may shift after replacement; callers re-resolve boundaries when
// needed (we recompute them per call by tracking the second-table marker).
function replaceTextInRunWithinRegion(xml, startIdx, endIdx, fragmentText, placeholder) {
  const region = xml.slice(startIdx, endIdx);
  let replaced = false;
  let newPart = region;
  const re = /(<w:t(?:\s[^>]*)?>)([\s\S]*?)(<\/w:t>)/g;
  newPart = region.replace(re, (full, open, text, close) => {
    if (replaced) return full;
    if (text.includes(fragmentText)) {
      replaced = true;
      return `${open}${text.replace(fragmentText, placeholder)}${close}`;
    }
    return full;
  });
  if (!replaced) {
    console.warn(`[warn] fragment not found in header region: "${fragmentText}"`);
    return xml;
  }
  return xml.slice(0, startIdx) + newPart + xml.slice(endIdx);
}

// Like replaceTextInRunWithinRegion but matches only runs whose ENTIRE
// text equals fragmentText (not substring). Required for short tokens
// like "6", "9", "4" that would otherwise hijack longer literals such as
// "«10» апреля 2026 г.".
function replaceExactRunWithinRegion(xml, startIdx, endIdx, exactText, placeholder) {
  const region = xml.slice(startIdx, endIdx);
  let replaced = false;
  const re = /(<w:t(?:\s[^>]*)?>)([\s\S]*?)(<\/w:t>)/g;
  const newPart = region.replace(re, (full, open, text, close) => {
    if (replaced) return full;
    if (text === exactText) {
      replaced = true;
      return `${open}${placeholder}${close}`;
    }
    return full;
  });
  if (!replaced) {
    console.warn(`[warn] exact run not found in region: "${exactText}"`);
    return xml;
  }
  return xml.slice(0, startIdx) + newPart + xml.slice(endIdx);
}

// Main -----------------------------------------------------------------------

function main() {
  const src = findMeteoDocx();
  console.log(`Source: ${src}`);
  const buf = read(src);
  const zip = new PizZip(buf);
  let doc = zip.file("word/document.xml").asText();

  // Determine header region: between end of first <w:tbl> (lab header table)
  // and start of the SECOND <w:tbl> (measurements table).
  const firstTblCloseEnd = doc.indexOf("</w:tbl>") + "</w:tbl>".length;
  if (firstTblCloseEnd <= 8) {
    throw new Error("First table not found");
  }
  const secondTblStart = doc.indexOf("<w:tbl>", firstTblCloseEnd);
  if (secondTblStart < 0) {
    throw new Error("Second table (measurements) not found");
  }

  // 1. Header text replacements within [firstTblCloseEnd, secondTblStart).
  //    Each entry is [text, placeholder, mode]. mode='exact' matches only
  //    runs whose ENTIRE <w:t> text equals `text` (use for short tokens
  //    that could match anywhere). Otherwise substring match is used.
  //    Order matters — only the first matching run is replaced per call.
  const headerReplacements = [
    // --- Protocol number block ---
    // Runs: " 1004" | "-МЕТ" | ", " (stays) | "202" | "6" | ...
    [" 1004", "{protocol.number}", "substring"],
    ["-МЕТ", "", "substring"],
    ["202", "", "exact"],
    ["6", "{protocol.year}", "exact"],

    // --- Protocol header date "«10» апреля 2026 г." (entire run) ---
    // SAME literal also appears in the "Дата проведения измерений" line —
    // we replace the first occurrence here; the second is handled by the
    // body-wide pass at the end of this script.
    [
      "«10» апреля 2026 г.",
      "{protocol.day} {protocol.month} {protocol.dateYear} г.",
      "exact",
    ],

    // --- Customer ---
    // Runs in source: "ТОО «Kaz" | "EcoFood», ..., 715".
    // Replace the long address-bearing run first, then the "Kaz" tail
    // inside the "ТОО «Kaz" run.
    [
      "EcoFood», Алманиская обл, Карасайский район, село Кокозек, улица Несибели, 715",
      "», {customer.address}",
      "substring",
    ],
    ["Kaz", "{customer.name}", "substring"],

    // --- Other metadata ---
    ["Аттестация рабочих мест", "{purpose}", "substring"],
    ["ГОСТ 30494-2011.", "{methodologyStandard}", "substring"],
    // productStandard is split across 4 runs; collapse into the first.
    [
      "Приказ Министра здравоохранения Республики Казахстан от 16 февраля 2022 года № Қ",
      "{productStandard}",
      "substring",
    ],
    ["Р", "", "exact"],
    [" ДСМ-15. ", "", "substring"],
    [
      "«Об утверждении гигиенических нормативов к физическим факторам, оказывающим воздействие на человека»",
      "",
      "substring",
    ],
    ["Богачев А.И.", "{representative}", "substring"],
    [
      "Административное помещение, производственное помещение, складское помещение, автомастерская (грузовая),  помещение лаборатории, кухня. ",
      "{roomDescription}",
      "substring",
    ],

    // --- Conditions block (а / б / в) ---
    [" 16", " {conditions.t}", "exact"],
    ["52%", "{conditions.h}%", "exact"],
    // Pressure: three short runs "6","9","4" — replaced as exact runs.
    ["6", "", "exact"],
    ["9", "", "exact"],
    ["4", "{conditions.p}", "exact"],
  ];

  for (const [text, placeholder, mode] of headerReplacements) {
    const newSecondTblStart = doc.indexOf("<w:tbl>", firstTblCloseEnd);
    if (mode === "exact") {
      doc = replaceExactRunWithinRegion(
        doc,
        firstTblCloseEnd,
        newSecondTblStart,
        text,
        placeholder,
      );
    } else {
      doc = replaceTextInRunWithinRegion(
        doc,
        firstTblCloseEnd,
        newSecondTblStart,
        text,
        placeholder,
      );
    }
  }

  // 1b. Signature block replacements live AFTER the measurements table,
  //     so we apply them over the full remaining-document scope. Each
  //     literal is unique in the whole DOCX.
  const signatureReplacements = [
    ["Дьяченко И.С.", "{performer.fullName}"],
    ["Заведующий лабораторией", "{performer.position}"],
    ["Дьяченко В.Г.", "{director.fullName}"],
  ];
  for (const [text, placeholder] of signatureReplacements) {
    doc = replaceTextInRunWithinRegion(doc, 0, doc.length, text, placeholder);
  }

  // 2. Rebuild measurements table.
  const seqIdx = doc.indexOf("SEQ");
  if (seqIdx < 0) throw new Error("SEQ field not found in document.xml");
  const tblStart = doc.lastIndexOf("<w:tbl>", seqIdx);
  const tblEnd = doc.indexOf("</w:tbl>", seqIdx) + "</w:tbl>".length;
  if (tblStart < 0 || tblEnd < 0) {
    throw new Error("Measurement table not found");
  }

  const tblXml = doc.slice(tblStart, tblEnd);
  const rows = findRows(tblXml);
  if (rows.length < 5) {
    throw new Error(`Unexpected row count: ${rows.length}`);
  }

  // Keep rows 0..2 (3 header rows). Row 3 = first section header, row 4 =
  // first data row.
  const keepRowsXml = rows
    .slice(0, 3)
    .map((r) => r.text)
    .join("");

  // Templated section header row — opens the {#measurements} loop and is
  // rendered only when {showPlace} is truthy (first measurement of each
  // place).
  const sectionRowConditional = buildSectionRow(
    rows[3].text,
    "{#measurements}{-w:tr showPlace}{placeNumber}. {placeName}{/}",
  );

  // Rebuild data row from scratch, preserving each cell's <w:tcPr>.
  const dataRowOriginal = rows[4].text;
  const trOpenMatch = dataRowOriginal.match(/^<w:tr[^>]*>/);
  const trOpen = trOpenMatch ? trOpenMatch[0] : "<w:tr>";
  const cells = splitCells(dataRowOriginal);
  if (cells.length !== 12) {
    throw new Error(`Expected 12 cells in data row, got ${cells.length}`);
  }

  // Column layout (12 columns total):
  //   1: rowNumber          (SEQ Протокол in source — gets reset)
  //   2: pointNumber        (e.g. "1т")
  //   3: place              (profession name)
  //   4: workCategory       ("Iб" / "IIб" / ...)
  //   5: timeOfDay          ("день" / "ночь")
  //   6: tempMeasured       (ºС)
  //   7: tempAllowed        (ºС range like "21-28")
  //   8: humidityMeasured   (%)
  //   9: humidityAllowed    (%)
  //  10: airSpeedMeasured   (m/s)
  //  11: airSpeedAllowed    (m/s)
  //  12: pressure           (mm Hg)
  const placeholders = [
    "{rowNumber}",
    "{pointNumber}",
    "{place}",
    "{workCategory}",
    "{timeOfDay}",
    "{tempMeasured}",
    "{tempAllowed}",
    "{humidityMeasured}",
    "{humidityAllowed}",
    "{airSpeedMeasured}",
    "{airSpeedAllowed}",
    "{pressure}",
  ];

  const cellsForLoop = placeholders.slice();
  cellsForLoop[cellsForLoop.length - 1] =
    `${cellsForLoop[cellsForLoop.length - 1]}{/measurements}`;

  const newDataRow = `${trOpen}${cells
    .map((cell, i) => {
      const { tcPr } = splitCellParts(cell);
      return buildCell(tcPr, cellsForLoop[i]);
    })
    .join("")}</w:tr>`;

  const tblOpenMatch = tblXml.match(/^<w:tbl>([\s\S]*?)<w:tr[ >]/);
  if (!tblOpenMatch) throw new Error("Cannot parse table opening");
  const tblHeader = tblOpenMatch[1];
  const newTbl =
    `<w:tbl>${tblHeader}${keepRowsXml}${sectionRowConditional}${newDataRow}</w:tbl>`;

  doc = doc.slice(0, tblStart) + newTbl + doc.slice(tblEnd);

  // 3. Replace the REMAINING measurement-date occurrence (the one in the
  //    "Дата проведения измерений" line). The protocol-header date was
  //    already converted to {protocol.*} placeholders by step 1, so the
  //    body-wide regex now hits only the second literal.
  doc = doc.replace(
    /(<w:t(?:\s[^>]*)?>)([\s\S]*?)(<\/w:t>)/g,
    (full, open, text, close) => {
      let next = text;
      if (next.includes("«10»")) {
        next = next.replace(/«10»/g, "{measurementDate.day}");
      }
      if (next.includes("апреля")) {
        next = next.replace(/апреля/g, "{measurementDate.month}");
      }
      if (next.includes("2026 г.")) {
        next = next.replace(/2026 г\./g, "{measurementDate.year} г.");
      }
      return next === text ? full : `${open}${next}${close}`;
    },
  );

  // Write the modified document back.
  zip.file("word/document.xml", doc);
  const outDir = path.dirname(OUT_DOCX);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outBuf = zip.generate({ type: "nodebuffer" });
  fs.writeFileSync(OUT_DOCX, outBuf);
  console.log(`Wrote: ${OUT_DOCX} (${outBuf.length} bytes)`);
}

main();
