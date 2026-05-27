/**
 * Сборка DOCX-шаблона для документа №9 «Сводный протокол вредности».
 *
 * Берёт за основу public/templates/lighting-protocol.docx (для styles/
 * theme/settings/numbering и т.п.), полностью заменяет word/document.xml
 * на собственный с docxtemplater-плейсхолдерами, и сохраняет результат
 * как public/templates/summary-protocol.docx.
 *
 * Запуск: node scripts/build-summary-template.js
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
  "summary-protocol.docx",
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

function cellP(text, opts = {}) {
  const { bold = false, italic = false, size = 18, align = "center" } = opts;
  const rPr = `<w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/>${
    bold ? "<w:b/>" : ""
  }${italic ? "<w:i/>" : ""}<w:sz w:val="${size}"/><w:szCs w:val="${size}"/><w:lang w:val="ru-RU"/></w:rPr>`;
  const pPr = `<w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/><w:jc w:val="${align}"/></w:pPr>`;
  return `<w:p>${pPr}<w:r>${rPr}<w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r></w:p>`;
}

function tr(...cells) {
  return `<w:tr>${cells.join("")}</w:tr>`;
}

// -------- Header lab block --------

function labHeader() {
  return [
    p(
      "Аккредиттеу субъектілерінің тізілімінде тіркелген KZ.T.02.E1210",
      { bold: true, align: "center", size: 20 },
    ),
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
    p("Е-mail: info@hse-profi.kz", {
      bold: true,
      align: "center",
      size: 20,
    }),
    p("KZ.T.02.E1210 Аккредиттеу аттестаты", {
      bold: true,
      align: "center",
      size: 20,
    }),
    p("2022 ж. 25 шілде 2022 ж. 25 шілде 2027 дейін", {
      bold: true,
      align: "center",
      size: 20,
    }),
  ].join("");
}

// -------- Protocol title --------

function protocolTitle() {
  return [
    p("Зиянды өндірістік факторларды өлшеу", {
      bold: true,
      italic: true,
      align: "center",
      size: 22,
      before: 200,
    }),
    p("ХАТТАМАСЫ", { bold: true, align: "center", size: 24 }),
    p("ПРОТОКОЛ", { bold: true, align: "center", size: 24 }),
    p("измерения вредных производственных факторов", {
      bold: true,
      align: "center",
      size: 22,
    }),
    p(
      "№ {protocol.number}, {protocol.year} г.    «{protocol.day}» {protocol.month} {protocol.dateYear} г.",
      { bold: true, align: "center", size: 22 },
    ),
  ].join("");
}

// -------- Header info block --------

function customerBlock() {
  return [
    p(
      "Тапсырыс берушінің атауы және мекен-жайы (наименование и адрес заказчика):",
      { bold: true, italic: true, size: 22, before: 200 },
    ),
    p("{customer.name}, {customer.address}", { size: 22 }),
    p("Өлшем жүргізу орны (место проведения измерений):", {
      bold: true,
      italic: true,
      size: 22,
    }),
    p("{measurementLocation}", { size: 22 }),
    p("Өлшем жүргізу күні (дата проведения измерений):", {
      bold: true,
      italic: true,
      size: 22,
    }),
    p(
      "«{measurementDate.day}» {measurementDate.month} {measurementDate.year} г.",
      { size: 22 },
    ),
    p("Үй-жайдың сипаттамасы (характеристика помещения):", {
      bold: true,
      italic: true,
      size: 22,
    }),
    p("{roomDescription}", { size: 22 }),
    p("Ұжымдық қорғану жүйесі (система коллективной защиты):", {
      bold: true,
      italic: true,
      size: 22,
    }),
    p("{collectiveProtection}", { size: 22 }),
    p(
      "Жабдықтардың түрі және олардың саны (виды оборудования и их количество):",
      { bold: true, italic: true, size: 22 },
    ),
    p("{equipment}", { size: 22 }),
    p(
      "Кәсіптер мен лауазымдардың атауы (наименование профессий, должностей):",
      { bold: true, italic: true, size: 22 },
    ),
    p("{professionsList}", { size: 22 }),
    p("Өлшеу құралдары (средства измерений):", {
      bold: true,
      italic: true,
      size: 22,
      before: 100,
    }),
  ].join("");
}

// -------- Measuring tools table --------

const MT = { num: 700, name: 5000, cert: 2200, date: 2100 };

function measuringToolsTable() {
  const tblPr = `<w:tblPr><w:tblW w:w="10000" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders><w:top w:val="single" w:sz="4" w:color="auto"/><w:left w:val="single" w:sz="4" w:color="auto"/><w:bottom w:val="single" w:sz="4" w:color="auto"/><w:right w:val="single" w:sz="4" w:color="auto"/><w:insideH w:val="single" w:sz="4" w:color="auto"/><w:insideV w:val="single" w:sz="4" w:color="auto"/></w:tblBorders></w:tblPr>`;
  const grid = `<w:tblGrid>${[MT.num, MT.name, MT.cert, MT.date]
    .map((w) => `<w:gridCol w:w="${w}"/>`)
    .join("")}</w:tblGrid>`;
  const header = tr(
    tc(cellP("№ р/с", { bold: true, size: 18 }), { width: MT.num }),
    tc(cellP("Атауы (наименование)", { bold: true, size: 18 }), {
      width: MT.name,
    }),
    tc(
      cellP(
        "Өлшем құралының салыстырып тексеру туралы сертификаты (Сертификат о поверке)",
        { bold: true, size: 16 },
      ),
      { width: MT.cert },
    ),
    tc(cellP("Тексеру күні (дата поверки)", { bold: true, size: 16 }), {
      width: MT.date,
    }),
  );
  // Loop row using {#measuringTools}...{/measuringTools}.
  const loopRow = tr(
    tc(cellP("{#measuringTools}{rowNumber}", { size: 18 }), {
      width: MT.num,
    }),
    tc(cellP("{name}", { size: 18, align: "left" }), { width: MT.name }),
    tc(cellP("{certificate}", { size: 18 }), { width: MT.cert }),
    tc(cellP("{verificationDate}{/measuringTools}", { size: 18 }), {
      width: MT.date,
    }),
  );
  return `<w:tbl>${tblPr}${grid}${header}${loopRow}</w:tbl>`;
}

// -------- After-tools header section --------

function afterToolsBlock() {
  return [
    p(
      "Өнімге (үлгіге) қатысты нормативтік құжат (нормативный документ на объект):",
      { bold: true, italic: true, size: 22, before: 150 },
    ),
    p("{productStandard}", { size: 22 }),
    p("Өлшем жүргізу жағдайлары (условия окружающей среды):", {
      bold: true,
      italic: true,
      size: 22,
    }),
    p("Температура: {conditions.temperature}", { size: 22 }),
    p("Относительная влажность: {conditions.humidity}", { size: 22 }),
    p("Атмосферное давление: {conditions.pressure}", { size: 22 }),
    p(
      "Зиянды өндірістік факторларды өлшеу нәтижесі (результаты измерений вредных производственных факторов):",
      { bold: true, italic: true, size: 22, before: 100 },
    ),
  ].join("");
}

// -------- Main measurements table --------
//
// 13 columns. Column groups:
//   1  code                 — Жұмыс орнының коды
//   2  profession           — Кәсіптер мен лауазымдардың атауы
//   3  count                — Жұмыс орнының саны
//   4  factor name+unit     — Өндірістік орта факторларының атауы
//   5  method               — НД на метод
//   6  norm                 — Норма, ПДК, ПДУ
//   7  actual               — Фактический уровень
//   8  class2  (допустимый)
//   9  class3.1 (вредный)
//  10  class3.2
//  11  class3.3
//  12  class3.4
//  13  class4   (опасный)

const COL = {
  code: 1100,
  profession: 1600,
  count: 600,
  factorName: 1600,
  method: 1100,
  norm: 700,
  actual: 700,
  cls: 420, // each of 6
};

function measurementsHeader() {
  // Row 1: group headers
  const row1 = tr(
    tc(cellP("Жұмыс орнының коды / код рабочего места", { bold: true, size: 14 }), { width: COL.code, vMerge: "restart" }),
    tc(cellP("Кәсіптер мен лауазымдардың атауы / наименование профессий, должностей", { bold: true, size: 14 }), { width: COL.profession, vMerge: "restart" }),
    tc(cellP("Жұмыс орнының саны / количество рабочих мест", { bold: true, size: 14 }), { width: COL.count, vMerge: "restart" }),
    tc(cellP("Өндірістік орта факторларының атауы, өлшеу бірлігі / наименование факторов производственной среды, единица измерения", { bold: true, size: 14 }), { width: COL.factorName, vMerge: "restart" }),
    tc(cellP("Өлшеу әдісіне арналған нормативтік құжат / Нормативный документ на метод измерения", { bold: true, size: 14 }), { width: COL.method, vMerge: "restart" }),
    tc(cellP("Норма, ПДК, ПДУ", { bold: true, size: 14 }), { width: COL.norm, vMerge: "restart" }),
    tc(cellP("Нақты деңгей / фактический уровень", { bold: true, size: 14 }), { width: COL.actual, vMerge: "restart" }),
    tc(cellP("Жұмыс жағдайларының классы / классы условий труда", { bold: true, size: 14 }), { width: COL.cls * 6, gridSpan: 6 }),
  );
  // Row 2: sub-group classes
  const row2 = tr(
    tc(cellP("", {}), { width: COL.code, vMerge: "continue" }),
    tc(cellP("", {}), { width: COL.profession, vMerge: "continue" }),
    tc(cellP("", {}), { width: COL.count, vMerge: "continue" }),
    tc(cellP("", {}), { width: COL.factorName, vMerge: "continue" }),
    tc(cellP("", {}), { width: COL.method, vMerge: "continue" }),
    tc(cellP("", {}), { width: COL.norm, vMerge: "continue" }),
    tc(cellP("", {}), { width: COL.actual, vMerge: "continue" }),
    tc(cellP("рұқсат етілген / допустимый", { bold: true, size: 12 }), { width: COL.cls }),
    tc(cellP("зиянды / вредный", { bold: true, size: 12, }), { width: COL.cls * 4, gridSpan: 4 }),
    tc(cellP("Қауіпті экстремалды / Опасный экстремальный", { bold: true, size: 12 }), { width: COL.cls }),
  );
  // Row 3: numeric class labels
  const row3 = tr(
    tc(cellP("", {}), { width: COL.code, vMerge: "continue" }),
    tc(cellP("", {}), { width: COL.profession, vMerge: "continue" }),
    tc(cellP("", {}), { width: COL.count, vMerge: "continue" }),
    tc(cellP("", {}), { width: COL.factorName, vMerge: "continue" }),
    tc(cellP("", {}), { width: COL.method, vMerge: "continue" }),
    tc(cellP("", {}), { width: COL.norm, vMerge: "continue" }),
    tc(cellP("", {}), { width: COL.actual, vMerge: "continue" }),
    tc(cellP("2", { bold: true, size: 16 }), { width: COL.cls }),
    tc(cellP("3.1", { bold: true, size: 16 }), { width: COL.cls }),
    tc(cellP("3.2", { bold: true, size: 16 }), { width: COL.cls }),
    tc(cellP("3.3", { bold: true, size: 16 }), { width: COL.cls }),
    tc(cellP("3.4", { bold: true, size: 16 }), { width: COL.cls }),
    tc(cellP("4", { bold: true, size: 16 }), { width: COL.cls }),
  );
  return row1 + row2 + row3;
}

function measurementsTable() {
  const tblPr = `<w:tblPr><w:tblW w:w="10000" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders><w:top w:val="single" w:sz="4" w:color="auto"/><w:left w:val="single" w:sz="4" w:color="auto"/><w:bottom w:val="single" w:sz="4" w:color="auto"/><w:right w:val="single" w:sz="4" w:color="auto"/><w:insideH w:val="single" w:sz="4" w:color="auto"/><w:insideV w:val="single" w:sz="4" w:color="auto"/></w:tblBorders></w:tblPr>`;
  const widths = [
    COL.code, COL.profession, COL.count, COL.factorName, COL.method,
    COL.norm, COL.actual,
    COL.cls, COL.cls, COL.cls, COL.cls, COL.cls, COL.cls,
  ];
  const grid = `<w:tblGrid>${widths.map((w) => `<w:gridCol w:w="${w}"/>`).join("")}</w:tblGrid>`;

  const header = measurementsHeader();

  // Section header row (1 cell spanning all 13 columns).
  // Rendered only when {showSection} is truthy via {-w:tr showSection}.
  const sectionRow =
    `<w:tr>` +
    `<w:tc><w:tcPr><w:tcW w:w="10000" w:type="dxa"/><w:gridSpan w:val="13"/>` +
    `<w:tcBorders><w:top w:val="single" w:sz="4" w:color="auto"/><w:left w:val="single" w:sz="4" w:color="auto"/><w:bottom w:val="single" w:sz="4" w:color="auto"/><w:right w:val="single" w:sz="4" w:color="auto"/></w:tcBorders>` +
    `<w:shd w:val="clear" w:color="auto" w:fill="F2F2F2"/>` +
    `</w:tcPr>` +
    cellP("{-w:tr showSection}{placeNumber}. {placeName}{/}", {
      bold: true, italic: true, size: 18, align: "left",
    }) +
    `</w:tc>` +
    `</w:tr>`;

  // Factor row (13 cells). code/profession/count are filled only on the
  // first factor of a workplace (the data layer supplies empty strings
  // for subsequent rows). Each of the 6 class cells gets its value when
  // populated, otherwise blank.
  const factorRow = tr(
    tc(cellP("{code}", { size: 14 }), { width: COL.code }),
    tc(cellP("{profession}", { size: 14, align: "left" }), { width: COL.profession }),
    tc(cellP("{count}", { size: 14 }), { width: COL.count }),
    tc(cellP("{factorName}", { size: 14, align: "left" }), { width: COL.factorName }),
    tc(cellP("{factorMethod}", { size: 14 }), { width: COL.method }),
    tc(cellP("{factorNorm}", { size: 14 }), { width: COL.norm }),
    tc(cellP("{factorActual}", { size: 14 }), { width: COL.actual }),
    tc(cellP("{class2}", { bold: true, size: 14 }), { width: COL.cls }),
    tc(cellP("{class31}", { bold: true, size: 14 }), { width: COL.cls }),
    tc(cellP("{class32}", { bold: true, size: 14 }), { width: COL.cls }),
    tc(cellP("{class33}", { bold: true, size: 14 }), { width: COL.cls }),
    tc(cellP("{class34}", { bold: true, size: 14 }), { width: COL.cls }),
    tc(cellP("{class4}", { bold: true, size: 14 }), { width: COL.cls }),
  );

  // Wrap the section + factor rows in a single {#rows}…{/rows} loop.
  // Section row is conditional (only on first factor of a place).
  // Factor row renders every iteration.
  //
  // The loop-open/close go inside the first/last cell of the section/
  // factor rows respectively via control runs.
  const loopOpen =
    `<w:p><w:pPr><w:spacing w:after="0"/></w:pPr><w:r><w:rPr><w:sz w:val="2"/></w:rPr><w:t xml:space="preserve">{#rows}</w:t></w:r></w:p>`;
  const loopClose =
    `<w:p><w:pPr><w:spacing w:after="0"/></w:pPr><w:r><w:rPr><w:sz w:val="2"/></w:rPr><w:t xml:space="preserve">{/rows}</w:t></w:r></w:p>`;

  // Wrap section row's single cell to inject the loop-open before the
  // section paragraph, and append loop-close after the factor row's last
  // cell.
  const sectionRowWithOpen =
    `<w:tr>` +
    `<w:tc><w:tcPr><w:tcW w:w="10000" w:type="dxa"/><w:gridSpan w:val="13"/>` +
    `<w:tcBorders><w:top w:val="single" w:sz="4" w:color="auto"/><w:left w:val="single" w:sz="4" w:color="auto"/><w:bottom w:val="single" w:sz="4" w:color="auto"/><w:right w:val="single" w:sz="4" w:color="auto"/></w:tcBorders>` +
    `<w:shd w:val="clear" w:color="auto" w:fill="F2F2F2"/>` +
    `</w:tcPr>` +
    loopOpen +
    cellP("{-w:tr showSection}{placeNumber}. {placeName}{/}", {
      bold: true, italic: true, size: 18, align: "left",
    }) +
    `</w:tc>` +
    `</w:tr>`;

  const factorRowWithClose = tr(
    tc(cellP("{code}", { size: 14 }), { width: COL.code }),
    tc(cellP("{profession}", { size: 14, align: "left" }), { width: COL.profession }),
    tc(cellP("{count}", { size: 14 }), { width: COL.count }),
    tc(cellP("{factorName}", { size: 14, align: "left" }), { width: COL.factorName }),
    tc(cellP("{factorMethod}", { size: 14 }), { width: COL.method }),
    tc(cellP("{factorNorm}", { size: 14 }), { width: COL.norm }),
    tc(cellP("{factorActual}", { size: 14 }), { width: COL.actual }),
    tc(cellP("{class2}", { bold: true, size: 14 }), { width: COL.cls }),
    tc(cellP("{class31}", { bold: true, size: 14 }), { width: COL.cls }),
    tc(cellP("{class32}", { bold: true, size: 14 }), { width: COL.cls }),
    tc(cellP("{class33}", { bold: true, size: 14 }), { width: COL.cls }),
    tc(cellP("{class34}", { bold: true, size: 14 }), { width: COL.cls }),
    // Append loop close inside the last cell.
    `<w:tc><w:tcPr><w:tcW w:w="${COL.cls}" w:type="dxa"/><w:tcBorders><w:top w:val="single" w:sz="4" w:color="auto"/><w:left w:val="single" w:sz="4" w:color="auto"/><w:bottom w:val="single" w:sz="4" w:color="auto"/><w:right w:val="single" w:sz="4" w:color="auto"/></w:tcBorders><w:vAlign w:val="center"/></w:tcPr>` +
      cellP("{class4}", { bold: true, size: 14 }) +
      loopClose +
    `</w:tc>`,
  );
  // Note: factorRow is now unused — keep reference suppressed.
  void factorRow;
  void sectionRow;

  return `<w:tbl>${tblPr}${grid}${header}${sectionRowWithOpen}${factorRowWithClose}</w:tbl>`;
}

// -------- Signatures block --------

function signaturesBlock() {
  return [
    p("Өлшеуді жүргізген / Оценку проводил:", {
      bold: true,
      italic: true,
      size: 22,
      before: 200,
    }),
    p("{performer.position}    {performer.fullName}", { size: 22 }),
    p("Ұйымның өкілі / Представитель организации:", {
      bold: true,
      italic: true,
      size: 22,
    }),
    p("{director.position}    {director.fullName}", { size: 22 }),
  ].join("");
}

// -------- Compose document.xml --------

function buildDocumentXml() {
  const sectPr = `<w:sectPr><w:pgSz w:w="11906" w:h="16838" w:orient="landscape"/><w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720" w:header="708" w:footer="708" w:gutter="0"/><w:cols w:space="708"/><w:docGrid w:linePitch="360"/></w:sectPr>`;

  const body =
    `<w:body>` +
    labHeader() +
    protocolTitle() +
    customerBlock() +
    measuringToolsTable() +
    afterToolsBlock() +
    measurementsTable() +
    signaturesBlock() +
    sectPr +
    `</w:body>`;

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
