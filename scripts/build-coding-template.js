/**
 * Сборка DOCX-шаблона для документа №13 «Кодировка рабочих мест».
 *
 * SOURCE OF TRUTH: оригинальный референсный DOCX
 *   "3. Кодировка каз-рус kazfood.docx"
 * лежит в корне проекта. Этот скрипт ОТКРЫВАЕТ его как PizZip,
 * выполняет ТОЛЬКО хирургические правки внутри `word/document.xml`:
 *
 *   1. В существующих абзацах шапки «УТВЕРЖДАЮ» / даты — заменяет
 *      содержимое ПЕРВОГО `<w:r>` на токены docxtemplater,
 *      сохраняя `<w:pPr>` (alignment / spacing / indent) и
 *      `<w:rPr>` (font / bold / size / color) этого первого run-а.
 *      Все остальные `<w:r>` / `<w:proofErr>` / `SEQ`-поля внутри
 *      этого `<w:p>` удаляются. НИ ОДИН исходный атрибут / property
 *      не реконструируется.
 *
 *   2. В таблице (35 строк original):
 *        R0  — заголовочная строка → оставлена как есть;
 *        R1  — section-1 header     → текст заменён на `{section1.header}`;
 *        R2  — первая admin-строка  → ячейки заменены на токены
 *              `{code}` / `{name}` / `{count}`, и эта самая `<w:tr>`
 *              обёрнута control-row'ами с тегами
 *              `{#section1.rows}` ... `{/section1.rows}`;
 *        R3..R14 — удалены (это были заполненные строки оригинала,
 *              их заменит docxtemplater-loop);
 *        R15 — section-2 header     → `{section2.header}`;
 *        R16 — первая production-строка → токены + обёртка
 *              `{#section2.rows}` ... `{/section2.rows}`;
 *        R17..R33 — удалены;
 *        R34 — итоговая строка      → `Итого: {grand_total} р/м`.
 *
 *   3. Все остальные части DOCX (styles.xml, fontTable.xml, theme,
 *      settings.xml, _rels, [Content_Types].xml, media, sectPr, …)
 *      берутся из оригинала БЕЗ изменений.
 *
 * НЕ rebuild XML manually. НЕ synthesize tables. НЕ flatten formatting.
 *
 * Запуск: node scripts/build-coding-template.js
 */

"use strict";

const fs = require("fs");
const path = require("path");
const PizZip = require("pizzip");

const ROOT = path.resolve(__dirname, "..");
const ORIGINAL_DOCX = path.join(
  ROOT,
  "3. Кодировка каз-рус kazfood.docx",
);
const OUT_TEMPLATE = path.join(
  ROOT,
  "public",
  "templates",
  "coding-protocol.docx",
);

// ---------------------------------------------------------------------------
// Surgical helpers — работают на строке UTF-8 XML, без DOM-парсера, без
// regenerate-а параграфов. Каждая функция должна МЕНЯТЬ строго один
// небольшой кусок XML и возвращать новую строку body XML.
// ---------------------------------------------------------------------------

/**
 * Сканер top-level элементов внутри <w:body>: возвращает массив
 * { tag, start, end, xml } для прямых детей.
 */
function scanTopLevel(s, tagNames) {
  const set = new Set(tagNames);
  const out = [];
  let i = 0;
  while (i < s.length) {
    while (i < s.length && /\s/.test(s[i])) i++;
    if (i >= s.length) break;
    if (s[i] !== "<") {
      i++;
      continue;
    }
    const m = s.slice(i, i + 40).match(/^<([a-zA-Z0-9]+:[a-zA-Z0-9]+)\b/);
    if (!m) {
      const n = s.indexOf("<", i + 1);
      i = n < 0 ? s.length : n;
      continue;
    }
    const tag = m[1];
    if (!set.has(tag)) {
      // skip just this element (find its end, balanced)
      const j = balancedEnd(s, i, tag);
      i = j;
      continue;
    }
    const j = balancedEnd(s, i, tag);
    out.push({ tag, start: i, end: j, xml: s.slice(i, j) });
    i = j;
  }
  return out;
}

