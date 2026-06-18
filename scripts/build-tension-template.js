/**
 * Build public/templates/tension-protocol.docx by performing XML surgery
 * on the original reference DOCX
 *   ("11. Напряженность каз-рус ГОТОВО KAZFOOD.docx").
 *
 * Strategy ("template-by-injection"), identical to build-heaviness-template.js:
 *   1. Take the reference DOCX as the layout truth.
 *   2. Slice document.xml down to ONE workplace block + the section
 *      properties.  We use workplace #2 (children[25..48]) as the
 *      canonical loop body — it is a clean 24-element block, free of the
 *      orphan <w:bookmarkEnd/> that lives inside workplace #1.
 *   3. Wrap the kept block with docxtemplater loop tags
 *        {#workplaces} ... {/workplaces}
 *   4. INSIDE the block, replace the textual content of specific
 *      <w:t> nodes / table cells with docxtemplater placeholders,
 *      WITHOUT touching <w:pPr>, <w:tblPr>, <w:tcPr>, surrounding
 *      <w:r> structure, numbering refs, tab stops, indents, etc.
 *
 * This preserves the original Word formatting (hanging indents, line
 * spacing, italic/bold runs, justification, tab stops, font metrics,
 * the letterhead table, page breaks, vMerge cells, header1.xml with the
 * top-right "Приложение № 3 к Приказу МЗ РК 1057..." line, etc.) — only
 * the *values* are templated.
 *
 * Run: node scripts/build-tension-template.js
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
  "11. Напряженность каз-рус ГОТОВО KAZFOOD.docx",
);
const OUT_TEMPLATE = path.join(
  ROOT,
  "public",
  "templates",
  "tension-protocol.docx",
);

// XML-surgery helpers live in ./lib/docx-template-helpers.js — shared with
// build-heaviness-template.js (see require at the top).

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

const allChildren = findTopLevelChildren(
  docXml,
  bodyStartTagEnd,
  bodyEndTagStart,
);

// Reference layout: 55 workplaces, each 24 top-level children.
// Workplace #1 (children[0..24]) is anomalous — it contains an orphan
// <w:bookmarkEnd/> at index 6 between the title and the customer block.
// Workplace #2 (children[25..48]) is a clean canonical block; use it.
const KEEP_FROM = 25;
const KEEP_TO = 48; // inclusive — 24 children: 1 letterhead table + 11 paragraphs + 1 results table + 11 signature paragraphs
const SECT_PR = allChildren[allChildren.length - 1];
if (SECT_PR.tag !== "w:sectPr") {
  throw new Error(
    `Expected last child to be <w:sectPr>, got <${SECT_PR.tag}> — refusing to proceed.`,
  );
}

const blockStart = allChildren[KEEP_FROM].start;
const blockEnd = allChildren[KEEP_TO].end;
let blockXml = docXml.substring(blockStart, blockEnd);
const sectPrXml = docXml.substring(SECT_PR.start, SECT_PR.end);

console.log(
  `Kept block: children[${KEEP_FROM}..${KEEP_TO}] = ${KEEP_TO - KEEP_FROM + 1} top-level elements, ${blockXml.length} bytes`,
);

// -------------------------------------------------------------------------
// PASS 1: text-injection inside the block.
// -------------------------------------------------------------------------

const blockChildren = findTopLevelChildren(blockXml, 0, blockXml.length);
console.log(`Block has ${blockChildren.length} top-level children`);

// Sanity check — canonical workplace block layout
const expectedTags = [
  "w:tbl", // 0  letterhead table
  "w:p",   // 1  empty
  "w:p",   // 2  "ПРОТОКОЛ № ..."
  "w:p",   // 3  KZ subtitle
  "w:p",   // 4  RU subtitle
  "w:p",   // 5  empty
  "w:p",   // 6  customer
  "w:p",   // 7  measurementPlace
  "w:p",   // 8  position
  "w:p",   // 9  date
  "w:p",   // 10 workDescription
  "w:p",   // 11 results-section heading (static)
  "w:p",   // 12 empty
  "w:tbl", // 13 big results table
  "w:p",   // 14 empty
  "w:p",   // 15 empty
  "w:p",   // 16 "Өлшеуді жүргізген ... Зертхана маманы" (static)
  "w:p",   // 17 "Оценку проводил: ... Специалист лаборатории"
  "w:p",   // 18 "Исаева А.В."
  "w:p",   // 19 empty
  "w:p",   // 20 "Ұйымның өкілі" (static)
  "w:p",   // 21 "Представитель организации:" (static italic)
  "w:p",   // 22 "Инженер по БиОТ"
  "w:p",   // 23 MERGEFIELD ФИО_ → Богачев А.И.
];
for (let i = 0; i < expectedTags.length; i++) {
  if (blockChildren[i].tag !== expectedTags[i]) {
    throw new Error(
      `Structural mismatch at child[${i}]: expected <${expectedTags[i]}>, got <${blockChildren[i].tag}>`,
    );
  }
}

/** @type {{start:number, end:number, replacement:string}[]} */
const edits = [];

