/**
 * Build public/templates/heaviness-protocol.docx by performing XML surgery
 * on the original reference DOCX ("10. Тяжесть каз-рус ГОТОВО kAZFOOD.docx").
 *
 * Strategy ("template-by-injection"):
 *   1. Take the reference DOCX as the layout truth.
 *   2. Trim document.xml down to one workplace block + the section properties.
 *   3. Wrap the kept block with docxtemplater loop tags
 *        {#workplaces} ... {/workplaces}
 *   4. INSIDE the block, replace the textual content of specific
 *      <w:t> nodes / table cells with docxtemplater placeholders,
 *      WITHOUT touching <w:pPr>, <w:tblPr>, <w:tcPr>, surrounding
 *      <w:r> structure, numbering refs, tab stops, indents, etc.
 *
 * This preserves the original Word formatting (hanging indents, line
 * spacing, italic/bold runs, justification, tab stops, font metrics, the
 * letterhead table, page breaks, etc.) — only the *values* are templated.
 *
 * Run: node scripts/build-heaviness-template.js
 */

const fs = require("fs");
const path = require("path");
const PizZip = require("pizzip");
const {
  findTopLevelChildren,
  findRows,
  findCells,
  closeTagEnd,
  replaceCellTextWithPlaceholder,
  replaceParagraphValue,
  tokenizeRuns,
  extractVisibleText,
  setIndent,
  setLeftTab,
  alignRightWithTab,
} = require("./lib/docx-template-helpers.js");

const ROOT = path.resolve(__dirname, "..");
const REF_DOCX = path.join(
  ROOT,
  "10. Тяжесть каз-рус ГОТОВО kAZFOOD.docx",
);
const OUT_TEMPLATE = path.join(
  ROOT,
  "public",
  "templates",
  "heaviness-protocol.docx",
);

// XML-surgery helpers (findTopLevelChildren / findRows / findCells /
// closeTagEnd / replaceCellTextWithPlaceholder / replaceParagraphValue /
// tokenizeRuns / extractVisibleText / setIndent / setLeftTab /
// alignRightWithTab) live in ./lib/docx-template-helpers.js — shared with
// build-tension-template.js (see require at the top).

// -------------------------------------------------------------------------
// Main pipeline
// -------------------------------------------------------------------------

const buf = fs.readFileSync(REF_DOCX);
const zip = new PizZip(buf);
let docXml = zip.file("word/document.xml").asText();

const bodyStartTagEnd = docXml.indexOf("<w:body>") + "<w:body>".length;
const bodyEndTagStart = docXml.indexOf("</w:body>");
const bodyHeader = docXml.substring(0, bodyStartTagEnd);
const bodyFooter = docXml.substring(bodyEndTagStart);

const allChildren = findTopLevelChildren(docXml, bodyStartTagEnd, bodyEndTagStart);

// The reference has 55 workplace blocks stacked. We keep only the first
// (children[0..41]) — that's children for the first workplace ending right
// BEFORE the second "Центр экспертной" header (which is children[42]).
const KEEP_FROM = 0;
// inclusive: last paragraph of the workplace that we WANT to repeat.  The
// reference has 14 filler empty paragraphs after the signature block (used
// once on page 1 to vertical-pad before the page break) — we drop those
// and emit an explicit <w:br w:type="page"/> instead, so every workplace
// starts on a fresh page just like the reference does for workplaces 2+.
const KEEP_TO = 26;
const SECT_PR = allChildren[allChildren.length - 1]; // <w:sectPr>
if (SECT_PR.tag !== "w:sectPr") {
  throw new Error(
    `Expected last child to be <w:sectPr>, got <${SECT_PR.tag}> — refusing to proceed.`,
  );
}

// Slice the kept block from byte ranges.
const blockStart = allChildren[KEEP_FROM].start;
const blockEnd = allChildren[KEEP_TO].end;
let blockXml = docXml.substring(blockStart, blockEnd);
const sectPrXml = docXml.substring(SECT_PR.start, SECT_PR.end);

