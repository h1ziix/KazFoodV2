/**
 * Сборка DOCX-шаблона для документа №14 «Заключение / Отчёт».
 *
 * Берёт за основу public/templates/lighting-protocol.docx (для styles/
 * theme/settings/numbering), заменяет word/document.xml на собственный
 * с docxtemplater-плейсхолдерами и сохраняет результат как
 * public/templates/conclusion-protocol.docx.
 *
 * Структура шаблона:
 *   1. Шапка лаборатории.
 *   2. Название отчёта (kk + ru).
 *   3. Блок реквизитов (заказчик, место, код, количество, дата).
 *   4. Большая таблица «Результаты оценки условий труда»:
 *        2 колонки заголовков фактора (kk / ru) + 6 классовых колонок.
 *        Тело таблицы — цикл {#rows} ... {/rows}.
 *   5. Подписи (исполнитель / согласовано / представитель).
 *
 * Запуск: node scripts/build-conclusion-template.js
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
  "conclusion-protocol.docx",
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

function ctrl(tag) {
  return `<w:p><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="2"/></w:rPr><w:t xml:space="preserve">${xmlEscape(tag)}</w:t></w:r></w:p>`;
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

// -------- Lab header --------

function labHeader() {
  return [
    p("Приложение № 6 к Приказу МЗ РК 1057 от 28.12.2015 г.", {
      italic: true,
      align: "right",
      size: 18,
    }),
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

function title() {
  return [
    p(
      "Өндірістік объектілерді еңбек жағдайлары бойынша міндетті мерзімдік аттестаттау нәтижелері туралы есеп",
      { bold: true, align: "center", size: 24, before: 200 },
    ),
    p(
      "Отчёт по результатам обязательной периодической аттестации производственных объектов по условиям труда",
      { bold: true, align: "center", size: 24, after: 200 },
    ),
  ].join("");
}

function meta() {
  return [
    p(
      "Тапсырыс берушінің атауы және мекен-жайы (наименование и адрес заказчика): {customer.name}, {customer.address}.",
      { size: 22 },
    ),
    p(
      "Өлшеу жүргізу орны (место проведения оценки): {measurementPlace}",
      { size: 22 },
    ),
    p(
      "Жұмыс орнының коды (код рабочего места): {workplaceCodeNote}",
      { size: 22 },
    ),
    p(
      "Жұмыс орнының саны (количество рабочих мест): {totalWorkplaces}",
      { size: 22 },
    ),
    p(
      "Өлшем жүргізу күні (дата проведения оценки): «{measurementDate.day}» {measurementDate.month} {measurementDate.year} г.",
      { size: 22 },
    ),
    p(
      "Еңбек жағдайларын бағалау нәтижелері (результаты оценки условий труда):",
      { bold: true, size: 22, before: 120 },
    ),
  ].join("");
}

// -------- Results table --------

const W = {
  labelKk: 2200,
  labelRu: 2200,
  cls: 900, // 6 columns × 900 = 5400; total = 9800
};

function tableHeader() {
  const row1 = tr(
    tc(cellP("Факторлар", { bold: true, size: 16 }), {
      width: W.labelKk,
      vMerge: "restart",
    }),
    tc(cellP("Фактор", { bold: true, size: 16 }), {
      width: W.labelRu,
      vMerge: "restart",
    }),
    tc(cellP("Еңбек жағдайларынын классы / Класс условий труда", {
      bold: true,
      size: 16,
    }),
    { width: W.cls * 6, gridSpan: 6 }),
  );
  const row2 = tr(
    tc(cellP("", {}), { width: W.labelKk, vMerge: "continue" }),
    tc(cellP("", {}), { width: W.labelRu, vMerge: "continue" }),
    tc(cellP("Рұқсат етілген / Допустимый", { bold: true, size: 14 }), {
      width: W.cls * 1,
      gridSpan: 1,
      shd: "EAEAEA",
    }),
    tc(
      cellP("Зиянды, ауыр, қауырт / Вредный, тяжёлый и напряжённый", {
        bold: true,
        size: 14,
      }),
      { width: W.cls * 4, gridSpan: 4, shd: "EAEAEA" },
    ),
    tc(cellP("Қауіпті (экстремалдық) / Опасный (экстремальный)", {
      bold: true,
      size: 14,
    }),
    { width: W.cls, gridSpan: 1, shd: "EAEAEA" }),
  );
  const row3 = tr(
    tc(cellP("", {}), { width: W.labelKk, vMerge: "continue" }),
    tc(cellP("", {}), { width: W.labelRu, vMerge: "continue" }),
    tc(cellP("2", { bold: true, size: 16 }), { width: W.cls }),
    tc(cellP("3.1", { bold: true, size: 16 }), { width: W.cls }),
    tc(cellP("3.2", { bold: true, size: 16 }), { width: W.cls }),
    tc(cellP("3.3", { bold: true, size: 16 }), { width: W.cls }),
    tc(cellP("3.4", { bold: true, size: 16 }), { width: W.cls }),
    tc(cellP("4", { bold: true, size: 16 }), { width: W.cls }),
  );
  return row1 + row2 + row3;
}

function rowTemplate() {
  return tr(
    tc(cellP("{labelKk}", { size: 16, align: "left" }), { width: W.labelKk }),
    tc(cellP("{labelRu}", { size: 16, align: "left" }), { width: W.labelRu }),
    tc(cellP("{c2}", { bold: true, size: 16 }), { width: W.cls }),
    tc(cellP("{c31}", { bold: true, size: 16 }), { width: W.cls }),
    tc(cellP("{c32}", { bold: true, size: 16 }), { width: W.cls }),
    tc(cellP("{c33}", { bold: true, size: 16 }), { width: W.cls }),
    tc(cellP("{c34}", { bold: true, size: 16 }), { width: W.cls }),
    tc(cellP("{c4}", { bold: true, size: 16 }), { width: W.cls }),
  );
}

function resultsTable() {
  const tblPr = `<w:tblPr><w:tblW w:w="9800" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders><w:top w:val="single" w:sz="4" w:color="auto"/><w:left w:val="single" w:sz="4" w:color="auto"/><w:bottom w:val="single" w:sz="4" w:color="auto"/><w:right w:val="single" w:sz="4" w:color="auto"/><w:insideH w:val="single" w:sz="4" w:color="auto"/><w:insideV w:val="single" w:sz="4" w:color="auto"/></w:tblBorders></w:tblPr>`;
  const grid = `<w:tblGrid>${[
    W.labelKk,
    W.labelRu,
    W.cls,
    W.cls,
    W.cls,
    W.cls,
    W.cls,
    W.cls,
  ]
    .map((w) => `<w:gridCol w:w="${w}"/>`)
    .join("")}</w:tblGrid>`;

  // Cycle wrapped INSIDE the table body — docxtemplater treats the
  // ctrl-row pair as the loop boundary for repeating <w:tr>.
  const cycleOpen = `<w:tr><w:tc><w:tcPr><w:tcW w:w="0" w:type="dxa"/><w:gridSpan w:val="8"/></w:tcPr>${ctrl("{#rows}")}</w:tc></w:tr>`;
  const cycleClose = `<w:tr><w:tc><w:tcPr><w:tcW w:w="0" w:type="dxa"/><w:gridSpan w:val="8"/></w:tcPr>${ctrl("{/rows}")}</w:tc></w:tr>`;

  return `<w:tbl>${tblPr}${grid}${tableHeader()}${cycleOpen}${rowTemplate()}${cycleClose}</w:tbl>`;
}

function signatures() {
  return [
    p("Өлшеуді жүргізген / Оценку проводил:", {
      bold: true,
      size: 22,
      before: 240,
    }),
    p("{performer.position}    {performer.fullName}", { size: 22 }),
    p("Келісілді / Согласовано:", { bold: true, size: 22, before: 200 }),
    p(
      "«Центр экспертной оценки условий труда» ЖШС    {laboratoryHead.position}    {laboratoryHead.fullName}",
      { size: 22 },
    ),
    p("Ұйымның өкілі / Представитель организации:", {
      bold: true,
      size: 22,
      before: 200,
    }),
    p("{representative.position}    {representative.fullName}", { size: 22 }),
  ].join("");
}

// -------- Compose --------

function buildDocumentXml() {
  const sectPr = `<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720" w:header="708" w:footer="708" w:gutter="0"/><w:cols w:space="708"/><w:docGrid w:linePitch="360"/></w:sectPr>`;
  const body = `<w:body>${labHeader()}${title()}${meta()}${resultsTable()}${signatures()}${sectPr}</w:body>`;
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
    (pth) => {
      if (zip.file(pth)) zip.remove(pth);
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
