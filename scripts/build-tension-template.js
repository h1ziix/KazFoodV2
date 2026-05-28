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

// -------------------------------------------------------------------------
// Generic XML helpers (verbatim from build-heaviness-template.js)
// -------------------------------------------------------------------------

function findTopLevelChildren(xml, from, to) {
  const out = [];
  let i = from;
  while (i < to) {
    while (i < to && /\s/.test(xml[i])) i++;
    if (i >= to) break;
    if (xml[i] !== "<") {
      i++;
      continue;
    }
    const tagStart = i;
    let j = i + 1;
    while (j < to && !/[\s>\/]/.test(xml[j])) j++;
    const tagName = xml.substring(i + 1, j);
    while (j < to && xml[j] !== ">") j++;
    const isSelfClose = xml[j - 1] === "/";
    j++;
    if (isSelfClose) {
      out.push({ tag: tagName, start: tagStart, end: j });
      i = j;
      continue;
    }
    const closeTag = `</${tagName}>`;
    const openTag = `<${tagName} `;
    const openTagAlt = `<${tagName}>`;
    let depth = 1;
    let k = j;
    while (k < to && depth > 0) {
      const nextClose = xml.indexOf(closeTag, k);
      if (nextClose < 0) {
        depth = 0;
        k = to;
        break;
      }
      let scan = k;
      while (true) {
        const a = xml.indexOf(openTag, scan);
        const b = xml.indexOf(openTagAlt, scan);
        let next;
        if (a < 0 && b < 0) next = -1;
        else if (a < 0) next = b;
        else if (b < 0) next = a;
        else next = Math.min(a, b);
        if (next < 0 || next > nextClose) break;
        depth++;
        scan = next + openTag.length;
      }
      depth--;
      k = nextClose + closeTag.length;
    }
    out.push({ tag: tagName, start: tagStart, end: k });
    i = k;
  }
  return out;
}

function findRows(tableXml) {
  const out = [];
  for (const m of tableXml.matchAll(/<w:tr[ >]/g)) {
    const s = m.index;
    const e = tableXml.indexOf("</w:tr>", s);
    if (e < 0) continue;
    out.push({ start: s, end: e + "</w:tr>".length });
  }
  return out;
}

function findCells(rowXml) {
  const out = [];
  let i = 0;
  while (true) {
    const s = rowXml.indexOf("<w:tc>", i);
    if (s < 0) {
      const s2 = rowXml.indexOf("<w:tc ", i);
      if (s2 < 0) break;
      const e2 = closeTagEnd(rowXml, s2, "w:tc");
      out.push({ start: s2, end: e2 });
      i = e2;
      continue;
    }
    const e = closeTagEnd(rowXml, s, "w:tc");
    out.push({ start: s, end: e });
    i = e;
  }
  return out;
}

function closeTagEnd(xml, openStart, tagName) {
  const openTag1 = `<${tagName}>`;
  const openTag2 = `<${tagName} `;
  const closeTag = `</${tagName}>`;
  let depth = 1;
  const gt = xml.indexOf(">", openStart);
  let i = gt + 1;
  while (depth > 0) {
    const nextClose = xml.indexOf(closeTag, i);
    if (nextClose < 0) throw new Error(`Unbalanced ${tagName}`);
    let scan = i;
    while (true) {
      const a = xml.indexOf(openTag1, scan);
      const b = xml.indexOf(openTag2, scan);
      let next;
      if (a < 0 && b < 0) next = -1;
      else if (a < 0) next = b;
      else if (b < 0) next = a;
      else next = Math.min(a, b);
      if (next < 0 || next > nextClose) break;
      depth++;
      scan = next + openTag1.length;
    }
    depth--;
    i = nextClose + closeTag.length;
  }
  return i;
}

// -------------------------------------------------------------------------
// Cell / paragraph value-injection helpers (verbatim from heaviness)
// -------------------------------------------------------------------------