function balancedEnd(s, start, tag) {
  const open = `<${tag}`;
  const close = `</${tag}>`;
  let depth = 0;
  let j = start;
  while (j < s.length) {
    if (
      s.startsWith(open, j) &&
      (s[j + open.length] === " " || s[j + open.length] === ">")
    ) {
      const gt = s.indexOf(">", j);
      depth++;
      if (s[gt - 1] === "/") {
        depth--;
        j = gt + 1;
        if (depth === 0) return j;
        continue;
      }
      j = gt + 1;
      continue;
    }
    if (s.startsWith(close, j)) {
      depth--;
      j += close.length;
      if (depth === 0) return j;
      continue;
    }
    j++;
  }
  return s.length;
}

function xmlEscape(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Surgical paragraph rewrite.
 *
 * Internally: keep <w:p ...attrs>, keep its <w:pPr>...</w:pPr>, keep the
 * FIRST run's <w:rPr>...</w:rPr>, but rebuild only the run body so it
 * carries a single <w:t xml:space="preserve">NEW</w:t>. Everything else
 * inside the paragraph (subsequent runs, proofErr, fldChar/SEQ, bookmarks,
 * hyperlinks) is dropped — they reference deleted text and would otherwise
 * leave orphan field markers behind.
 *
 * Returns: rewritten <w:p>...</w:p> XML.
 */
function rewriteParagraphText(paragraphXml, newText) {
  // strip outer <w:p ...> ... </w:p>
  const openMatch = paragraphXml.match(/^<w:p\b([^>]*)>/);
  if (!openMatch) {
    throw new Error("rewriteParagraphText: not a <w:p> element");
  }
  const attrs = openMatch[1];
  // pPr (optional)
  let pPr = "";
  const inner = paragraphXml.slice(openMatch[0].length, -"</w:p>".length);
  const pPrMatch = inner.match(/^\s*(<w:pPr\b[^>]*\/>|<w:pPr\b[^>]*>[\s\S]*?<\/w:pPr>)/);
  if (pPrMatch) {
    pPr = pPrMatch[1];
  }
  const afterPPr = pPr ? inner.slice(pPrMatch[0].length) : inner;
  // first <w:r>...</w:r>
  const rOpenIdx = afterPPr.search(/<w:r\b/);
  let rPr = "";
  if (rOpenIdx !== -1) {
    const rEnd = balancedEnd(afterPPr, rOpenIdx, "w:r");
    const rXml = afterPPr.slice(rOpenIdx, rEnd);
    const rInnerOpen = rXml.match(/^<w:r\b[^>]*>/);
    if (rInnerOpen) {
      const rInner = rXml.slice(rInnerOpen[0].length, -"</w:r>".length);
      const rPrMatch = rInner.match(
        /^\s*(<w:rPr\b[^>]*\/>|<w:rPr\b[^>]*>[\s\S]*?<\/w:rPr>)/,
      );
      if (rPrMatch) rPr = rPrMatch[1];
    }
  }
  // Compose: take first <w:r ...> open tag attrs as well — but to be safe use bare <w:r>
  const newRun =
    `<w:r>${rPr}<w:t xml:space="preserve">${xmlEscape(newText)}</w:t></w:r>`;
  return `<w:p${attrs}>${pPr}${newRun}</w:p>`;
}

/**
 * Apply rewriteParagraphText to ALL <w:p> children directly inside `rootXml`
 * (depth 1). For each paragraph, replacementText(index) decides:
 *   • return a string → rewrite paragraph text;
 *   • return null      → leave paragraph untouched.
 */
function mapParagraphs(rootXml, decide) {
  // rootXml is "<...><w:p>...</w:p>...<...>..."
  // We need to find top-level <w:p> elements (not those nested inside <w:tbl>).
  // Use a simple state machine that tracks depth of <w:tbl> only.
  let out = "";
  let i = 0;
  let pIdx = 0;
  let tblDepth = 0;
  while (i < rootXml.length) {
    if (rootXml.startsWith("<w:tbl", i) && (rootXml[i + 6] === " " || rootXml[i + 6] === ">")) {
      // skip whole table verbatim
      const j = balancedEnd(rootXml, i, "w:tbl");
      out += rootXml.slice(i, j);
      i = j;
      continue;
    }
    if (
      tblDepth === 0 &&
      rootXml.startsWith("<w:p", i) &&
      (rootXml[i + 4] === " " || rootXml[i + 4] === ">")
    ) {
      const j = balancedEnd(rootXml, i, "w:p");
      const pXml = rootXml.slice(i, j);
      const replacement = decide(pIdx, pXml);
      out += replacement === null ? pXml : rewriteParagraphText(pXml, replacement);
      pIdx++;
      i = j;
      continue;
    }
    out += rootXml[i];
    i++;
  }
  return out;
}

/**
 * Find the single <w:tbl>...</w:tbl> in body and let mutator(tableXml)
 * return new table XML.
 */
function mutateTable(bodyXml, mutator) {
  const start = bodyXml.indexOf("<w:tbl>");
  if (start === -1) throw new Error("no <w:tbl> in body");
  const end = balancedEnd(bodyXml, start, "w:tbl");
  return bodyXml.slice(0, start) + mutator(bodyXml.slice(start, end)) + bodyXml.slice(end);
}

/**
 * Mutator on a table: process each <w:tr> by index.
 * decide(index, trXml) returns:
 *   • string of XML (zero or more rows) to substitute,
 *   • or null → keep row unchanged.
 */
function mapRows(tableXml, decide) {
  // table is "<w:tbl><w:tblPr>...</w:tblPr><w:tblGrid>...</w:tblGrid> <w:tr>...</w:tr> ... </w:tbl>"
  const openMatch = tableXml.match(/^<w:tbl\b[^>]*>/);
  if (!openMatch) throw new Error("not a <w:tbl>");
  const open = openMatch[0];
  const inner = tableXml.slice(open.length, -"</w:tbl>".length);
  // copy prologue until first <w:tr ...>
  const firstTr = inner.search(/<w:tr\b/);
  const prologue = firstTr === -1 ? inner : inner.slice(0, firstTr);
  let body = firstTr === -1 ? "" : inner.slice(firstTr);
  let out = open + prologue;
  let rowIdx = 0;
  while (body.length) {
    if (!body.startsWith("<w:tr")) break;
    const end = balancedEnd(body, 0, "w:tr");
    const trXml = body.slice(0, end);
    const sub = decide(rowIdx, trXml);
    out += sub === null ? trXml : sub;
    body = body.slice(end);
    // also keep any whitespace between rows
    const ws = body.match(/^\s+/);
    if (ws) {
      out += ws[0];
      body = body.slice(ws[0].length);
    }
    rowIdx++;
  }
  // tail (anything after last row that isn't a row)
  out += body;
  out += "</w:tbl>";
  return out;
}

/**
 * Apply rewriteParagraphText to all <w:p> inside an arbitrary XML fragment
 * (used for table rows where each cell has one paragraph).
 * decide(globalParagraphIndex, paragraphXml) → string | null
 */
function mapParagraphsAnywhere(xml, decide) {
  let out = "";
  let i = 0;
  let pIdx = 0;
  while (i < xml.length) {
    if (
      xml.startsWith("<w:p", i) &&
      (xml[i + 4] === " " || xml[i + 4] === ">")
    ) {
      const j = balancedEnd(xml, i, "w:p");
      const pXml = xml.slice(i, j);
      const repl = decide(pIdx, pXml);
      out += repl === null ? pXml : rewriteParagraphText(pXml, repl);
      pIdx++;
      i = j;
      continue;
    }
    out += xml[i];
    i++;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function build() {
  if (!fs.existsSync(ORIGINAL_DOCX)) {
    throw new Error(
      `Original reference DOCX not found: ${ORIGINAL_DOCX}\n` +
        `Это обязательный source-of-truth для шаблона кодировки.`,
    );
  }

  const origBuf = fs.readFileSync(ORIGINAL_DOCX);
  const zip = new PizZip(origBuf);

  const docXmlEntry = zip.file("word/document.xml");
  if (!docXmlEntry) {
    throw new Error("Original DOCX missing word/document.xml");
  }
  const origXml = docXmlEntry.asText();

  // Locate <w:body>
  const bodyOpenMatch = origXml.match(/<w:body\b[^>]*>/);
  if (!bodyOpenMatch) throw new Error("no <w:body> in document.xml");
  const bodyOpenIdx = bodyOpenMatch.index;
  const bodyOpenLen = bodyOpenMatch[0].length;
  const bodyCloseIdx = origXml.lastIndexOf("</w:body>");
  const bodyXml = origXml.slice(bodyOpenIdx + bodyOpenLen, bodyCloseIdx);

  // --- (A) Replace text of header paragraphs and main title.
  // Original block layout (verified by inspection):
  //   P0  "УТВЕРЖДАЮ"               — keep as-is
  //   P1  "Директор "                → {approval.position}
  //   P2  "ТОО «KazEcoFood»"          → {approval.organization}
  //   P3  "Балян  Л.Н."               → {approval.fullName}
  //   P4  "«20» апреля 2026 г."       → «{approval.date.day}» {approval.date.month} {approval.date.year} г.
  //   P5  ""                          — keep (spacer)
  //   P6  ""                          — keep (spacer)
  //   P7  "Жұмыс орнын кодтау"       — keep
  //   P8  "Кодировка рабочих мест"   — keep
  //   then <w:tbl>
  //   P9  ""                          — keep (trailing)
  const headerMap = {
    0: null, // УТВЕРЖДАЮ
    1: "{approval.position}",
    2: "{approval.organization}",
    3: "{approval.fullName}",
    4: "«{approval.date.day}» {approval.date.month} {approval.date.year} г.",
  };
  let newBody = mapParagraphs(bodyXml, (idx) =>
    Object.prototype.hasOwnProperty.call(headerMap, idx)
      ? headerMap[idx]
      : null,
  );

  // --- (B) Mutate the single table.
  newBody = mutateTable(newBody, (tableXml) => {
    return mapRows(tableXml, (rowIdx, trXml) => {
      // R0 header row — leave intact.
      if (rowIdx === 0) return null;

      // R1: section 1 header row. Single merged cell, replace its first
      // paragraph's text with {section1_header}.
      if (rowIdx === 1) {
        const updated = mapParagraphsAnywhere(trXml, (pIdx) =>
          pIdx === 0 ? "{section1_header}" : null,
        );
        return updated;
      }

      // R2: first admin workplace row (template). Inline the loop tags
      // INSIDE the row's outer cells so docxtemplater detects a single-row
      // repeat. Pattern mirrors safety-protocol.docx (see
      // {#adminMeasurements}…{/adminMeasurements} там).
      if (rowIdx === 2) {
        const tokens = [
          "{#section1_rows}{code}",
          "{name}",
          "{count}{/section1_rows}",
        ];
        return mapParagraphsAnywhere(trXml, (pIdx) =>
          pIdx < tokens.length ? tokens[pIdx] : null,
        );
      }

      // R3..R14: drop (the loop replicates R2).
      if (rowIdx >= 3 && rowIdx <= 14) return "";

      // R15: section 2 header row.
      if (rowIdx === 15) {
        const updated = mapParagraphsAnywhere(trXml, (pIdx) =>
          pIdx === 0 ? "{section2_header}" : null,
        );
        return updated;
      }

      // R16: first production workplace row (template).
      if (rowIdx === 16) {
        const tokens = [
          "{#section2_rows}{code}",
          "{name}",
          "{count}{/section2_rows}",
        ];
        return mapParagraphsAnywhere(trXml, (pIdx) =>
          pIdx < tokens.length ? tokens[pIdx] : null,
        );
      }

      // R17..R33: drop.
      if (rowIdx >= 17 && rowIdx <= 33) return "";

      // R34: total row "Итого: 55 р/м" → "Итого: {grand_total} р/м".
      if (rowIdx === 34) {
        const updated = mapParagraphsAnywhere(trXml, (pIdx) =>
          pIdx === 0 ? "Итого: {grand_total} р/м" : null,
        );
        return updated;
      }

      return null;
    });
  });

  const newXml =
    origXml.slice(0, bodyOpenIdx + bodyOpenLen) +
    newBody +
    origXml.slice(bodyCloseIdx);

  zip.file("word/document.xml", newXml);

  const out = zip.generate({
    type: "nodebuffer",
    compression: "DEFLATE",
  });
  fs.writeFileSync(OUT_TEMPLATE, out);
  console.log(
    `Wrote ${OUT_TEMPLATE} (${out.length} bytes) from original (${origBuf.length} bytes)`,
  );
}

build();