// ---- child[0]: letterhead table — static, keep verbatim. ----

// ---- child[2]: "ПРОТОКОЛ № ... SEQ Протокол ..." ----
// Reference structure (split across runs):
//   "ПРОТОКОЛ" + " №0" + SEQ field (cached "2") + ...
// We want to keep ONLY the very first run ("ПРОТОКОЛ"), drop the rest
// (literal "0", the SEQ field, all of it), and re-emit " № {protocol.number}".
{
  const c = blockChildren[2];
  const xml = blockXml.substring(c.start, c.end);
  const replaced = replaceParagraphValue(xml, " № {protocol.number}", {
    keepLeadingUntilText: /ПРОТОКОЛ$/,
  });
  edits.push({ start: c.start, end: c.end, replacement: replaced });
}

// ---- child[6]: customer (name + address) ----
// "1. ... (наименование и адрес заказчика): <MERGEFIELD value>"
{
  const c = blockChildren[6];
  const xml = blockXml.substring(c.start, c.end);
  const replaced = replaceParagraphValue(
    xml,
    " {customer.name}, {customer.address}",
    { keepLeadingUntilText: /:\s*$/ },
  );
  edits.push({ start: c.start, end: c.end, replacement: replaced });
}

// ---- child[7]: measurementPlace ----
{
  const c = blockChildren[7];
  const xml = blockXml.substring(c.start, c.end);
  const replaced = replaceParagraphValue(xml, " {measurementPlace}", {
    keepLeadingUntilText: /:\s*$/,
  });
  edits.push({ start: c.start, end: c.end, replacement: replaced });
}