function replaceCellTextWithPlaceholder(cellXml, placeholder) {
  const tcOpenEnd = cellXml.indexOf(">") + 1;
  const tcCloseStart = cellXml.lastIndexOf("</w:tc>");
  const inner = cellXml.substring(tcOpenEnd, tcCloseStart);

  let tcPr = "";
  let paragraphsRegion = inner;
  const tcPrMatch = inner.match(/^\s*<w:tcPr>[\s\S]*?<\/w:tcPr>/);
  if (tcPrMatch) {
    tcPr = tcPrMatch[0];
    paragraphsRegion = inner.substring(tcPrMatch[0].length);
  }

  const paragraphs = [];
  let i = 0;
  while (i < paragraphsRegion.length) {
    const pStart = paragraphsRegion.indexOf("<w:p", i);
    if (pStart < 0) break;
    const headerEnd = paragraphsRegion.indexOf(">", pStart) + 1;
    const isSelfClose = paragraphsRegion[headerEnd - 2] === "/";
    if (isSelfClose) {
      paragraphs.push({
        start: pStart,
        end: headerEnd,
        text: paragraphsRegion.substring(pStart, headerEnd),
        selfClose: true,
      });
      i = headerEnd;
      continue;
    }
    const pEnd =
      paragraphsRegion.indexOf("</w:p>", headerEnd) + "</w:p>".length;
    paragraphs.push({
      start: pStart,
      end: pEnd,
      text: paragraphsRegion.substring(pStart, pEnd),
      selfClose: false,
    });
    i = pEnd;
  }

  if (paragraphs.length === 0) {
    return (
      "<w:tc>" +
      tcPr +
      `<w:p><w:r><w:t xml:space="preserve">${placeholder}</w:t></w:r></w:p>` +
      "</w:tc>"
    );
  }

  const transformed = paragraphs.map((p, idx) => {
    if (p.selfClose) return p.text;
    const inside = p.text.substring(
      p.text.indexOf(">") + 1,
      p.text.length - "</w:p>".length,
    );
    let pPr = "";
    let body = inside;
    const pPrMatch = inside.match(/^\s*<w:pPr>[\s\S]*?<\/w:pPr>/);
    if (pPrMatch) {
      pPr = pPrMatch[0];
      body = inside.substring(pPrMatch[0].length);
    }
    let runRPr = "";
    const firstRunMatch = body.match(/<w:r(?:\s[^>]*)?>([\s\S]*?)<\/w:r>/);
    if (firstRunMatch) {
      const runInner = firstRunMatch[1];
      const rPrMatch = runInner.match(/^\s*<w:rPr>[\s\S]*?<\/w:rPr>/);
      if (rPrMatch) runRPr = rPrMatch[0];
    }
    if (!runRPr && pPr) {
      const pPrRPrMatch = pPr.match(/<w:rPr>[\s\S]*?<\/w:rPr>/);
      if (pPrRPrMatch) runRPr = pPrRPrMatch[0];
    }

    const openTagEnd = p.text.indexOf(">") + 1;
    const openTag = p.text.substring(0, openTagEnd);

    if (idx === 0) {
      const placeholderRun = `<w:r>${runRPr}<w:t xml:space="preserve">${placeholder}</w:t></w:r>`;
      return openTag + pPr + placeholderRun + "</w:p>";
    } else {
      return openTag + pPr + "</w:p>";
    }
  });

  return "<w:tc>" + tcPr + transformed.join("") + "</w:tc>";
}

function replaceParagraphValue(paragraphXml, placeholder, opts = {}) {
  const { keepLeadingUntilText = null, valueRPr = null } = opts;

  const openTagEnd = paragraphXml.indexOf(">") + 1;
  const openTag = paragraphXml.substring(0, openTagEnd);
  const close = "</w:p>";
  const inner = paragraphXml.substring(
    openTagEnd,
    paragraphXml.length - close.length,
  );

  let pPr = "";
  let body = inner;
  const pPrMatch = inner.match(/^\s*<w:pPr>[\s\S]*?<\/w:pPr>/);
  if (pPrMatch) {
    pPr = pPrMatch[0];
    body = inner.substring(pPrMatch[0].length);
  }

  const tokens = tokenizeRuns(body);

  let splitIdx = tokens.length;
  if (keepLeadingUntilText) {
    let accumulated = "";
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      if (t.kind === "r") accumulated += extractVisibleText(t.xml);
      if (keepLeadingUntilText.test(accumulated)) {
        splitIdx = i + 1;
        break;
      }
    }
  }

  const kept = tokens.slice(0, splitIdx);
  const trailing = tokens.slice(splitIdx);

  let runRPr = valueRPr || "";
  if (!runRPr) {
    for (let i = trailing.length - 1; i >= 0; i--) {
      if (trailing[i].kind === "r") {
        const m = trailing[i].xml.match(/<w:rPr>[\s\S]*?<\/w:rPr>/);
        if (m) {
          runRPr = m[0];
          break;
        }
      }
    }
  }
  if (!runRPr) {
    for (const t of trailing) {
      if (t.kind === "r") {
        const m = t.xml.match(/<w:rPr>[\s\S]*?<\/w:rPr>/);
        if (m) {
          runRPr = m[0];
          break;
        }
      }
    }
  }

  const trailingNonRuns = trailing
    .filter((t) => t.kind !== "r")
    .map((t) => t.xml)
    .join("");

  const placeholderRun = `<w:r>${runRPr}<w:t xml:space="preserve">${placeholder}</w:t></w:r>`;

  return (
    openTag +
    pPr +
    kept.map((t) => t.xml).join("") +
    placeholderRun +
    trailingNonRuns +
    close
  );
}

