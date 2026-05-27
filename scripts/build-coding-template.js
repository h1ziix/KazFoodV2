/**
 * Сборка DOCX-шаблона для документа №13 «Кодировка рабочих мест».
 *
 * Структура шаблона:
 *   • Блок «УТВЕРЖДАЮ» (правый верх).
 *   • Заголовок «Жұмыс орнын кодтау / Кодировка рабочих мест».
 *   • Таблица 3 колонки (код / название / кол-во):
 *       header → {#sections} → section-header (заголовок с derived count)
 *                            → {#rows} data {/rows}
 *                          {/sections}
 *       → grand-total строка.
 *
 * Использует public/templates/lighting-protocol.docx как базу styles/theme.
 *
 * Запуск: node scripts/build-coding-template.js
 */

const fs = require("fs");
const path = require("path");
const PizZip = require("pizzip");

const ROOT = path.resolve(__dirname, "..");
const BASE_TEMPLATE = path.join(
  ROOT,
  "public",
  "templates",
  "lighting-protocol.docx",
);
const OUT_TEMPLATE = path.join(
  ROOT,
  "public",
  "templates",
  "coding-protocol.docx",
);

// -------- XML helpers (зеркально к build-siz-template.js) --------

function xmlEscape(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function p(text, opts = {}) {
  const {
    bold = false,
    italic = false,
    size = 24,
    align = "left",
    before = 0,
    after = 0,
  } = opts;
  const rPr = `<w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/>${
    bold ? "<w:b/>" : ""
  }${italic ? "<w:i/>" : ""}<w:sz w:val="${size}"/><w:szCs w:val="${size}"/><w:lang w:val="ru-RU"/></w:rPr>`;
  const pPr = `<w:pPr><w:spacing w:before="${before}" w:after="${after}" w:line="240" w:lineRule="auto"/><w:jc w:val="${align}"/></w:pPr>`;
  return `<w:p>${pPr}<w:r>${rPr}<w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r></w:p>`;
}

function cellP(text, opts = {}) {
  const {
    bold = false,
    italic = false,
    size = 22,
    align = "center",
  } = opts;
  const rPr = `<w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/>${
    bold ? "<w:b/>" : ""
  }${italic ? "<w:i/>" : ""}<w:sz w:val="${size}"/><w:szCs w:val="${size}"/><w:lang w:val="ru-RU"/></w:rPr>`;
  const pPr = `<w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/><w:jc w:val="${align}"/></w:pPr>`;
  return `<w:p>${pPr}<w:r>${rPr}<w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r></w:p>`;
}

function cellRaw(text) {
  const rPr = `<w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="2"/></w:rPr>`;
  const pPr = `<w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr>`;
  return `<w:p>${pPr}<w:r>${rPr}<w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r></w:p>`;
}

function tc(content, opts = {}) {
  const { width = 1000, gridSpan = 1, shd } = opts;
  const tcW = `<w:tcW w:w="${width}" w:type="dxa"/>`;
  const span = gridSpan > 1 ? `<w:gridSpan w:val="${gridSpan}"/>` : "";
  const shading = shd
    ? `<w:shd w:val="clear" w:color="auto" w:fill="${shd}"/>`
    : "";
  const borders = `<w:tcBorders><w:top w:val="single" w:sz="4" w:color="auto"/><w:left w:val="single" w:sz="4" w:color="auto"/><w:bottom w:val="single" w:sz="4" w:color="auto"/><w:right w:val="single" w:sz="4" w:color="auto"/></w:tcBorders>`;
  const tcPr = `<w:tcPr>${tcW}${span}${borders}${shading}<w:vAlign w:val="center"/></w:tcPr>`;
  return `<w:tc>${tcPr}${content}</w:tc>`;
}

function tr(...cells) {
  return `<w:tr>${cells.join("")}</w:tr>`;
}

// -------- Approval block --------

function approvalBlock() {
  return [
    p("УТВЕРЖДАЮ", { bold: true, align: "right", size: 24 }),
    p("{approval.position}", { bold: true, align: "right", size: 24 }),
    p("{approval.organization}", { bold: true, align: "right", size: 24 }),
    p("{approval.fullName}", { bold: true, align: "right", size: 24 }),
    p(
      "«{approval.date.day}» {approval.date.month} {approval.date.year} г.",
      { bold: true, align: "right", size: 24, after: 240 },
    ),
  ].join("");
}

function titleBlock() {
  return [
    p("Жұмыс орнын кодтау", {
      bold: true,
      align: "center",
      size: 28,
      before: 200,
    }),
    p("Кодировка рабочих мест", {
      bold: true,
      align: "center",
      size: 28,
      after: 200,
    }),
  ].join("");
}

// -------- Main table (3 columns) --------

const COLS = { code: 2200, name: 5800, count: 1500 };
const COL_ORDER = [COLS.code, COLS.name, COLS.count];
const TOTAL_WIDTH = COL_ORDER.reduce((a, b) => a + b, 0);

function tableHeader() {
  return tr(
    tc(
      cellP("Жұмыс орнының коды\nКод рабочего места", { bold: true, size: 20 }),
      { width: COLS.code, shd: "DDEBF7" },
    ),
    tc(
      cellP(
        "Жұмыс орнының атауы, жабдық\nНаименование рабочего места, оборудование",
        { bold: true, size: 20 },
      ),
      { width: COLS.name, shd: "DDEBF7" },
    ),
    tc(
      cellP("Жұмыс орнынын саны\nКол-во рабочих мест", { bold: true, size: 20 }),
      { width: COLS.count, shd: "DDEBF7" },
    ),
  );
}

function ctrlRow(tag) {
  return tr(
    tc(cellRaw(tag), { width: TOTAL_WIDTH, gridSpan: COL_ORDER.length }),
  );
}

function sectionTitleRow() {
  return tr(
    tc(
      cellP("{section_header}", { bold: true, size: 22, align: "left" }),
      { width: TOTAL_WIDTH, gridSpan: COL_ORDER.length, shd: "F2F2F2" },
    ),
  );
}

function dataRow() {
  return tr(
    tc(cellP("{code}", { size: 20 }), { width: COLS.code }),
    tc(cellP("{name}", { size: 20, align: "left" }), { width: COLS.name }),
    tc(cellP("{count}", { size: 20 }), { width: COLS.count }),
  );
}

function grandTotalRow() {
  return tr(
    tc(
      cellP("Итого: {grand_total} р/м", {
        bold: true,
        size: 22,
        align: "right",
      }),
      { width: TOTAL_WIDTH, gridSpan: COL_ORDER.length, shd: "DDEBF7" },
    ),
  );
}

function codingTable() {
  const tblPr = `<w:tblPr><w:tblW w:w="${TOTAL_WIDTH}" w:type="dxa"/><w:jc w:val="center"/><w:tblLayout w:type="fixed"/><w:tblBorders><w:top w:val="single" w:sz="4" w:color="auto"/><w:left w:val="single" w:sz="4" w:color="auto"/><w:bottom w:val="single" w:sz="4" w:color="auto"/><w:right w:val="single" w:sz="4" w:color="auto"/><w:insideH w:val="single" w:sz="4" w:color="auto"/><w:insideV w:val="single" w:sz="4" w:color="auto"/></w:tblBorders></w:tblPr>`;
  const grid = `<w:tblGrid>${COL_ORDER.map(
    (w) => `<w:gridCol w:w="${w}"/>`,
  ).join("")}</w:tblGrid>`;
  const rows = [
    tableHeader(),
    ctrlRow("{#sections}"),
    sectionTitleRow(),
    ctrlRow("{#rows}"),
    dataRow(),
    ctrlRow("{/rows}"),
    ctrlRow("{/sections}"),
    grandTotalRow(),
  ].join("");
  return `<w:tbl>${tblPr}${grid}${rows}</w:tbl>`;
}

// -------- Compose document.xml --------

function buildDocumentXml() {
  const sectPr = `<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="850" w:bottom="1134" w:left="1134" w:header="708" w:footer="708" w:gutter="0"/><w:cols w:space="708"/><w:docGrid w:linePitch="360"/></w:sectPr>`;
  // OOXML: <w:tbl> не может быть последним прямым потомком <w:body>;
  // Word трактует это как «обнаружено содержимое, которое не удалось
  // прочитать». Добавляем минимальный завершающий <w:p/>, как это
  // делает любой нормальный экспорт Word (см. безопасные шаблоны
  // safety / siz / summary — у них таблица всегда сопровождается
  // блоком подписей или пустым параграфом).
  const trailingP = `<w:p><w:pPr><w:spacing w:after="0"/></w:pPr></w:p>`;
  const body = `<w:body>${approvalBlock()}${titleBlock()}${codingTable()}${trailingP}${sectPr}</w:body>`;
  const docOpen = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">`;
  return `${docOpen}${body}</w:document>`;
}

function build() {
  const baseBuf = fs.readFileSync(BASE_TEMPLATE);
  const zip = new PizZip(baseBuf);

  const newRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/><Relationship Id="rId6" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/webSettings" Target="webSettings.xml"/><Relationship Id="rId7" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footnotes" Target="footnotes.xml"/><Relationship Id="rId8" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/endnotes" Target="endnotes.xml"/><Relationship Id="rId12" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/fontTable" Target="fontTable.xml"/><Relationship Id="rId13" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/><Relationship Id="rId4" Type="http://schemas.microsoft.com/office/2007/relationships/stylesWithEffects" Target="stylesWithEffects.xml"/><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/customXml" Target="../customXml/item1.xml"/></Relationships>`;

  zip.file("word/document.xml", buildDocumentXml());
  zip.file("word/_rels/document.xml.rels", newRels);

  ["word/footer1.xml", "word/media/image1.png", "word/media/image2.png", "word/document.xml.new"].forEach(
    (q) => {
      if (zip.file(q)) zip.remove(q);
    },
  );

  const ct = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/customXml/itemProps1.xml" ContentType="application/vnd.openxmlformats-officedocument.customXmlProperties+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/stylesWithEffects.xml" ContentType="application/vnd.ms-word.stylesWithEffects+xml"/><Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/><Override PartName="/word/webSettings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.webSettings+xml"/><Override PartName="/word/footnotes.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml"/><Override PartName="/word/endnotes.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.endnotes+xml"/><Override PartName="/word/fontTable.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.fontTable+xml"/><Override PartName="/word/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`;
  zip.file("[Content_Types].xml", ct);

  const out = zip.generate({ type: "nodebuffer" });
  fs.writeFileSync(OUT_TEMPLATE, out);
  console.log(`Wrote ${OUT_TEMPLATE} (${out.length} bytes)`);
}

build();