console.log(
  `Kept block: children[${KEEP_FROM}..${KEEP_TO}] = ${KEEP_TO - KEEP_FROM + 1} top-level elements, ${blockXml.length} bytes`,
);

// -------------------------------------------------------------------------
// PASS 1: text-injection inside the block.
//
// We operate on whole-paragraph or whole-table-cell substrings located via
// findTopLevelChildren on the *block* itself.
// -------------------------------------------------------------------------

const blockChildren = findTopLevelChildren(blockXml, 0, blockXml.length);
console.log(`Block has ${blockChildren.length} top-level children`);

// Sanity check — confirm structural assumptions
const expectedTags = ["w:tbl", "w:p", "w:p", "w:p", "w:p", "w:p", "w:p", "w:p", "w:p", "w:p", "w:p", "w:p", "w:p", "w:tbl"];
for (let i = 0; i < expectedTags.length; i++) {
  if (blockChildren[i].tag !== expectedTags[i]) {
    throw new Error(
      `Structural mismatch at child[${i}]: expected <${expectedTags[i]}>, got <${blockChildren[i].tag}>`,
    );
  }
}

// We will build a list of byte-range replacements (in block coords) then
// apply them right-to-left so earlier offsets stay valid.
/** @type {{start:number, end:number, replacement:string}[]} */
const edits = [];

// ---- Header table (child[0]) ----
// The letterhead table is static — keep verbatim. No edits.

// ---- child[2]: "ПРОТОКОЛ № 0 SEQ Протокол ..." paragraph ----
{
  const c = blockChildren[2];
  const xml = blockXml.substring(c.start, c.end);
  // Replace the SEQ field's separated text "1" — keep the literal "№" prefix
  // and drop the rest, emitting just " {protocol.number}". The number is an
  // auto-sequential value per workplace (001, 002, …), filled in
  // buildTemplateContext via formatProtocolNumber — same scheme as tension.
  // To keep formatting (italic / Times New Roman / bCs), we keep the runs up
  // to and including the run that emits "№", then drop the rest.
  const replaced = replaceParagraphValue(
    xml,
    " {protocol.number}",
    { keepLeadingUntilText: /№$/ },
  );
  edits.push({ start: c.start, end: c.end, replacement: replaced });
}

// ---- child[6]: customer paragraph ----
// "Тапсырыс берушінің атауы және мекен-жайы (наименование и адрес заказчика):
//   <MERGEFIELD Наименование_и_Адрес ТОО «KazEcoFood», ...>"
// Keep everything up to & incl. the ":" then replace the value runs
// (which include a complex MERGEFIELD) with " {customer.name}, {customer.address}".
{
  const c = blockChildren[6];
  const xml = blockXml.substring(c.start, c.end);
  // Значение заказчика (наименование + адрес) подчёркиваем чёрным одинарным
  // подчёркиванием, как остальные заполняемые поля (должность/дата). В исходном
  // DOCX у этого рана <w:u> не было. valueRPr = исходный rPr значения +
  // <w:u w:val="single"/> (порядок CT_RPr: color → u → lang).
  const replaced = replaceParagraphValue(
    xml,
    " {customer.name}, {customer.address}",
    {
      keepLeadingUntilText: /:$/,
      valueRPr:
        '<w:rPr><w:rFonts w:ascii="Times New Roman" w:eastAsia="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:color w:val="000000"/><w:u w:val="single"/><w:lang w:val="kk-KZ" w:eastAsia="ru-RU"/></w:rPr>',
    },
  );
  edits.push({ start: c.start, end: c.end, replacement: replaced });
}

// ---- child[7]: measurementPlace ----
{
  const c = blockChildren[7];
  const xml = blockXml.substring(c.start, c.end);
  const replaced = replaceParagraphValue(xml, " {measurementPlace}", {
    keepLeadingUntilText: /:$/,
  });
  edits.push({ start: c.start, end: c.end, replacement: replaced });
}

// ---- child[8]: position ----
{
  const c = blockChildren[8];
  const xml = blockXml.substring(c.start, c.end);
  const replaced = replaceParagraphValue(xml, " {position}", {
    keepLeadingUntilText: /:$/,
  });
  edits.push({ start: c.start, end: c.end, replacement: replaced });
}