function tokenizeRuns(body) {
  const out = [];
  let i = 0;
  while (i < body.length) {
    while (i < body.length && /\s/.test(body[i])) i++;
    if (i >= body.length) break;
    if (body[i] !== "<") {
      i++;
      continue;
    }
    let j = i + 1;
    while (j < body.length && !/[\s>\/]/.test(body[j])) j++;
    const tagName = body.substring(i + 1, j);
    while (j < body.length && body[j] !== ">") j++;
    const isSelfClose = body[j - 1] === "/";
    j++;
    if (isSelfClose) {
      out.push({
        kind: tagName === "w:r" ? "r" : "other",
        xml: body.substring(i, j),
      });
      i = j;
      continue;
    }
    const closeTag = `</${tagName}>`;
    let depth = 1;
    let k = j;
    const openTag1 = `<${tagName}>`;
    const openTag2 = `<${tagName} `;
    while (k < body.length && depth > 0) {
      const nextClose = body.indexOf(closeTag, k);
      if (nextClose < 0) {
        depth = 0;
        k = body.length;
        break;
      }
      let scan = k;
      while (true) {
        const a = body.indexOf(openTag1, scan);
        const b = body.indexOf(openTag2, scan);
        let next;
        if (a < 0 && b < 0) next = -1;
        else if (a < 0) next = b;
        else if (b < 0) next = a;
        else next = Math.min(a, b);
        if (next < 0 || next > nextClose) break;
        depth++;
        scan = next + openTag1.length;
      }
      depth--;
      k = nextClose + closeTag.length;
    }
    out.push({
      kind: tagName === "w:r" ? "r" : "other",
      xml: body.substring(i, k),
    });
    i = k;
  }
  return out;
}

function extractVisibleText(xml) {
  return xml
    .replace(/<w:instrText[\s\S]*?<\/w:instrText>/g, "")
    .replace(/<[^>]+>/g, "");
}

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
    { keepLeadingUntilText: /:$/ },
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
// child[16]: "Өлшеуді жүргізген ... Зертхана маманы" — static (KZ), keep.
// child[17]: "Оценку проводил:      <spaces>     Специалист лаборатории"
//            → keep "Оценку проводил:" + whitespace runs, replace italic
//            position part with {performer.position}.
{
  const c = blockChildren[17];
  const xml = blockXml.substring(c.start, c.end);
  // The italic position part begins after ALL whitespace runs.  Use a
  // custom walk: keep runs until we hit a non-whitespace italic run that
  // is NOT the "Оценку проводил:" label (i.e., the second non-whitespace
  // run that starts the position name).
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
    // Walk runs; accumulate visible text; cut at the run that starts the
    // position text — i.e. once accumulated text matches "Оценку проводил:"
    // followed by spaces and then any non-whitespace.
    let accumulated = "";
    let cutAt = tokens.length;
    let positionRPr = "";
    let seenColon = false;
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].kind !== "r") continue;
      const t = extractVisibleText(tokens[i].xml);
      const before = accumulated;
      accumulated += t;
      if (!seenColon) {
        if (/:/.test(accumulated)) seenColon = true;
        continue;
      }
      // seenColon: skip whitespace-only runs; first non-whitespace run is position
      if (/\S/.test(t) && /\S/.test(accumulated.slice(before.length))) {
        cutAt = i;
        const m = tokens[i].xml.match(/<w:rPr>[\s\S]*?<\/w:rPr>/);
        if (m) positionRPr = m[0];
        break;
      }
    }
    const kept = tokens.slice(0, cutAt);
    const placeholderRun = `<w:r>${positionRPr}<w:t xml:space="preserve">{performer.position}</w:t></w:r>`;
    return (
      openTag +
      pPr +
      kept.map((t) => t.xml).join("") +
      placeholderRun +
      "</w:p>"
    );
  })();
  edits.push({ start: c.start, end: c.end, replacement: customised });
}

// child[18]: "<spaces>Исаева А.В.<spaces>" — replace name, preserve leading
// whitespace runs so the visual indentation is identical.
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
    const tokens = tokenizeRuns(body);
    // In the reference this paragraph has ONE run containing
    // "<many spaces>Исаева А.В." followed by another run of trailing
    // spaces.  We must preserve the leading spaces visually.  Strategy:
    //   - Take rPr from the first text run (carries the font).
    //   - Extract the leading whitespace from the first run's text and
    //     emit it as its own pure-whitespace run, then the placeholder
    //     run with the same rPr.
    let nameRPr = "";
    let leadingSpaces = "";
    const firstTextRunIdx = tokens.findIndex(
      (t) => t.kind === "r" && /<w:t[\s>]/.test(t.xml),
    );
    if (firstTextRunIdx >= 0) {
      const firstRun = tokens[firstTextRunIdx];
      const m = firstRun.xml.match(/<w:rPr>[\s\S]*?<\/w:rPr>/);
      if (m) nameRPr = m[0];
      // Extract concatenated text of the first run
      const visible = extractVisibleText(firstRun.xml);
      const ws = visible.match(/^\s*/);
      leadingSpaces = ws ? ws[0] : "";
    }
    const spacesRun = leadingSpaces
      ? `<w:r>${nameRPr}<w:t xml:space="preserve">${leadingSpaces}</w:t></w:r>`
      : "";
    const placeholderRun = `<w:r>${nameRPr}<w:t xml:space="preserve">{performer.fullName}</w:t></w:r>`;
    return openTag + pPr + spacesRun + placeholderRun + "</w:p>";
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
