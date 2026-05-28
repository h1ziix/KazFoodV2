/**
 * Surgical builder for public/templates/summary-protocol.docx.
 *
 * Strategy (per user request — "use original DOCX as source-of-truth"):
 *
 *   1. Load the ORIGINAL reference file
 *      "9. Протокол сводный вредности KAZFOOD.docx" from repo root.
 *   2. Read its word/document.xml verbatim. Do NOT rebuild XML.
 *   3. Apply surgical edits ONLY:
 *        a) replaceWtExact() — replace text inside an existing <w:t>
 *           with a docxtemplater {placeholder}, preserving the run's rPr.
 *        b) collapseRange()  — replace a contiguous run sequence with a
 *           single new run carrying the chosen rPr + placeholder text.
 *        c) wrap rows: keep ONE templated <w:tr> for the loop body and
 *           drop the rest. Place {#loop} / {/loop} as text nodes in
 *           paragraphs INSIDE the loop rows so paragraphLoop:true
 *           triggers per-row repetition.
 *   4. Repack as the new template. ALL original styles, theme, numbering,
 *      fonts, images, header/footer, page setup, table geometry are
 *      preserved untouched.
 *
 * Run: node scripts/build-summary-template.mjs
 */

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import PizZip from "pizzip";
import { validateDocxBuffer } from "./lib/validate-docx.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_FIX = resolve(__dirname, "..");

const PUBLIC_TEMPLATES = join(ROOT_FIX, "public", "templates");
const OUT_TEMPLATE = join(PUBLIC_TEMPLATES, "summary-protocol.docx");

// Locate the original reference DOCX. Filename starts with "9. " and ends ".docx".
function findOriginal() {
  const files = readdirSync(ROOT_FIX);
  const match = files.find(
    (f) => /^9\.\s/.test(f) && f.endsWith(".docx") && !f.startsWith("~$"),
  );
  if (!match) {
    throw new Error(
      "Не найден исходный файл «9. Протокол сводный вредности KAZFOOD.docx» в корне репозитория.",
    );
  }
  return join(ROOT_FIX, match);
}

// --------------------------------------------------------------------------
// XML surgery helpers
// --------------------------------------------------------------------------

/**
 * Replace the content of a SPECIFIC <w:t>EXACT</w:t> occurrence (the
 * first one) with new text. Preserves the rPr/run/paragraph. Used for
 * fields whose source value lives in a single text node (customer,
 * roomDescription, equipment, etc.).
 */