// ---- child[9]: date ----
{
  const c = blockChildren[9];
  const xml = blockXml.substring(c.start, c.end);
  const replaced = replaceParagraphValue(
    xml,
    " «{measurementDate.day}» {measurementDate.month} {measurementDate.year} г.",
    { keepLeadingUntilText: /:$/ },
  );
  edits.push({ start: c.start, end: c.end, replacement: replaced });
}

// ---- child[10]: workDescription ----
{
  const c = blockChildren[10];
  const xml = blockXml.substring(c.start, c.end);
  const replaced = replaceParagraphValue(xml, " {workDescription}", {
    keepLeadingUntilText: /:\s*$/,
  });
  edits.push({ start: c.start, end: c.end, replacement: replaced });
}

// ---- child[13]: the big results table ----
{
  const tableChild = blockChildren[13];
  const tableXml = blockXml.substring(tableChild.start, tableChild.end);
  const rows = findRows(tableXml);
  console.log(`Big table has ${rows.length} rows`);

  // Helper to emit edits in TABLE-LOCAL coords first, then shift to block coords.
  const tableEdits = []; // {start, end, replacement} in table-local

  // row[2]: code + position in cells 0 and 1 (vMerge restart); cells 2..7
  // belong to the section-1 header.
  {
    const r = rows[2];
    const rowXml = tableXml.substring(r.start, r.end);
    const cells = findCells(rowXml);
    if (cells.length < 2) throw new Error("row[2]: <2 cells");
    // cell 0 → {code}
    {
      const cellXml = rowXml.substring(cells[0].start, cells[0].end);
      const newCell = replaceCellTextWithPlaceholder(cellXml, "{code}");
      tableEdits.push({
        start: r.start + cells[0].start,
        end: r.start + cells[0].end,
        replacement: newCell,
      });
    }
    // cell 1 → {position}
    {
      const cellXml = rowXml.substring(cells[1].start, cells[1].end);
      const newCell = replaceCellTextWithPlaceholder(cellXml, "{position}");
      tableEdits.push({
        start: r.start + cells[1].start,
        end: r.start + cells[1].end,
        replacement: newCell,
      });
    }
  }

  // Data rows: each maps to an indicator prefix.  We replace cell 3
  // (value), cell 4 (c1), cell 5 (c2), cell 6 (c31), cell 7 (c32).
  const dataRows = [
    { row: 3, prefix: "p1_1" },
    { row: 5, prefix: "p1_2a" },
    { row: 6, prefix: "p1_2b" },
    { row: 8, prefix: "p2_1" },
    { row: 9, prefix: "p2_2" },
    { row: 11, prefix: "p2_3a" },
    { row: 12, prefix: "p2_3b" },
    { row: 14, prefix: "p3_1" },
    { row: 15, prefix: "p3_2" },
    { row: 17, prefix: "p4_1" },
    { row: 18, prefix: "p4_2" },
    { row: 19, prefix: "p4_3" },
    { row: 20, prefix: "p5" },
    { row: 21, prefix: "p6" },
    { row: 23, prefix: "p7_1" },
    { row: 24, prefix: "p7_2" },
  ];
  for (const { row: ri, prefix } of dataRows) {
    const r = rows[ri];
    if (!r) throw new Error(`Missing row ${ri}`);
    const rowXml = tableXml.substring(r.start, r.end);
    const cells = findCells(rowXml);
    if (cells.length !== 8) {
      throw new Error(
        `row[${ri}] (${prefix}) has ${cells.length} cells, expected 8`,
      );
    }
    const labels = ["value", "c1", "c2", "c31", "c32"];
    for (let k = 0; k < 5; k++) {
      const cellIdx = 3 + k;
      const cellXml = rowXml.substring(cells[cellIdx].start, cells[cellIdx].end);
      const ph = `{${prefix}_${labels[k]}}`;
      const newCell = replaceCellTextWithPlaceholder(cellXml, ph);
      tableEdits.push({
        start: r.start + cells[cellIdx].start,
        end: r.start + cells[cellIdx].end,
        replacement: newCell,
      });
    }
  }

  // row[25]: final assessment in cell 1.
  {
    const r = rows[25];
    if (!r) throw new Error("Missing row 25 (final assessment)");
    const rowXml = tableXml.substring(r.start, r.end);
    const cells = findCells(rowXml);
    if (cells.length < 2) throw new Error("row[25]: <2 cells");
    const cellXml = rowXml.substring(cells[1].start, cells[1].end);
    const newCell = replaceCellTextWithPlaceholder(cellXml, "{finalAssessment}");
    tableEdits.push({
      start: r.start + cells[1].start,
      end: r.start + cells[1].end,
      replacement: newCell,
    });
  }

  // Apply table edits right-to-left
  tableEdits.sort((a, b) => b.start - a.start);
  let newTable = tableXml;
  for (const e of tableEdits) {
    newTable = newTable.substring(0, e.start) + e.replacement + newTable.substring(e.end);
  }

  // Schedule one block-level edit replacing the entire table
  edits.push({
    start: tableChild.start,
    end: tableChild.end,
    replacement: newTable,
  });
}