// ---- child[8]: position ----
{
  const c = blockChildren[8];
  const xml = blockXml.substring(c.start, c.end);
  const replaced = replaceParagraphValue(xml, " {position}", {
    keepLeadingUntilText: /:\s*$/,
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
    { keepLeadingUntilText: /:\s*$/ },
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

// ---- child[11]: results heading — static, keep verbatim. ----

// ---- child[13]: the big indicators table ----
{
  const tableChild = blockChildren[13];
  const tableXml = blockXml.substring(tableChild.start, tableChild.end);
  const rows = findRows(tableXml);
  console.log(`Big table has ${rows.length} rows`);
  if (rows.length !== 31) {
    throw new Error(`Expected 31 rows in big table, got ${rows.length}`);
  }

  const tableEdits = []; // {start, end, replacement} in table-local coords

  // row[2] cell[0]=code (vMerge restart), cell[1]=position (vMerge restart),
  // cell[2]=section-1 title (static).
  {
    const r = rows[2];
    const rowXml = tableXml.substring(r.start, r.end);
    const cells = findCells(rowXml);
    if (cells.length < 2) throw new Error("row[2]: <2 cells");
    {
      const cellXml = rowXml.substring(cells[0].start, cells[0].end);
      const newCell = replaceCellTextWithPlaceholder(cellXml, "{code}");
      tableEdits.push({
        start: r.start + cells[0].start,
        end: r.start + cells[0].end,
        replacement: newCell,
      });
    }
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

  // Data rows: each maps to an indicator prefix.  Tension table has 7
  // columns per data row: [code-vMerge, position-vMerge, label, c1, c2,
  // c3.1, c3.2].  No fact-value column.  We replace cells [3..6] with
  // class-mark placeholders.
  const dataRows = [
    { row: 3,  prefix: "p1_1" },
    { row: 4,  prefix: "p1_2" },
    { row: 5,  prefix: "p1_3" },
    { row: 6,  prefix: "p1_4" },
    { row: 8,  prefix: "p2_1" },
    { row: 9,  prefix: "p2_2" },
    { row: 10, prefix: "p2_3" },
    { row: 11, prefix: "p2_4" },
    { row: 12, prefix: "p2_5" },
    { row: 13, prefix: "p2_6" },
    { row: 14, prefix: "p2_7" },
    { row: 15, prefix: "p2_8" },
    { row: 17, prefix: "p3_1" },
    { row: 18, prefix: "p3_2" },
    { row: 19, prefix: "p3_3" },
    { row: 21, prefix: "p4_1" },
    { row: 22, prefix: "p4_2" },
    { row: 23, prefix: "p4_3" },
    { row: 24, prefix: "p4_4" },
    { row: 26, prefix: "p5_1" },
    { row: 27, prefix: "p5_2" },
    { row: 28, prefix: "p5_3" },
  ];
  const classSuffixes = ["c1", "c2", "c31", "c32"];
  for (const { row: ri, prefix } of dataRows) {
    const r = rows[ri];
    if (!r) throw new Error(`Missing row ${ri}`);
    const rowXml = tableXml.substring(r.start, r.end);
    const cells = findCells(rowXml);
    if (cells.length !== 7) {
      throw new Error(
        `row[${ri}] (${prefix}) has ${cells.length} cells, expected 7`,
      );
    }
    for (let k = 0; k < 4; k++) {
      const cellIdx = 3 + k;
      const cellXml = rowXml.substring(cells[cellIdx].start, cells[cellIdx].end);
      const ph = `{${prefix}_${classSuffixes[k]}}`;
      const newCell = replaceCellTextWithPlaceholder(cellXml, ph);
      tableEdits.push({
        start: r.start + cells[cellIdx].start,
        end: r.start + cells[cellIdx].end,
        replacement: newCell,
      });
    }
  }

  // row[29]: "Көрсеткіштер саны / Количество показателей в каждом классе".
  // 5 cells: [0]=label(gridSpan=3), [1..4]=count per class (c1..c3.2).
  {
    const r = rows[29];
    if (!r) throw new Error("Missing row 29 (class counts)");
    const rowXml = tableXml.substring(r.start, r.end);
    const cells = findCells(rowXml);
    if (cells.length !== 5) {
      throw new Error(`row[29] has ${cells.length} cells, expected 5`);
    }
    for (let k = 0; k < 4; k++) {
      const cellIdx = 1 + k;
      const cellXml = rowXml.substring(cells[cellIdx].start, cells[cellIdx].end);
      const ph = `{count_${classSuffixes[k]}}`;
      const newCell = replaceCellTextWithPlaceholder(cellXml, ph);
      tableEdits.push({
        start: r.start + cells[cellIdx].start,
        end: r.start + cells[cellIdx].end,
        replacement: newCell,
      });
    }
  }

  // row[30]: "Еңбек кернеулігін бағалау / Общая оценка..." — cell[1] = result text.
  {
    const r = rows[30];
    if (!r) throw new Error("Missing row 30 (final assessment)");
    const rowXml = tableXml.substring(r.start, r.end);
    const cells = findCells(rowXml);
    if (cells.length < 2) throw new Error("row[30]: <2 cells");
    const cellXml = rowXml.substring(cells[1].start, cells[1].end);
    const newCell = replaceCellTextWithPlaceholder(cellXml, "{finalAssessment}");
    tableEdits.push({
      start: r.start + cells[1].start,
      end: r.start + cells[1].end,
      replacement: newCell,
    });
  }

  tableEdits.sort((a, b) => b.start - a.start);
  let newTable = tableXml;
  for (const e of tableEdits) {
    newTable =
      newTable.substring(0, e.start) + e.replacement + newTable.substring(e.end);
  }

  edits.push({
    start: tableChild.start,
    end: tableChild.end,
    replacement: newTable,
  });
}

// ---- Signature block ----
// Signature-column alignment (added 2026-06-15, client «выровняй подписи»):
// the reference positions the right-hand signature column with fragile runs of
// literal spaces (Зертхана маманы, {performer.position}, {performer.fullName}),
// so they don't line up with the representative block, which uses a real indent
// left=4956 + firstLine=708 = 5664 tw. We normalise the whole right column to
// that same 5664-tw position: standalone lines get the indent, lines sharing a
// row with a left label get a left tab stop at 5664 and a tab for the spaces.
const SIGN_COL_TWIPS = 5664;

// child[16]: "Өлшеуді жүргізген ... Зертхана маманы" — align KZ title to the
// signature column (5664 tw) via a left tab instead of fragile spaces.
{
  const c = blockChildren[16];
  const xml = blockXml.substring(c.start, c.end);
  if (!xml.includes("Зертхана")) {
    throw new Error(
      `child[16] is not the «Зертхана маманы» signature line — refusing to edit (got: ${xml.replace(/<[^>]+>/g, "").slice(0, 60)})`,
    );
  }
  edits.push({ start: c.start, end: c.end, replacement: alignRightWithTab(xml, SIGN_COL_TWIPS) });
}

// child[17]: "Оценку проводил:  <spaces>  {performer.position}" → keep the
// label, drop the spaces, put {performer.position} at the signature column via
// a left tab so it lines up with the rest of the right column.
{
  const c = blockChildren[17];
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
    // Keep runs up to and including the run that holds the "Оценку проводил:"
    // label (the colon), then a tab to the signature column, then the position.
    let accumulated = "";
    let colonIdx = -1;
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].kind !== "r") continue;
      accumulated += extractVisibleText(tokens[i].xml);
      if (/:/.test(accumulated)) { colonIdx = i; break; }
    }
    let positionRPr = "";
    for (let i = colonIdx + 1; i < tokens.length; i++) {
      if (tokens[i].kind !== "r") continue;
      if (/\S/.test(extractVisibleText(tokens[i].xml))) {
        const m = tokens[i].xml.match(/<w:rPr>[\s\S]*?<\/w:rPr>/);
        if (m) positionRPr = m[0];
        break;
      }
    }
    const kept = tokens.slice(0, colonIdx + 1).map((t) => t.xml).join("");
    const placeholderRun = `<w:r>${positionRPr}<w:t xml:space="preserve">{performer.position}</w:t></w:r>`;
    return (
      openTag +
      setLeftTab(pPr, SIGN_COL_TWIPS) +
      kept +
      "<w:r><w:tab/></w:r>" +
      placeholderRun +
      "</w:p>"
    );
  })();
  edits.push({ start: c.start, end: c.end, replacement: customised });
}

