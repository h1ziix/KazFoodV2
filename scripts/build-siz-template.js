/**
 * Сборка DOCX-шаблона для протокола №13 «Оценка обеспеченности СИЗ».
 *
 * Использует public/templates/lighting-protocol.docx как базу (styles/theme/
 * settings/numbering и т. п.), целиком заменяет word/document.xml на
 * собственный с docxtemplater-плейсхолдерами и вложенными циклами
 * {#sections}{#rows}…{/rows}{/sections}.
 *
 * Запуск: node scripts/build-siz-template.js
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
  "siz-protocol.docx",
);

// -------- XML helpers --------

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
    size = 22,
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
    size = 18,
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
  const { width = 1000, gridSpan = 1, vMerge, shd } = opts;
  const tcW = `<w:tcW w:w="${width}" w:type="dxa"/>`;
  const span = gridSpan > 1 ? `<w:gridSpan w:val="${gridSpan}"/>` : "";
  const merge = vMerge
    ? `<w:vMerge${vMerge === "restart" ? ' w:val="restart"' : ""}/>`
    : "";
  const shading = shd
    ? `<w:shd w:val="clear" w:color="auto" w:fill="${shd}"/>`
    : "";
  const borders = `<w:tcBorders><w:top w:val="single" w:sz="4" w:color="auto"/><w:left w:val="single" w:sz="4" w:color="auto"/><w:bottom w:val="single" w:sz="4" w:color="auto"/><w:right w:val="single" w:sz="4" w:color="auto"/></w:tcBorders>`;
  const tcPr = `<w:tcPr>${tcW}${span}${merge}${borders}${shading}<w:vAlign w:val="center"/></w:tcPr>`;
  return `<w:tc>${tcPr}${content}</w:tc>`;
}

function tr(...cells) {
  return `<w:tr>${cells.join("")}</w:tr>`;
}

// -------- Header --------

function labHeader() {
  return [
    p("«Центр экспертной оценки условий труда» ЖШС", {
      bold: true,
      align: "center",
      size: 22,
    }),
    p("Сынақ зертханасы", { bold: true, align: "center", size: 22 }),
    p("Алматы қ., Турксиб ауданы, Остроумов көш., 50А үй", {
      align: "center",
      size: 20,
    }),
    p("Телефон/факс: +7 777 231 70 74, +7 700 992 05 59", {
      align: "center",
      size: 20,
    }),
    p("Е-mail: info@hse-profi.kz", { bold: true, align: "center", size: 20 }),
    p("KZ.T.02.E1210 Аккредиттеу аттестаты", {
      bold: true,
      align: "center",
      size: 20,
    }),
    p("2022 ж. 25 шілде 2022 ж.", { bold: true, align: "center", size: 20 }),
    p("25 шілде 2027 дейін", { bold: true, align: "center", size: 20 }),
  ].join("");
}

function protocolTitle() {
  return [
    p("№{protocol.number} ХАТТАМАСЫ", {
      bold: true,
      align: "center",
      size: 24,
      before: 200,
    }),
    p("ПРОТОКОЛ №{protocol.number}", {
      bold: true,
      align: "center",
      size: 26,
    }),
    p("қызметкерлердің жеке қорғану құралдарымен қамтамасыздандырылуын бағалау", {
      bold: true,
      italic: true,
      align: "center",
      size: 22,
    }),
    p(
      "оценки обеспеченности работника специальной одеждой, специальной обувью и средствами индивидуальной защиты",
      { bold: true, align: "center", size: 22 },
    ),
  ].join("");
}

function customerBlock() {
  return [
    p(
      "Тапсырыс берушінің атауы және мекен-жайы (наименование и адрес заказчика): {customer.name}, {customer.address}",
      { bold: true, size: 22, before: 120 },
    ),
    p(
      "Өлшеу жүргізу орны (место проведения оценки): {measurementPlace}",
      { bold: true, size: 22 },
    ),
    p(
      "Өлшем жүргізу күні (дата проведения оценки): «{measurementDate.day}» {measurementDate.month} {measurementDate.year} г.",
      { bold: true, size: 22 },
    ),
    p(
      "ЖҚҚ-мен қамсыздандырылуды бағалау (результаты оценки обеспеченности средствами индивидуальной защиты):",
      { bold: true, size: 22, after: 120 },
    ),
  ].join("");
}

// -------- Main table --------

const COLS = {
  code: 1100,
  position: 1800,
  count: 600,
  norm: 3500,
  issued: 900,
  cert: 1200,
  assess: 1300,
  note: 800,
};
const COL_ORDER = [
  COLS.code,
  COLS.position,
  COLS.count,
  COLS.norm,
  COLS.issued,
  COLS.cert,
  COLS.assess,
  COLS.note,
];
const TOTAL_WIDTH = COL_ORDER.reduce((a, b) => a + b, 0);

// Two-row header: row 1 has merged "Перечень СИЗ" cell spanning issued+cert+norm,
// but проще — два уровня заголовков с vMerge для одиночных колонок и
// gridSpan=3 для группы "СИЗ".
function tableHeader() {
  // Row 1
  const row1 = tr(
    tc(
      cellP(
        "Жұмыс орнының коды (код рабочего места)",
        { bold: true, size: 13 },
      ),
      { width: COLS.code, vMerge: "restart", shd: "DDEBF7" },
    ),
    tc(
      cellP(
        "Кәсіптер мен лауазымдардың атауы (наименование профессий, должностей)",
        { bold: true, size: 13 },
      ),
      { width: COLS.position, vMerge: "restart", shd: "DDEBF7" },
    ),
    tc(
      cellP(
        "Жұмыс орнының саны (кол-во рабочих мест)",
        { bold: true, size: 13 },
      ),
      { width: COLS.count, vMerge: "restart", shd: "DDEBF7" },
    ),
    tc(
      cellP(
        "Қызметкерге берілуге тиіс ЖҚҚ тізілімі (перечень СИЗ, которые должны быть выданы работнику)",
        { bold: true, size: 13 },
      ),
      {
        width: COLS.norm + COLS.issued + COLS.cert,
        gridSpan: 3,
        shd: "DDEBF7",
      },
    ),
    tc(
      cellP(
        "ЖҚҚ-мен қамсыздандырылуды бағалау (оценка обеспеченности СИЗ: обеспечен / необеспечен)",
        { bold: true, size: 13 },
      ),
      { width: COLS.assess, vMerge: "restart", shd: "DDEBF7" },
    ),
    tc(
      cellP("Ескерту (примечание)", { bold: true, size: 13 }),
      { width: COLS.note, vMerge: "restart", shd: "DDEBF7" },
    ),
  );
  // Row 2 — подколонки группы "СИЗ"
  const row2 = tr(
    tc(cellP("", {}), { width: COLS.code, vMerge: "continue" }),
    tc(cellP("", {}), { width: COLS.position, vMerge: "continue" }),
    tc(cellP("", {}), { width: COLS.count, vMerge: "continue" }),
    tc(
      cellP(
        "Қолданыстағы нормаға сәйкес (согласно действующим нормам)",
        { bold: true, size: 12 },
      ),
      { width: COLS.norm, shd: "EAF2FA" },
    ),
    tc(
      cellP("Нақты берілгені (фактически выдано) Да/Нет", {
        bold: true,
        size: 12,
      }),
      { width: COLS.issued, shd: "EAF2FA" },
    ),
    tc(
      cellP("ГОСТ, наличие сертификата", { bold: true, size: 12 }),
      { width: COLS.cert, shd: "EAF2FA" },
    ),
    tc(cellP("", {}), { width: COLS.assess, vMerge: "continue" }),
    tc(cellP("", {}), { width: COLS.note, vMerge: "continue" }),
  );
  return row1 + row2;
}

function ctrlRow(tag) {
  return tr(
    tc(cellRaw(tag), { width: TOTAL_WIDTH, gridSpan: COL_ORDER.length }),
  );
}

function sectionTitleRow() {
  return tr(
    tc(
      cellP("{section_title}", { bold: true, size: 18, align: "left" }),
      { width: TOTAL_WIDTH, gridSpan: COL_ORDER.length, shd: "F2F2F2" },
    ),
  );
}

function dataRow() {
  return tr(
    tc(cellP("{code}", { size: 16 }), { width: COLS.code }),
    tc(cellP("{position}", { size: 16, align: "left" }), {
      width: COLS.position,
    }),
    tc(cellP("{count}", { size: 16 }), { width: COLS.count }),
    tc(cellP("{normItems}", { size: 14, align: "left" }), {
      width: COLS.norm,
    }),
    tc(cellP("{issuedFact}", { size: 16 }), { width: COLS.issued }),
    tc(cellP("{certificate}", { size: 14 }), { width: COLS.cert }),
    tc(cellP("{assessment}", { size: 14 }), { width: COLS.assess }),
    tc(cellP("{note}", { size: 16 }), { width: COLS.note }),
  );
}

function sizTable() {
  const tblPr = `<w:tblPr><w:tblW w:w="${TOTAL_WIDTH}" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders><w:top w:val="single" w:sz="4" w:color="auto"/><w:left w:val="single" w:sz="4" w:color="auto"/><w:bottom w:val="single" w:sz="4" w:color="auto"/><w:right w:val="single" w:sz="4" w:color="auto"/><w:insideH w:val="single" w:sz="4" w:color="auto"/><w:insideV w:val="single" w:sz="4" w:color="auto"/></w:tblBorders></w:tblPr>`;
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
  ].join("");
  return `<w:tbl>${tblPr}${grid}${rows}</w:tbl>`;
}

function signaturesBlock() {
  return [
    p("Өлшеуді жүргізген:                          Зертхананың аға маманы", {
      size: 22,
      before: 200,
    }),
    p(
      "                                                                    Старший специалист лаборатории",
      { size: 22 },
    ),
    p(
      "Оценку проводил:                          {performer.position}    {performer.fullName}",
      { size: 22 },
    ),
    p("Ұйымның өкілі:", { size: 22, before: 120 }),
    p(
      "Представитель организации:        {representative.position}    {representative.fullName}",
      { size: 22 },
    ),
  ].join("");
}

// -------- Compose document.xml --------

function buildDocumentXml() {
  // Альбомная ориентация — таблица широкая (8 колонок).
  const sectPr = `<w:sectPr><w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/><w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720" w:header="708" w:footer="708" w:gutter="0"/><w:cols w:space="708"/><w:docGrid w:linePitch="360"/></w:sectPr>`;

  const body = `<w:body>${labHeader()}${protocolTitle()}${customerBlock()}${sizTable()}${signaturesBlock()}${sectPr}</w:body>`;

  const docOpen = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">`;
  return `${docOpen}${body}</w:document>`;
}

// -------- Build --------

function build() {
  const baseBuf = fs.readFileSync(BASE_TEMPLATE);
  const zip = new PizZip(baseBuf);

  const newRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/><Relationship Id="rId6" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/webSettings" Target="webSettings.xml"/><Relationship Id="rId7" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footnotes" Target="footnotes.xml"/><Relationship Id="rId8" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/endnotes" Target="endnotes.xml"/><Relationship Id="rId12" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/fontTable" Target="fontTable.xml"/><Relationship Id="rId13" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/><Relationship Id="rId4" Type="http://schemas.microsoft.com/office/2007/relationships/stylesWithEffects" Target="stylesWithEffects.xml"/><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/customXml" Target="../customXml/item1.xml"/></Relationships>`;

  zip.file("word/document.xml", buildDocumentXml());
  zip.file("word/_rels/document.xml.rels", newRels);

  [
    "word/footer1.xml",
    "word/media/image1.png",
    "word/media/image2.png",
    "word/document.xml.new",
  ].forEach((p) => {
    if (zip.file(p)) zip.remove(p);
  });

  const ct = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/customXml/itemProps1.xml" ContentType="application/vnd.openxmlformats-officedocument.customXmlProperties+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/stylesWithEffects.xml" ContentType="application/vnd.ms-word.stylesWithEffects+xml"/><Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/><Override PartName="/word/webSettings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.webSettings+xml"/><Override PartName="/word/footnotes.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml"/><Override PartName="/word/endnotes.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.endnotes+xml"/><Override PartName="/word/fontTable.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.fontTable+xml"/><Override PartName="/word/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`;
  zip.file("[Content_Types].xml", ct);

  const out = zip.generate({ type: "nodebuffer" });
  fs.writeFileSync(OUT_TEMPLATE, out);
  console.log(`Wrote ${OUT_TEMPLATE} (${out.length} bytes)`);
}

build();