// ---- Signature paragraphs ----
//  child[18] "Өлшеуді жүргізген  ...  Зертхана маманы" → align KZ title to the
//            signature column (tab) so it lines up with the rest of the column
//  child[19] "Оценку проводил:  ...  Специалист лаборатории" → keep label, replace name part with {performer.position}
//  child[20] "...Исаева А.В...." → {performer.fullName}, aligned to signature column
//  child[24] "Инженер по БиОТ" → {representative.position}
//  child[25] MERGEFIELD Богачев А.И. → {representative.fullName}

// Signature-column alignment (added 2026-06-15, client «выровняй подписи»):
// the reference pushes the right-hand signature column with fragile runs of
// literal spaces, so the performer title/name do NOT line up with the
// representative block (which uses a real indent left=4956 + firstLine=708 =
// 5664 tw). We normalise the whole right column to that SAME 5664-tw position:
// standalone lines get the indent, lines sharing a row with a left label get a
// left tab stop at 5664 and a tab in place of the spaces.
const SIGN_COL_TWIPS = 5664;

// child[18]: align "Зертхана маманы" to the signature column via a left tab.
{
  const c = blockChildren[18];
  const xml = blockXml.substring(c.start, c.end);
  if (!xml.includes("Зертхана")) {
    throw new Error(
      `child[18] is not the «Зертхана маманы» signature line — refusing to edit (got: ${xml.replace(/<[^>]+>/g, "").slice(0, 60)})`,
    );
  }
  edits.push({
    start: c.start,
    end: c.end,
    replacement: alignRightWithTab(xml, SIGN_COL_TWIPS),
  });
}

// child[19]: keep "Оценку проводил:" + indentation, replace "Специалист лаборатории" portion
{
  const c = blockChildren[19];
  const xml = blockXml.substring(c.start, c.end);
  const replaced = replaceParagraphValue(xml, "{performer.position}", {
    keepLeadingUntilText: /:.*\s$/,
  });
  edits.push({ start: c.start, end: c.end, replacement: replaced });
}