function replaceWtExact(xml, exact, replacement) {
  // Build regex that matches <w:t ...>EXACT</w:t> (text node only).
  const escaped = exact.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(<w:t(?:\\s[^>]*)?>)${escaped}(</w:t>)`);
  const m = xml.match(re);
  if (!m) {
    throw new Error(
      `replaceWtExact: текст не найден: «${exact.slice(0, 80)}»`,
    );
  }
  // Always ensure xml:space="preserve" so leading/trailing space in
  // {placeholder} render is safe.
  const openTag = m[1].includes("xml:space=")
    ? m[1]
    : m[1].replace(/<w:t\b([^>]*)>/, '<w:t xml:space="preserve"$1>');
  return xml.replace(re, openTag + escapeXmlText(replacement) + m[2]);
}

function escapeXmlText(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Replace ALL contiguous runs/fields between a start and end anchor
 * inside ONE paragraph with a single new run holding `placeholder`.
 * Anchors are unique substrings that lie inside the paragraph (we find
 * the enclosing <w:p>…</w:p> first, then operate within it).
 *
 * Used to collapse multi-run + fldChar sequences (e.g. protocol number
 * "1004-СВД, 2026 г." split into 7 runs + MERGEFIELD) into ONE
 * placeholder run.
 */
function collapseInsideP(xml, paragraphAnchor, startMarker, endMarker, placeholderText, rPr) {
  // Find enclosing <w:p>…</w:p> containing the anchor.
  const pRe = /<w:p\b[^>]*>[\s\S]*?<\/w:p>/g;
  let pMatch;
  let pIndex = -1;
  let pXml = null;
  while ((pMatch = pRe.exec(xml)) !== null) {
    if (pMatch[0].includes(paragraphAnchor)) {
      pIndex = pMatch.index;
      pXml = pMatch[0];
      break;
    }
  }
  if (!pXml) {
    throw new Error(`collapseInsideP: не найден <w:p> с anchor «${paragraphAnchor}»`);
  }

  // Inside pXml, find start/end markers and replace everything from
  // the <w:r ...> opening tag containing startMarker through (and
  // including) the </w:r> closing tag containing endMarker.
  const startIdx = pXml.indexOf(startMarker);
  const endIdx = pXml.indexOf(endMarker, startIdx);
  if (startIdx < 0 || endIdx < 0) {
    throw new Error(`collapseInsideP: маркеры не найдены (start=${startMarker}, end=${endMarker})`);
  }
  // Locate the <w:r ...> opener for the run containing startMarker.
  // We must NOT match <w:rPr> — use regex with a word-boundary char.
  const rOpenRe = /<w:r(?:\s[^>]*)?>/g;
  let rOpen = -1;
  let rOpenMatch;
  while ((rOpenMatch = rOpenRe.exec(pXml)) !== null) {
    if (rOpenMatch.index > startIdx) break;
    rOpen = rOpenMatch.index;
  }
  // Find the </w:r> AFTER endIdx
  const rClose = pXml.indexOf("</w:r>", endIdx) + "</w:r>".length;
  if (rOpen < 0 || rClose < 6) {
    throw new Error("collapseInsideP: не удалось найти границы <w:r>");
  }

  const newRun =
    `<w:r>${rPr}<w:t xml:space="preserve">${escapeXmlText(placeholderText)}</w:t></w:r>`;
  const newP = pXml.slice(0, rOpen) + newRun + pXml.slice(rClose);
  return xml.slice(0, pIndex) + newP + xml.slice(pIndex + pXml.length);
}

/**
 * Locate all <w:tbl>…</w:tbl> blocks in document order.
 * Returns array of {start, end, xml}.
 */
function findTables(xml) {
  const tbls = [];
  const re = /<w:tbl\b[^>]*>[\s\S]*?<\/w:tbl>/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    tbls.push({ start: m.index, end: m.index + m[0].length, xml: m[0] });
  }
  return tbls;
}

/**
 * Inside a single <w:tbl> XML chunk, list ALL <w:tr>…</w:tr> with
 * indices relative to that chunk.
 */
function listRows(tblXml) {
  const rows = [];
  const re = /<w:tr\b[^>]*>[\s\S]*?<\/w:tr>/g;
  let m;
  while ((m = re.exec(tblXml)) !== null) {
    rows.push({ start: m.index, end: m.index + m[0].length, xml: m[0] });
  }
  return rows;
}

/**
 * Replace the slice of `xml` between positions [start,end) (relative to
 * `xml`) with `replacement`.
 */
function spliceXml(xml, start, end, replacement) {
  return xml.slice(0, start) + replacement + xml.slice(end);
}

// --------------------------------------------------------------------------
// Targeted text-node replacements for the intro paragraphs
// --------------------------------------------------------------------------
//
// Each entry: a unique substring of the EXACT <w:t>…</w:t> we want to
// rewrite, paired with the docxtemplater placeholder that replaces it.
// All other runs in the paragraph (Kazakh prefix, italic helper text,
// bold formatting) are left intact.

const INTRO_TEXT_REPLACEMENTS = [
  // P6 customer: single <w:t> holds full value.
  {
    find: "ТОО «KazEcoFood», Алманиская обл, Карасайский район, село Кокозек, улица Несибели, 715",
    replace: "{customer.name}, {customer.address}",
  },
  // P7 measurement location.
  {
    find: "1. Административно – управленческий персонал, 2. Производственный персонал",
    replace: "{measurementLocation}",
  },
  // P9 room description.
  {
    find: "Административное помещение, производственное помещение, складское помещение, автомастерская (грузовая),  помещение лаборатории, кухня.",
    replace: "{roomDescription}",
  },
  // P10 collective protection (the word "имеется").
  // Note: original is "имеется" in its own <w:t> — keep it the value of
  // {collectiveProtection}.
  {
    find: "имеется",
    replace: "{collectiveProtection}",
  },
  // P11 equipment: split across two text nodes:
  //   "Рабочий стол, ПК, Оборудование согласно перечня"  +  "."
  // Replace the first long part with placeholder; drop the trailing dot
  // by leaving it (renders as "{equipment}." which is fine).
  {
    find: "Рабочий стол, ПК, Оборудование согласно перечня",
    replace: "{equipment}",
  },
  // P12 professions list (single <w:t>).
  {
    find: "Директор, Управляющий производством, Бухгалтер, Коммерческий директор , Технический директор, Менеджер по продажам, Менеджер по снабжению, Главный механик, Главный энергетик, Специалист по кадровым вопросам, Начальник службы ",
    replace: "{professionsList}",
  },
  // Conditions: humidity is one node; temperature "16" and pressure "694"
  // are split across multiple runs — handle via paragraph-text collapse.
  { find: "52", replace: "{conditions.humidity}" },
];

// Collapse the productStandard paragraph (contains "Приказ Министра ...
// ГОСТ 12.1.050-86.") into one placeholder run. Many fragmented runs +
// proofErr tags get replaced by a clean single run preserving the
// paragraph's pPr (numbering, indentation).
function collapseProductStandard(xml) {
  // Anchor: the only paragraph containing the literal "Приказ Министра здравоохранения".
  const anchor = "Приказ Министра здравоохранения";
  const pRe = /<w:p\b[^>]*>[\s\S]*?<\/w:p>/g;
  let m;
  while ((m = pRe.exec(xml)) !== null) {
    if (!m[0].includes(anchor)) continue;
    const pXml = m[0];
    const pPr = (pXml.match(/<w:pPr>[\s\S]*?<\/w:pPr>/) || [""])[0];
    const pOpen = (pXml.match(/^<w:p\b[^>]*>/) || ["<w:p>"])[0];
    const newP =
      `${pOpen}${pPr}<w:r><w:rPr><w:b/><w:i/><w:u w:val="single"/></w:rPr>` +
      `<w:t xml:space="preserve">{productStandard}</w:t></w:r></w:p>`;
    return xml.slice(0, m.index) + newP + xml.slice(m.index + pXml.length);
  }
  return xml;
}

// Collapse the temperature/pressure paragraphs whose joined text is
// "Температура: " + value AND "Атмосферное давление: " + value.
function collapseConditions(xml) {
  // Match paragraph "Температура: 16" → preserve the label, replace value.
  xml = collapseParagraphSuffix(xml, "Температура:", "{conditions.temperature}");
  xml = collapseParagraphSuffix(xml, "Атмосферное давление:", "{conditions.pressure}");
  return xml;
}

/**
 * Find a <w:p> whose joined <w:t> text starts with `prefix` and has
 * MORE than `prefix` (i.e. a value follows). Collapse the value runs
 * into one bold run with `placeholder`.
 */
function collapseParagraphSuffix(xml, prefix, placeholder) {
  const pRe = /<w:p\b[^>]*>[\s\S]*?<\/w:p>/g;
  let m;
  while ((m = pRe.exec(xml)) !== null) {
    const pXml = m[0];
    const texts = [...pXml.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map((x) => x[1]);
    const joined = texts.join("");
    if (joined.startsWith(prefix) && joined.length > prefix.length + 1) {
      // Find the offset in pXml of the FIRST run after the prefix label.
      // The prefix is in the first <w:r>…</w:r>. We collapse runs[1..end].
      const runs = [...pXml.matchAll(/<w:r\b[^>]*>[\s\S]*?<\/w:r>/g)];
      if (runs.length < 2) continue;
      const cutFrom = runs[1].index;
      const cutTo = runs[runs.length - 1].index + runs[runs.length - 1][0].length;
      const newRun =
        `<w:r><w:rPr><w:b/><w:bCs/></w:rPr>` +
        `<w:t xml:space="preserve"> ${placeholder}</w:t></w:r>`;
      const newP = pXml.slice(0, cutFrom) + newRun + pXml.slice(cutTo);
      return xml.slice(0, m.index) + newP + xml.slice(m.index + pXml.length);
    }
  }
  return xml;
}

// Standalone date text in <w:t> for header line «10» апреля 2026 г. (under
// MERGEFIELD): occurs in protocol title AND measurement-date line. We
// replace BOTH occurrences with placeholders using indexed substitution.
function replaceHeaderDates(xml) {
  // First occurrence — in protocol title paragraph.
  const target = "<w:t>«10» апреля 2026 г.</w:t>";
  const replTitle = `<w:t xml:space="preserve">«{protocol.day}» {protocol.month} {protocol.dateYear} г.</w:t>`;
  const replDate = `<w:t xml:space="preserve">«{measurementDate.day}» {measurementDate.month} {measurementDate.year} г.</w:t>`;
  const first = xml.indexOf(target);
  if (first < 0) throw new Error("Не найдена дата «10» апреля 2026 г. (1)");
  const second = xml.indexOf(target, first + target.length);
  if (second < 0) throw new Error("Не найдена дата «10» апреля 2026 г. (2)");
  // Replace SECOND first so indices for the first stay valid.
  let out = xml.slice(0, second) + replDate + xml.slice(second + target.length);
  out = out.slice(0, first) + replTitle + out.slice(first + target.length);
  return out;
}

// Collapse the protocol-number run sequence in the title paragraph:
//   №|1004|-СВД|, |202|6| |г|.   →   one placeholder run.
function collapseProtocolNumber(xml) {
  // Locate paragraph by anchoring on "<w:t>1004</w:t>".
  const anchor = "<w:t>1004</w:t>";
  const rPr = `<w:rPr><w:b/><w:bCs/></w:rPr>`;
  return collapseInsideP(
    xml,
    anchor,
    "<w:t>№</w:t>", // start: the № run
    `<w:t xml:space="preserve">. </w:t>`, // end: the ". " run (literal)
    "№ {protocol.number}, {protocol.year} г. ",
    rPr,
  );
}

// --------------------------------------------------------------------------
// Measuring-tools table surgery
// --------------------------------------------------------------------------
//
// Keep rows 0,1 (header). Replace rows 2..7 (6 data rows) with ONE
// templated row wrapped in {#measuringTools}…{/measuringTools}.

function surgicalToolsTable(tblXml) {
  const rows = listRows(tblXml);
  if (rows.length !== 8) {
    throw new Error(`Ожидалось 8 строк в таблице СИ, найдено ${rows.length}`);
  }
  const headerEnd = rows[1].end; // keep rows 0..1
  const firstDataRow = rows[2].xml;
  const lastDataEnd = rows[7].end;

  // Rebuild templated data row from the first original data row (R2),
  // preserving every cell's tcPr (widths/borders/vAlign) and replacing
  // the inner paragraph contents with placeholders.
  const placeholders = [
    "{rowNumber}",
    "{name}",
    "{certificate}",
    "{verificationDate}",
  ];
  let templated = rebuildSimpleRow(firstDataRow, placeholders);
  templated = injectLoopTags(templated, "measuringTools");

  return tblXml.slice(0, headerEnd) + templated + tblXml.slice(lastDataEnd);
}

/**
 * For a row with N cells and N placeholders, replace each cell's
 * paragraph content with a single centered run carrying the placeholder.
 * Cell tcPr is preserved verbatim.
 */
function rebuildSimpleRow(rowXml, placeholders) {
  const RPR = `<w:rPr><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr>`;
  const tcRe = /<w:tc\b[^>]*>([\s\S]*?)<\/w:tc>/g;
  const out = [];
  let lastIdx = 0;
  let cellIdx = 0;
  let m;
  while ((m = tcRe.exec(rowXml)) !== null) {
    out.push(rowXml.slice(lastIdx, m.index));
    const tcPrMatch = m[0].match(/<w:tcPr>[\s\S]*?<\/w:tcPr>/);
    const tcPr = tcPrMatch ? tcPrMatch[0] : "";
    const ph = placeholders[cellIdx] ?? "";
    const align = cellIdx === 1 ? "left" : "center";
    const newCellInner =
      `${tcPr}<w:p><w:pPr><w:jc w:val="${align}"/><w:rPr>${RPR}</w:rPr></w:pPr>` +
      `<w:r>${RPR}<w:t xml:space="preserve">${ph}</w:t></w:r></w:p>`;
    out.push(`<w:tc>${newCellInner}</w:tc>`);
    lastIdx = m.index + m[0].length;
    cellIdx++;
  }
  out.push(rowXml.slice(lastIdx));
  return out.join("");
}

/**
 * Insert {#name} at the very beginning of the first <w:t> in the given
 * row xml, and {/name} at the very end of the last <w:t>. This pattern
 * (loop tags inside cell text rather than as standalone paragraphs)
 * keeps docxtemplater + paragraphLoop happy for row repetition.
 *
 * However a safer pattern that ALWAYS repeats the row is to put the
 * tags into their own paragraphs whose only content is the tag — that
 * causes paragraphLoop to detect the enclosing <w:tr> as the repeated
 * unit. We use the safest: tag-only paragraphs, added INSIDE the first
 * cell of the row at its top, and INSIDE the last cell at its bottom.
 */
function injectLoopTags(rowXml, loopName) {
  // Find first <w:tc>…</w:tc> and last <w:tc>…</w:tc> boundaries.
  const tcRe = /<w:tc\b[^>]*>[\s\S]*?<\/w:tc>/g;
  const tcs = [];
  let m;
  while ((m = tcRe.exec(rowXml)) !== null) {
    tcs.push({ start: m.index, end: m.index + m[0].length, xml: m[0] });
  }
  if (tcs.length === 0) throw new Error("injectLoopTags: нет <w:tc> в строке");

  const openP = `<w:p><w:pPr><w:spacing w:after="0"/><w:rPr><w:vanish/><w:sz w:val="2"/></w:rPr></w:pPr><w:r><w:rPr><w:vanish/><w:sz w:val="2"/></w:rPr><w:t xml:space="preserve">{#${loopName}}</w:t></w:r></w:p>`;
  const closeP = `<w:p><w:pPr><w:spacing w:after="0"/><w:rPr><w:vanish/><w:sz w:val="2"/></w:rPr></w:pPr><w:r><w:rPr><w:vanish/><w:sz w:val="2"/></w:rPr><w:t xml:space="preserve">{/${loopName}}</w:t></w:r></w:p>`;

  // Insert openP immediately after the first <w:tcPr>…</w:tcPr> of the
  // first cell. Insert closeP immediately before the closing </w:tc> of
  // the last cell.
  const firstTc = tcs[0];
  const tcPrCloseIdx = firstTc.xml.indexOf("</w:tcPr>");
  let newFirst;
  if (tcPrCloseIdx >= 0) {
    const insertAt = tcPrCloseIdx + "</w:tcPr>".length;
    newFirst =
      firstTc.xml.slice(0, insertAt) + openP + firstTc.xml.slice(insertAt);
  } else {
    // No tcPr — insert right after the <w:tc> opening.
    const tcOpenEnd = firstTc.xml.indexOf(">") + 1;
    newFirst =
      firstTc.xml.slice(0, tcOpenEnd) + openP + firstTc.xml.slice(tcOpenEnd);
  }

  // Apply first cell replacement.
  let out = rowXml.slice(0, firstTc.start) + newFirst + rowXml.slice(firstTc.end);

  // Recompute last cell position in modified row.
  const tcs2 = [];
  let m2;
  const tcRe2 = /<w:tc\b[^>]*>[\s\S]*?<\/w:tc>/g;
  while ((m2 = tcRe2.exec(out)) !== null) {
    tcs2.push({ start: m2.index, end: m2.index + m2[0].length, xml: m2[0] });
  }
  const lastTc = tcs2[tcs2.length - 1];
  const lastClose = lastTc.xml.lastIndexOf("</w:tc>");
  const newLast =
    lastTc.xml.slice(0, lastClose) + closeP + lastTc.xml.slice(lastClose);
  out = out.slice(0, lastTc.start) + newLast + out.slice(lastTc.end);
  return out;
}

/**
 * Wrap an entire <w:tr> in a docxtemplater conditional that expands to
 * the row itself, using the inline `{-w:tr cond}…{/cond}` syntax.
 * The opener tag is prepended to the FIRST <w:t> content of the row,
 * the closer is appended to the LAST <w:t> content.
 *
 * Note: docxtemplater's explicit-expand syntax does not natively
 * support `^` inversion, so the calling data layer should provide a
 * pre-computed inverse boolean (e.g. `notFirstFactor: !firstFactor`).
 */
function injectConditionalTags(rowXml, condName) {
  // Find all <w:t …>…</w:t> nodes.
  const re = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g;
  const matches = [];
  let m;
  while ((m = re.exec(rowXml)) !== null) {
    matches.push({ start: m.index, end: m.index + m[0].length, open: m[0].slice(0, m[0].indexOf(">") + 1), text: m[1], close: "</w:t>" });
  }
  if (matches.length === 0) return rowXml;

  // Prepend to first, append to last.
  const first = matches[0];
  const last = matches[matches.length - 1];
  const openTag = `{-w:tr ${condName}}`;
  const closeTag = `{/${condName}}`;

  // Apply LAST first so earlier indices stay valid.
  let out = rowXml;
  const lastReplacement = `${last.open}${last.text}${closeTag}${last.close}`;
  // Ensure xml:space="preserve" on last open tag
  const lastOpenPreserve = last.open.includes("xml:space=")
    ? last.open
    : last.open.replace(/<w:t\b/, '<w:t xml:space="preserve"');
  const lastReplacementSafe = `${lastOpenPreserve}${last.text}${closeTag}${last.close}`;
  out = out.slice(0, last.start) + lastReplacementSafe + out.slice(last.end);

  // Recompute first position (it didn't move; lies before last).
  const firstOpenPreserve = first.open.includes("xml:space=")
    ? first.open
    : first.open.replace(/<w:t\b/, '<w:t xml:space="preserve"');
  const firstReplacement = `${firstOpenPreserve}${openTag}${first.text}${first.close}`;
  out = out.slice(0, first.start) + firstReplacement + out.slice(first.end + (lastReplacementSafe.length - (last.end - last.start)));
  // The above offset math is messy. Simpler: do FIRST replacement on
  // ORIGINAL rowXml, then redo LAST on result by re-scanning. Rewrite:
  return wrapInlineConditional(rowXml, condName);
}

function wrapInlineConditional(rowXml, condName) {
  const re = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g;
  const matches = [];
  let m;
  while ((m = re.exec(rowXml)) !== null) {
    matches.push({
      start: m.index,
      end: m.index + m[0].length,
      whole: m[0],
      open: m[0].slice(0, m[0].indexOf(">") + 1),
      text: m[1],
    });
  }
  if (matches.length === 0) return rowXml;
  const first = matches[0];
  const last = matches[matches.length - 1];
  const openTag = `{-w:tr ${condName}}`;
  const closeTag = `{/${condName}}`;
  const ensurePreserve = (open) =>
    open.includes("xml:space=")
      ? open
      : open.replace(/<w:t\b/, '<w:t xml:space="preserve"');

  if (matches.length === 1) {
    const newWhole = `${ensurePreserve(first.open)}${openTag}${first.text}${closeTag}</w:t>`;
    return rowXml.slice(0, first.start) + newWhole + rowXml.slice(first.end);
  }
  // Apply last first.
  const lastNew = `${ensurePreserve(last.open)}${last.text}${closeTag}</w:t>`;
  let out = rowXml.slice(0, last.start) + lastNew + rowXml.slice(last.end);
  const firstNew = `${ensurePreserve(first.open)}${openTag}${first.text}</w:t>`;
  out = out.slice(0, first.start) + firstNew + out.slice(first.end);
  return out;
}

function appendToLastWt(rowXml, text) {
  const re = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g;
  let lastMatch = null;
  let m;
  while ((m = re.exec(rowXml)) !== null) {
    lastMatch = m;
  }
  if (!lastMatch) throw new Error("appendToLastWt: no <w:t> found");
  const open = lastMatch[0].slice(0, lastMatch[0].indexOf(">") + 1);
  const openPreserve = open.includes("xml:space=")
    ? open
    : open.replace(/<w:t\b/, '<w:t xml:space="preserve"');
  const inner = lastMatch[1];
  const start = lastMatch.index;
  const end = lastMatch.index + lastMatch[0].length;
  return (
    rowXml.slice(0, start) +
    `${openPreserve}${inner}${text}</w:t>` +
    rowXml.slice(end)
  );
}

function injectTags(rowXml, openTag, closeTag) {
  const tcRe = /<w:tc\b[^>]*>[\s\S]*?<\/w:tc>/g;
  const tcs = [];
  let m;
  while ((m = tcRe.exec(rowXml)) !== null) {
    tcs.push({ start: m.index, end: m.index + m[0].length, xml: m[0] });
  }
  if (tcs.length === 0) throw new Error("injectTags: нет <w:tc>");
  const openP = `<w:p><w:pPr><w:spacing w:after="0"/><w:rPr><w:vanish/><w:sz w:val="2"/></w:rPr></w:pPr><w:r><w:rPr><w:vanish/><w:sz w:val="2"/></w:rPr><w:t xml:space="preserve">${openTag}</w:t></w:r></w:p>`;
  const closeP = `<w:p><w:pPr><w:spacing w:after="0"/><w:rPr><w:vanish/><w:sz w:val="2"/></w:rPr></w:pPr><w:r><w:rPr><w:vanish/><w:sz w:val="2"/></w:rPr><w:t xml:space="preserve">${closeTag}</w:t></w:r></w:p>`;
  const firstTc = tcs[0];
  const tcPrCloseIdx = firstTc.xml.indexOf("</w:tcPr>");
  let insertAt;
  let newFirst;
  if (tcPrCloseIdx >= 0) {
    insertAt = tcPrCloseIdx + "</w:tcPr>".length;
    newFirst =
      firstTc.xml.slice(0, insertAt) + openP + firstTc.xml.slice(insertAt);
  } else {
    const tcOpenEnd = firstTc.xml.indexOf(">") + 1;
    newFirst =
      firstTc.xml.slice(0, tcOpenEnd) + openP + firstTc.xml.slice(tcOpenEnd);
  }
  let out = rowXml.slice(0, firstTc.start) + newFirst + rowXml.slice(firstTc.end);
  const tcs2 = [];
  let m2;
  const tcRe2 = /<w:tc\b[^>]*>[\s\S]*?<\/w:tc>/g;
  while ((m2 = tcRe2.exec(out)) !== null) {
    tcs2.push({ start: m2.index, end: m2.index + m2[0].length, xml: m2[0] });
  }
  const lastTc = tcs2[tcs2.length - 1];
  const lastClose = lastTc.xml.lastIndexOf("</w:tc>");
  const newLast =
    lastTc.xml.slice(0, lastClose) + closeP + lastTc.xml.slice(lastClose);
  out = out.slice(0, lastTc.start) + newLast + out.slice(lastTc.end);
  return out;
}

// --------------------------------------------------------------------------
// Main harmfulness table surgery
// --------------------------------------------------------------------------
//
// Original table 2 layout:
//   R0..R2 = column headers (keep verbatim)
//   R3     = section header row (1 cell, gridSpan=23): "1. Административно..."
//   R4     = first factor row of workplace #1 (vMerge restart on code/prof/count)
//   R5..R11= subsequent factor rows of workplace #1 (vMerge continue)
//   R12..  = workplace #2, etc.
//
// We turn the table into:
//   R0..R2 = headers kept verbatim
//   {#rows}
//     <section row>{#showSection}…{/showSection}</section row>
//     <first-factor row>{#firstFactor}…{/firstFactor}</first-factor row>
//     <cont-factor row>{^firstFactor}…{/firstFactor}</cont-factor row>
//   {/rows}
//
// Templating:
//   - Section row text "1. Административно..." → "{placeNumber}. {placeName}"
//   - First-factor row: code cell collapses SEQ field into "{code}",
//     profession → "{profession}", count → "{count}", then factor cells
//     filled with {factorName}/{factorMethod}/{factorNorm}/{factorActual}
//     and 6 class cells {class2}…{class4}.
//   - Cont-factor row: same template but TC0/1/2 left as <w:vMerge/>
//     continuation cells with empty paragraphs (already shaped that way
//     in the source).

function surgicalMainTable(tblXml) {
  const rows = listRows(tblXml);
  if (rows.length < 12) {
    throw new Error(`Слишком мало строк в основной таблице: ${rows.length}`);
  }

  const headerEnd = rows[2].end; // keep R0..R2

  // ---- Section row template (from R3) ----
  // The section row carries the OUTER {#rows} loop opener + its own
  // {-w:tr showSection} conditional so the entire section <w:tr> only
  // renders when showSection is true.
  let sectionRowXml = rows[3].xml;
  sectionRowXml = replaceWtExact(
    sectionRowXml,
    "1. Административно – управленческий персонал",
    "{#rows}{-w:tr showSection}{placeNumber}. {placeName}{/}",
  );

  // ---- First-factor row template (from R4) ----
  let firstFactorXml = rebuildFactorRow(rows[4].xml, /*isFirst*/ true);
  firstFactorXml = injectConditionalTags(firstFactorXml, "firstFactor");

  // ---- Continuation factor row template (from R5) ----
  // The cont row also carries the OUTER {/rows} loop closer — appended
  // AFTER the {/notFirstFactor} conditional close, so the close-tag
  // nesting order is correct (notFirstFactor inside rows).
  let contFactorXml = rebuildFactorRow(rows[5].xml, /*isFirst*/ false);
  contFactorXml = injectConditionalTags(contFactorXml, "notFirstFactor");
  // Append {/rows} to the very last <w:t> in the row (after the
  // {/notFirstFactor} that wrapInlineConditional just inserted).
  contFactorXml = appendToLastWt(contFactorXml, "{/rows}");

  const loopBody = sectionRowXml + firstFactorXml + contFactorXml;

  // Cut out R3..Rend (all original data rows) and inject loopBody.
  const cutStart = rows[3].start;
  const cutEnd = rows[rows.length - 1].end;
  return tblXml.slice(0, cutStart) + loopBody + tblXml.slice(cutEnd);
}

/**
 * Take a factor <w:tr> (13 cells) and replace each cell's PARAGRAPH
 * contents with a clean single-run paragraph carrying the appropriate
 * docxtemplater placeholder. Cell rPr/border/width/vMerge stay intact.
 *
 * Cell layout (per analysis of original R4/R5):
 *   TC0 = code        (vMerge restart on R4, continue on R5)
 *   TC1 = profession  (vMerge restart on R4, continue on R5)
 *   TC2 = count       (vMerge restart on R4, continue on R5)
 *   TC3 = factorName
 *   TC4 = factorMethod
 *   TC5 = factorNorm
 *   TC6 = factorActual
 *   TC7..TC12 = class2 / class31 / class32 / class33 / class34 / class4
 *
 * On `isFirst=false` rows, TC0/1/2 are vMerge-continue and contain
 * empty paragraphs in the source; we leave them empty.
 */
function rebuildFactorRow(rowXml, isFirst) {
  // Default rPr for cell text — pick original size 22 to match R4/R5 visuals.
  const RPR_NUM = `<w:rPr><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr>`;
  const RPR_DEF = `<w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>`;

  const placeholders = isFirst
    ? [
        "{code}",
        "{profession}",
        "{count}",
        "{factorName}",
        "{factorMethod}",
        "{factorNorm}",
        "{factorActual}",
        "{class2}",
        "{class31}",
        "{class32}",
        "{class33}",
        "{class34}",
        "{class4}",
      ]
    : [
        null, // leave empty (vMerge continue)
        null,
        null,
        "{factorName}",
        "{factorMethod}",
        "{factorNorm}",
        "{factorActual}",
        "{class2}",
        "{class31}",
        "{class32}",
        "{class33}",
        "{class34}",
        "{class4}",
      ];

  const tcRe = /<w:tc\b[^>]*>([\s\S]*?)<\/w:tc>/g;
  const out = [];
  let lastIdx = 0;
  let cellIdx = 0;
  let m;
  while ((m = tcRe.exec(rowXml)) !== null) {
    // Append any text before this <w:tc> verbatim (<w:tr>…<w:trPr>…).
    out.push(rowXml.slice(lastIdx, m.index));
    const tcOpenEnd = m.index + m[0].indexOf("</w:tcPr>") + "</w:tcPr>".length;
    // Locate tcPr inside this cell, preserve it verbatim.
    const tcPrMatch = m[0].match(/<w:tcPr>[\s\S]*?<\/w:tcPr>/);
    const tcPr = tcPrMatch ? tcPrMatch[0] : "";

    const ph = placeholders[cellIdx];
    let newCellInner;
    if (ph === null) {
      // Empty paragraph — preserve original (vMerge continuation cells).
      newCellInner = `${tcPr}<w:p><w:pPr><w:rPr>${RPR_DEF}</w:rPr></w:pPr></w:p>`;
    } else {
      // Pick rPr/size based on column.
      const rPr = cellIdx <= 2 ? RPR_NUM : RPR_DEF;
      newCellInner =
        `${tcPr}<w:p><w:pPr><w:jc w:val="center"/><w:rPr>${rPr}</w:rPr></w:pPr>` +
        `<w:r>${rPr}<w:t xml:space="preserve">${ph}</w:t></w:r></w:p>`;
    }
    out.push(`<w:tc>${newCellInner}</w:tc>`);
    lastIdx = m.index + m[0].length;
    cellIdx++;
  }
  out.push(rowXml.slice(lastIdx));
  return out.join("");
}

/**
 * Replace ALL <w:p>…</w:p> in given range that consist of only an empty
 * pPr (no text runs) with a paragraph carrying the next placeholder
 * from `placeholders`. Used for the trailing empty class-cells in a
 * factor row.
 */
function fillEmptyClassCells(rowXml, placeholders) {
  // Find each empty <w:p>…</w:p>: contains pPr but no <w:t>.
  const emptyPRe = /<w:p\b[^>]*>(<w:pPr>[\s\S]*?<\/w:pPr>)<\/w:p>/g;
  let i = 0;
  return rowXml.replace(emptyPRe, (whole, pPr) => {
    if (i >= placeholders.length) return whole;
    const ph = placeholders[i++];
    // Pull rPr out of pPr if present, else default.
    const rPrMatch = pPr.match(/<w:rPr>[\s\S]*?<\/w:rPr>/);
    const rPr = rPrMatch
      ? rPrMatch[0]
      : `<w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>`;
    return `<w:p>${pPr}<w:r>${rPr}<w:t xml:space="preserve">${ph}</w:t></w:r></w:p>`;
  });
}

/**
 * Inside a row, find a paragraph whose runs are exactly two text nodes
 * matching `a` and `b` (in order, possibly with intermediate runs that
 * have empty/whitespace text) and collapse them into one placeholder
 * run preserving the rPr of the first matched run.
 */
function collapseFactorNumberPair(rowXml, a, b, placeholder) {
  // Find <w:p>…</w:p> that contains both <w:t…>a</w:t> and <w:t…>b</w:t>
  // in this order with nothing else of substance.
  const pRe = /<w:p\b[^>]*>[\s\S]*?<\/w:p>/g;
  let m;
  while ((m = pRe.exec(rowXml)) !== null) {
    const pXml = m[0];
    // Get sequence of <w:t> texts.
    const texts = [...pXml.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map((x) => x[1]);
    const joined = texts.join("");
    if (joined === a + b || joined === a + b.trim() || joined.trim() === (a + b).trim()) {
      // Collapse: replace all runs of <w:r>…</w:r> in pXml with one run.
      const rPr = (pXml.match(/<w:rPr>[\s\S]*?<\/w:rPr>/) || [
        `<w:rPr><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr>`,
      ])[0];
      // Keep pPr.
      const pPr = (pXml.match(/<w:pPr>[\s\S]*?<\/w:pPr>/) || [""])[0];
      // Strip the <w:p> envelope, then rebuild.
      const pOpenMatch = pXml.match(/^<w:p\b[^>]*>/);
      const pOpen = pOpenMatch ? pOpenMatch[0] : "<w:p>";
      const newP = `${pOpen}${pPr}<w:r>${rPr}<w:t xml:space="preserve">${placeholder}</w:t></w:r></w:p>`;
      return rowXml.slice(0, m.index) + newP + rowXml.slice(m.index + pXml.length);
    }
  }
  // No collapse needed if not found.
  return rowXml;
}

function collapseNormFourParts(rowXml) {
  // Match a paragraph whose joined <w:t> equals "21-27".
  return collapseParagraphByText(rowXml, "21-27", "{factorNorm}");
}
function collapseActualFourParts(rowXml) {
  return collapseParagraphByText(rowXml, "23,5", "{factorActual}");
}

function collapseParagraphByText(rowXml, exactJoined, placeholder) {
  const pRe = /<w:p\b[^>]*>[\s\S]*?<\/w:p>/g;
  let m;
  while ((m = pRe.exec(rowXml)) !== null) {
    const pXml = m[0];
    const texts = [...pXml.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map((x) => x[1]);
    if (texts.join("") === exactJoined) {
      const rPr =
        (pXml.match(/<w:rPr>[\s\S]*?<\/w:rPr>/) || [
          `<w:rPr><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr>`,
        ])[0];
      const pPr = (pXml.match(/<w:pPr>[\s\S]*?<\/w:pPr>/) || [""])[0];
      const pOpenMatch = pXml.match(/^<w:p\b[^>]*>/);
      const pOpen = pOpenMatch ? pOpenMatch[0] : "<w:p>";
      const newP = `${pOpen}${pPr}<w:r>${rPr}<w:t xml:space="preserve">${placeholder}</w:t></w:r></w:p>`;
      return rowXml.slice(0, m.index) + newP + rowXml.slice(m.index + pXml.length);
    }
  }
  return rowXml;
}

// --------------------------------------------------------------------------
// Footer (signatures) table surgery
// --------------------------------------------------------------------------

function surgicalFooterTable(tblXml) {
  let out = tblXml;
  // Original literal values:
  //   "Заведующий лабораторией"  → "{performer.position}"
  //   "Дьяченко И.С."            → "{performer.fullName}"
  //   "Начальник по " + "БиОТ"   → "{director.position}"
  //   "Богачев А.И."             → "{director.fullName}"
  out = replaceWtExact(out, "Заведующий лабораторией", "{performer.position}");
  out = replaceWtExact(out, "Дьяченко И.С.", "{performer.fullName}");
  out = replaceWtExact(out, "Начальник по ", "{director.position}");
  out = replaceWtExact(out, "БиОТ", "");
  out = replaceWtExact(out, "Богачев А.И.", "{director.fullName}");
  return out;
}

// --------------------------------------------------------------------------
// Master build
// --------------------------------------------------------------------------

function build() {
  const originalPath = findOriginal();
  console.log("Source:", originalPath);

  const baseBuf = readFileSync(originalPath);
  const zip = new PizZip(baseBuf);
  const docFile = zip.file("word/document.xml");
  if (!docFile) throw new Error("document.xml не найден в исходном DOCX");
  let xml = docFile.asText();
  console.log("Original document.xml:", xml.length, "bytes");

  // -- 1. Intro text replacements ----------------------------------------
  for (const r of INTRO_TEXT_REPLACEMENTS) {
    try {
      xml = replaceWtExact(xml, r.find, r.replace);
    } catch (e) {
      console.warn("[warn]", e.message);
    }
  }

  // -- 2. Header dates (two occurrences of «10» апреля 2026 г.) ----------
  xml = replaceHeaderDates(xml);

  // -- 3. Protocol number/year collapse ----------------------------------
  xml = collapseProtocolNumber(xml);

  // -- 3b. Conditions (temperature & pressure split across runs) ---------
  xml = collapseConditions(xml);

  // -- 3c. Product standard (long fragmented paragraph) ------------------
  xml = collapseProductStandard(xml);

  // -- 4. Locate tables & apply surgery ----------------------------------
  const tables = findTables(xml);
  if (tables.length < 4) {
    throw new Error(`Ожидалось ≥4 таблиц, найдено ${tables.length}`);
  }
  console.log(
    "Tables found:",
    tables.length,
    "(header / tools / main / footer)",
  );

  // Process from LAST to FIRST so earlier offsets stay valid.
  // Footer = last table (index tables.length-1)
  const footerTbl = tables[tables.length - 1];
  const newFooter = surgicalFooterTable(footerTbl.xml);
  xml = spliceXml(xml, footerTbl.start, footerTbl.end, newFooter);

  // Re-find after splice
  const tables2 = findTables(xml);
  // Main = tables2[2]  (4 tables total: 0 header, 1 tools, 2 main, 3 footer)
  const mainTbl = tables2[2];
  const newMain = surgicalMainTable(mainTbl.xml);
  xml = spliceXml(xml, mainTbl.start, mainTbl.end, newMain);

  // Re-find after splice
  const tables3 = findTables(xml);
  const toolsTbl = tables3[1];
  const newTools = surgicalToolsTable(toolsTbl.xml);
  xml = spliceXml(xml, toolsTbl.start, toolsTbl.end, newTools);

  // -- 5. Write back ------------------------------------------------------
  zip.file("word/document.xml", xml);
  console.log("Patched document.xml:", xml.length, "bytes");

  const out = zip.generate({ type: "nodebuffer" });

  // -- 6. Strict validation (XML parse + tag balance) --------------------
  // Fail the build immediately if the generated DOCX is structurally
  // corrupt — better than discovering it when Word refuses to open.
  validateDocxBuffer(out, "build-summary-template");
  console.log("Validation: ✓ all XML parts parsed and balanced");

  writeFileSync(OUT_TEMPLATE, out);
  console.log("Wrote", OUT_TEMPLATE, `(${out.length} bytes)`);
}

build();