// child[18]: "<spaces>Исаева А.В.<spaces>" → align the name to the signature
// column (ind left=4956 firstLine=708 = 5664 tw, same as the representative
// block) instead of a fragile leading-space run, and drop the spaces.
{
  const c = blockChildren[18];
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
    let nameRPr = "";
    for (const t of tokenizeRuns(body)) {
      if (t.kind === "r" && /\S/.test(extractVisibleText(t.xml))) {
        const m = t.xml.match(/<w:rPr>[\s\S]*?<\/w:rPr>/);
        if (m) nameRPr = m[0];
        break;
      }
    }
    const placeholderRun = `<w:r>${nameRPr}<w:t xml:space="preserve">{performer.fullName}</w:t></w:r>`;
    return openTag + setIndent(pPr, 4956, 708) + placeholderRun + "</w:p>";
  })();
  edits.push({ start: c.start, end: c.end, replacement: customised });
}

// child[20]: "Ұйымның өкілі" + trailing spaces — static.
// child[21]: italic "Представитель организации:" — static.
// child[22]: italic "Инженер по БиОТ" → {representative.position}.
{
  const c = blockChildren[22];
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
    const nonRunTokens = tokens
      .filter((t) => t.kind !== "r")
      .map((t) => t.xml)
      .join("");
    return openTag + pPr + placeholderRun + nonRunTokens + "</w:p>";
  })();
  edits.push({ start: c.start, end: c.end, replacement: customised });
}