// child[20]: only the name "Исаева А.В."; this paragraph is just whitespace + name + whitespace.
// We replace everything (whole paragraph becomes whitespace + placeholder).
// Preserve the leading whitespace run for visual indentation by using keepLeadingUntilText
// matching the long spaces.  But simpler: just leave the leading spaces run intact and
// place placeholder after.
{
  const c = blockChildren[20];
  const xml = blockXml.substring(c.start, c.end);
  const replaced = replaceParagraphValue(xml, "{performer.fullName}", {
    // keep all leading whitespace-only runs
    keepLeadingUntilText: /\S/,
  });
  // Hmm — that condition triggers when we hit the first non-space char.
  // But the FIRST run with non-space is "Исаева А.В." which we WANT to drop.
  // We instead want to keep all runs whose text is pure whitespace.
  // Easier custom approach: keep all whitespace-only runs, drop the rest.
  const customised = (function () {
    const openTagEnd = xml.indexOf(">") + 1;
    const openTag = xml.substring(0, openTagEnd);
    const inner = xml.substring(openTagEnd, xml.length - "</w:p>".length);
    let pPr = "";
    let body = inner;
    const pPrMatch = inner.match(/^\s*<w:pPr>[\s\S]*?<\/w:pPr>/);
    if (pPrMatch) {
      pPr = pPrMatch[0];
      body = inner.substring(pPrMatch[0].length);
    }
    // Align the performer name to the SAME signature column as the
    // representative block (ind left=4956 firstLine=708 = 5664 tw) instead of a
    // fragile leading-space run, so «Исаева А.В.» lines up under «Зертхана
    // маманы» and over «Богачев А.И.». Drop the leading whitespace runs.
    pPr = setIndent(pPr, 4956, 708);
    const tokens = tokenizeRuns(body);
    // rPr cloned from the run that carries the visible name.
    let nameRPr = "";
    for (const t of tokens) {
      if (t.kind !== "r") continue;
      if (/\S/.test(extractVisibleText(t.xml))) {
        const m = t.xml.match(/<w:rPr>[\s\S]*?<\/w:rPr>/);
        if (m) nameRPr = m[0];
        break;
      }
    }
    const placeholderRun = `<w:r>${nameRPr}<w:t xml:space="preserve">{performer.fullName}</w:t></w:r>`;
    return openTag + pPr + placeholderRun + "</w:p>";
  })();
  // Use the customised variant
  edits.push({ start: c.start, end: c.end, replacement: customised });
  // (the earlier `replaced` is discarded — never pushed)
  void replaced;
}

// child[24]: "Инженер по БиОТ" — single non-whitespace text run.
{
  const c = blockChildren[24];
  const xml = blockXml.substring(c.start, c.end);
  const customised = (function () {
    const openTagEnd = xml.indexOf(">") + 1;
    const openTag = xml.substring(0, openTagEnd);
    const inner = xml.substring(openTagEnd, xml.length - "</w:p>".length);
    let pPr = "";
    let body = inner;
    const pPrMatch = inner.match(/^\s*<w:pPr>[\s\S]*?<\/w:pPr>/);
    if (pPrMatch) {
      pPr = pPrMatch[0];
      body = inner.substring(pPrMatch[0].length);
    }
    const tokens = tokenizeRuns(body);
    // Drop all <w:r>, insert one placeholder run with rPr cloned from the
    // first existing run (italic Times New Roman size 24).
    let rPr = "";
    for (const t of tokens) {
      if (t.kind !== "r") continue;
      const m = t.xml.match(/<w:rPr>[\s\S]*?<\/w:rPr>/);
      if (m) {
        rPr = m[0];
        break;
      }
    }
    const placeholderRun = `<w:r>${rPr}<w:t xml:space="preserve">{representative.position}</w:t></w:r>`;
    const nonRunTokens = tokens.filter((t) => t.kind !== "r").map((t) => t.xml).join("");
    return openTag + pPr + placeholderRun + nonRunTokens + "</w:p>";
  })();
  edits.push({ start: c.start, end: c.end, replacement: customised });
}

// child[25]: MERGEFIELD ФИО_ Богачев А.И. — drop the entire complex field
// and replace with a single run.
{
  const c = blockChildren[25];
  const xml = blockXml.substring(c.start, c.end);
  const customised = (function () {
    const openTagEnd = xml.indexOf(">") + 1;
    const openTag = xml.substring(0, openTagEnd);
    const inner = xml.substring(openTagEnd, xml.length - "</w:p>".length);
    let pPr = "";
    let body = inner;
    const pPrMatch = inner.match(/^\s*<w:pPr>[\s\S]*?<\/w:pPr>/);
    if (pPrMatch) {
      pPr = pPrMatch[0];
      body = inner.substring(pPrMatch[0].length);
    }
    const tokens = tokenizeRuns(body);
    // Find the rPr from the run that actually contains the visible name
    // (the one between fldChar separate and end).  We just look for the
    // first <w:t> in any run.
    let rPr = "";
    for (const t of tokens) {
      if (t.kind !== "r") continue;
      if (/<w:t[\s>]/.test(t.xml)) {
        const m = t.xml.match(/<w:rPr>[\s\S]*?<\/w:rPr>/);
        if (m) {
          rPr = m[0];
          break;
        }
      }
    }
    if (!rPr) {
      for (const t of tokens) {
        if (t.kind !== "r") continue;
        const m = t.xml.match(/<w:rPr>[\s\S]*?<\/w:rPr>/);
        if (m) {
          rPr = m[0];
          break;
        }
      }
    }
    const placeholderRun = `<w:r>${rPr}<w:t xml:space="preserve">{representative.fullName}</w:t></w:r>`;
    return openTag + pPr + placeholderRun + "</w:p>";
  })();
  edits.push({ start: c.start, end: c.end, replacement: customised });
}

// -------------------------------------------------------------------------
// Apply all block edits right-to-left.
// -------------------------------------------------------------------------
edits.sort((a, b) => b.start - a.start);
let newBlock = blockXml;
for (const e of edits) {
  newBlock = newBlock.substring(0, e.start) + e.replacement + newBlock.substring(e.end);
}

// -------------------------------------------------------------------------
// Wrap the block with {#workplaces} ... {/workplaces} loop tags.
//
// docxtemplater with paragraphLoop:true treats a paragraph containing
// JUST a loop tag as the loop boundary and removes that paragraph from
// output. So we add two minimal paragraphs.
// -------------------------------------------------------------------------
const loopStartP =
  `<w:p><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/>` +
  `<w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/>` +
  `<w:sz w:val="2"/></w:rPr></w:pPr>` +
  `<w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/>` +
  `<w:sz w:val="2"/></w:rPr><w:t xml:space="preserve">{#workplaces}</w:t></w:r></w:p>`;
const loopEndP = loopStartP.replace("{#workplaces}", "{/workplaces}");

// Hard page break placed at the end of each iteration so workplace N+1
// starts on a new page (matches the reference's per-page-per-workplace
// layout).
const pageBreakP =
  `<w:p><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr>` +
  `<w:r><w:br w:type="page"/></w:r></w:p>`;

// -------------------------------------------------------------------------
// Numbering-list restart sentinels (see tension builder for full rationale).
// Each <w:numId w:val="N"/> inside the loop body becomes a sentinel so the
// run-time hook (src/lib/docs/numberingRestart.ts) can clone the matching
// numbering.xml <w:num> definition per iteration, forcing Word to restart
// the list counter for every workplace.
// -------------------------------------------------------------------------
{
  let slotK = 0;
  newBlock = newBlock.replace(
    /<w:numId\s+w:val="(\d+)"\s*\/>/g,
    (_m, origId) => {
      const k = slotK++;
      return `<w:numId w:val="__NUMID_${origId}_SLOT_${k}__"/>`;
    },
  );
  console.log(`Inserted ${slotK} numId restart sentinels into loop body`);
}

const newBody =
  bodyHeader +
  loopStartP +
  newBlock +
  pageBreakP +
  loopEndP +
  sectPrXml +
  bodyFooter;

// -------------------------------------------------------------------------
// Write new document.xml back into a copy of the reference DOCX.
// We KEEP everything else (numbering.xml, styles.xml, theme, fontTable,
// header1.xml, etc.) verbatim — they back the formatting we just preserved.
// -------------------------------------------------------------------------
zip.file("word/document.xml", newBody);

const outBuf = zip.generate({ type: "nodebuffer" });
fs.writeFileSync(OUT_TEMPLATE, outBuf);
console.log(`Wrote ${OUT_TEMPLATE} (${outBuf.length} bytes)`);
console.log(
  `New document.xml: ${newBody.length} bytes (reference body was ${bodyEndTagStart - bodyStartTagEnd} bytes)`,
);