// child[23]: MERGEFIELD ФИО_ → Богачев А.И. → {representative.fullName}.
{
  const c = blockChildren[23];
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
    // Pick rPr from the run that contains the visible <w:t>Богачев А.И.</w:t>.
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
// Apply all block edits right-to-left so earlier offsets stay valid.
// -------------------------------------------------------------------------
edits.sort((a, b) => b.start - a.start);
let newBlock = blockXml;
for (const e of edits) {
  newBlock =
    newBlock.substring(0, e.start) + e.replacement + newBlock.substring(e.end);
}

// -------------------------------------------------------------------------
// Wrap the block with {#workplaces} ... {/workplaces} loop tags and end
// each iteration with a hard page break — exactly as the reference stacks
// each workplace on its own page.
// -------------------------------------------------------------------------
const loopStartP =
  `<w:p><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/>` +
  `<w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/>` +
  `<w:sz w:val="2"/></w:rPr></w:pPr>` +
  `<w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/>` +
  `<w:sz w:val="2"/></w:rPr><w:t xml:space="preserve">{#workplaces}</w:t></w:r></w:p>`;
const loopEndP = loopStartP.replace("{#workplaces}", "{/workplaces}");

const pageBreakP =
  `<w:p><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr>` +
  `<w:r><w:br w:type="page"/></w:r></w:p>`;

// -------------------------------------------------------------------------
// Numbering-list restart sentinels.
// Every <w:numId w:val="N"/> inside the loop body refers to a Word list
// instance whose counter would otherwise CONTINUE across iterations (since
// docxtemplater simply duplicates the same XML). To force per-workplace
// restart we rewrite each reference into a sentinel that the run-time
// hook (src/lib/docs/numberingRestart.ts → restartListNumberingPerLoop)
// expands back into either the ORIGINAL numId (first iteration) or a
// freshly cloned numId pointing at the same abstractNumId (iterations
// 2..N). Slot index K is assigned per unique reference position inside
// the loop body so that the run-time hook can group occurrences by slot.
// We process ONLY references inside `newBlock` (the loop body), not in
// `loopStartP`/`loopEndP`/`pageBreakP`/`sectPrXml`/`bodyHeader`.
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
// Write back into a copy of the reference DOCX.  We KEEP everything else
// verbatim — numbering.xml, styles.xml, theme, fontTable, header1.xml
// (with the top-right "Приложение № 3..." regulation line), footers,
// rels, content types.  Only word/document.xml is replaced.
// -------------------------------------------------------------------------
zip.file("word/document.xml", newBody);

const outBuf = zip.generate({ type: "nodebuffer" });
fs.writeFileSync(OUT_TEMPLATE, outBuf);
console.log(`Wrote ${OUT_TEMPLATE} (${outBuf.length} bytes)`);
console.log(
  `New document.xml: ${newBody.length} bytes (reference body was ${bodyEndTagStart - bodyStartTagEnd} bytes)`,
);
