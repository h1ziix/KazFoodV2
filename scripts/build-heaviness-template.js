/**
 * Сборка DOCX-шаблона для протокола "Тяжесть трудового процесса".
 *
 * Берёт за основу public/templates/lighting-protocol.docx (для styles/theme/
 * settings/numbering и т.п.), заменяет только word/document.xml на собственный
 * с docxtemplater-плейсхолдерами, и сохраняет результат как
 * public/templates/heaviness-protocol.docx.
 *
 * Запуск: node scripts/build-heaviness-template.js
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
  "heaviness-protocol.docx",
);

// -------- XML helpers --------

function xmlEscape(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// w:p with optional rPr / pPr
function p(text, opts = {}) {
  const { bold = false, italic = false, size = 22, align = "left", before = 0, after = 0 } = opts;
  const rPr = `<w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/>${
    bold ? "<w:b/>" : ""
  }${italic ? "<w:i/>" : ""}<w:sz w:val="${size}"/><w:szCs w:val="${size}"/><w:lang w:val="ru-RU"/></w:rPr>`;
  const pPr = `<w:pPr><w:spacing w:before="${before}" w:after="${after}" w:line="240" w:lineRule="auto"/><w:jc w:val="${align}"/></w:pPr>`;
  return `<w:p>${pPr}<w:r>${rPr}<w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r></w:p>`;
}

// Empty paragraph for cycle markers like {#workplaces}
function ctrl(tag) {
  // place in a paragraph so docxtemplater sees full {#tag}
  return `<w:p><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="2"/></w:rPr><w:t xml:space="preserve">${xmlEscape(tag)}</w:t></w:r></w:p>`;
}

// Table cell
function tc(content, opts = {}) {
  const { width = 1000, gridSpan = 1, vMerge, shd } = opts;
  const tcW = `<w:tcW w:w="${width}" w:type="dxa"/>`;
  const span = gridSpan > 1 ? `<w:gridSpan w:val="${gridSpan}"/>` : "";
  const merge = vMerge
    ? `<w:vMerge${vMerge === "restart" ? ' w:val="restart"' : ""}/>`
    : "";
  const shading = shd ? `<w:shd w:val="clear" w:color="auto" w:fill="${shd}"/>` : "";
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

// Table row
function tr(...cells) {
  return `<w:tr>${cells.join("")}</w:tr>`;
}

// -------- Header lab block --------

function labHeader() {
  return [
    p("«Центр экспертной оценки условий труда» ЖШС", { bold: true, align: "center", size: 22 }),
    p("Cынақ зертханасы", { bold: true, align: "center", size: 22 }),
    p("Алматы қ., Турксиб ауданы, Остроумов көш., 50А үй", { align: "center", size: 20 }),
    p("Телефон/факс: +7 777 231 70 74, +7 700 992 05 59", { align: "center", size: 20 }),
    p("Е-mail: info@hse-profi.kz", { bold: true, align: "center", size: 20 }),
    p("KZ.T.02.E1210 Аккредиттеу аттестаты", { bold: true, align: "center", size: 20 }),
    p("2022 ж. 25 шілде 2022 ж.", { bold: true, align: "center", size: 20 }),
    p("25 шілде 2027 дейін", { bold: true, align: "center", size: 20 }),
  ].join("");
}

function protocolTitle() {
  return [
    p("ПРОТОКОЛ № {protocol.number}", { bold: true, align: "center", size: 26, before: 200 }),
    p("еңбек өрдісінің ауырлық көрсеткіштері бойынша еңбек жағдайын бағалау", {
      bold: true,
      italic: true,
      align: "center",
      size: 22,
    }),
    p("оценки условий труда по показателям тяжести трудового процесса", {
      bold: true,
      align: "center",
      size: 22,
    }),
  ].join("");
}

function customerBlock() {
  return [
    p("Тапсырыс берушінің атауы және мекен-жайы (наименование и адрес заказчика): {customer.name}, {customer.address}", { bold: true, size: 22 }),
    p("Өлшеу жүргізу орны (место проведения оценки): {measurementPlace}", { bold: true, size: 22 }),
    p("Тегі, аты, әкесінің аты (лауазымы) (Фамилия, имя, отчество (должность): {position}", { bold: true, size: 22 }),
    p("Өлшем жүргізу күні (дата проведения оценки): «{measurementDate.day}» {measurementDate.month} {measurementDate.year} г.", { bold: true, size: 22 }),
    p("Қысқаша жұмыс істеу нұсқалары (краткое описание выполняемой работы): {workDescription}", { size: 22 }),
    p("Жұмыс жағдайларын жұмыс барысының ауырлығының көрсеткіштері бойынша бағалау нәтижелері (результаты оценки условий труда по показателям тяжести трудового процесса):", { bold: true, size: 22 }),
  ].join("");
}

// -------- The big indicators table --------

// Column widths (twips). Total ~10000.
const W = {
  code: 900,        // код рабочего места
  position: 1500,   // профессия
  indicator: 4200,  // показатель
  value: 1400,      // факт. значение
  cls: 500,         // каждая из 4 колонок класса (4*500=2000)
};

function tableHeader() {
  // Header row 1 — заголовки колонок (со слитыми ячейками классов)
  const row1 = tr(
    tc(cellP("Жұмыс орнының коды (код рабочего места)", { bold: true, size: 16 }), { width: W.code, vMerge: "restart" }),
    tc(cellP("Кәсіптер мен лауазымдардың атауы (наименование профессий, должностей)", { bold: true, size: 16 }), { width: W.position, vMerge: "restart" }),
    tc(cellP("Жұмыс барысының ауырлығының көрсеткіштері (Показатели тяжести трудового процесса)", { bold: true, size: 16 }), { width: W.indicator, vMerge: "restart" }),
    tc(cellP("Нақты белгілер / Фактические значения", { bold: true, size: 16 }), { width: W.value, vMerge: "restart" }),
    tc(cellP("Жұмыс жағдайларының классы (классы условий труда)", { bold: true, size: 16 }), { width: W.cls * 4, gridSpan: 4 }),
  );
  const row2 = tr(
    tc(cellP("", {}), { width: W.code, vMerge: "continue" }),
    tc(cellP("", {}), { width: W.position, vMerge: "continue" }),
    tc(cellP("", {}), { width: W.indicator, vMerge: "continue" }),
    tc(cellP("", {}), { width: W.value, vMerge: "continue" }),
    tc(cellP("1 қолайлы / оптимальный", { bold: true, size: 14 }), { width: W.cls }),
    tc(cellP("2 рұқсат етілген / допустимый", { bold: true, size: 14 }), { width: W.cls }),
    tc(cellP("3.1 зиянды / вредный", { bold: true, size: 14 }), { width: W.cls }),
    tc(cellP("3.2 зиянды / вредный", { bold: true, size: 14 }), { width: W.cls }),
  );
  return row1 + row2;
}

// Section title row: not used in current layout, kept for future reuse.
// eslint-disable-next-line no-unused-vars
function sectionRow() {}

function valueRow(label, prefix) {
  return tr(
    tc(cellP("", {}), { width: W.code, vMerge: "continue" }),
    tc(cellP("", {}), { width: W.position, vMerge: "continue" }),
    tc(cellP(label, { italic: true, size: 16, align: "left" }), { width: W.indicator }),
    tc(cellP(`{${prefix}_value}`, { size: 16 }), { width: W.value }),
    tc(cellP(`{${prefix}_c1}`, { bold: true, size: 18 }), { width: W.cls }),
    tc(cellP(`{${prefix}_c2}`, { bold: true, size: 18 }), { width: W.cls }),
    tc(cellP(`{${prefix}_c31}`, { bold: true, size: 18 }), { width: W.cls }),
    tc(cellP(`{${prefix}_c32}`, { bold: true, size: 18 }), { width: W.cls }),
  );
}

// Like valueRow — оставлено для совместимости, сейчас неиспользуется.
// eslint-disable-next-line no-unused-vars
function valueRowFirst() {}

// Section header row. If `start` is true — opens vMerge in code/position cells
// with the workplace's {code} and {position}; otherwise continues the merge.
function groupTitleRow(title, start = false) {
  const codeCell = start
    ? tc(cellP("{code}", { bold: true, size: 18 }), { width: W.code, vMerge: "restart" })
    : tc(cellP("", {}), { width: W.code, vMerge: "continue" });
  const posCell = start
    ? tc(cellP("{position}", { bold: true, size: 18 }), { width: W.position, vMerge: "restart" })
    : tc(cellP("", {}), { width: W.position, vMerge: "continue" });
  return tr(
    codeCell,
    posCell,
    tc(cellP(title, { bold: true, italic: true, size: 16, align: "left" }), { width: W.indicator + W.value + W.cls * 4, gridSpan: 6, shd: "F2F2F2" }),
  );
}

function indicatorsTable() {
  const tblPr = `<w:tblPr><w:tblW w:w="10000" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders><w:top w:val="single" w:sz="4" w:color="auto"/><w:left w:val="single" w:sz="4" w:color="auto"/><w:bottom w:val="single" w:sz="4" w:color="auto"/><w:right w:val="single" w:sz="4" w:color="auto"/><w:insideH w:val="single" w:sz="4" w:color="auto"/><w:insideV w:val="single" w:sz="4" w:color="auto"/></w:tblBorders></w:tblPr>`;
  const grid = `<w:tblGrid>${[W.code, W.position, W.indicator, W.value, W.cls, W.cls, W.cls, W.cls].map(w => `<w:gridCol w:w="${w}"/>`).join("")}</w:tblGrid>`;

  const headerRows = tableHeader();

  const rows = [
    groupTitleRow("1. Физикалық динамикалық жүктеме (кг·м) / Физическая динамическая нагрузка (кг·м)", true),
    valueRow("Жүктің аймақтық – орнын ауыстыру 1м дейін (Региональная – перемещение груза до 1м)", "p1_1"),
    groupTitleRow("Жалпы жүктеме: жүктің орын ауыстыруы / Общая нагрузка: перемещение груза"),
    valueRow("от 1 до 5 м", "p1_2a"),
    valueRow("более 5 м", "p1_2b"),

    groupTitleRow("2. Қолмен көтеретін және орнын ауыстырып қоятын жүктің (кг) / Масса поднимаемого и перемещаемого вручную груза (кг)"),
    valueRow("2.1. При чередовании с другой работой", "p2_1"),
    valueRow("2.2. Постоянно в течение смены", "p2_2"),
    valueRow("2.3. Суммарная масса за час смены — с рабочей поверхности", "p2_3a"),
    valueRow("2.3. Суммарная масса за час смены — с пола", "p2_3b"),

    groupTitleRow("3. Стереотиптік жұмысшы қозғалыстары (саны) / Стереотипные рабочие движения (кол-во)"),
    valueRow("3.1. Локальная нагрузка", "p3_1"),
    valueRow("3.2. Региональная нагрузка", "p3_2"),

    groupTitleRow("4. Статикалық жүктеме (кгс·сек) / Статическая нагрузка (кгс·сек)"),
    valueRow("4.1. Одной рукой", "p4_1"),
    valueRow("4.2. Двумя руками", "p4_2"),
    valueRow("4.3. С участием корпуса и ног", "p4_3"),

    groupTitleRow("5. Жұмысшы кейіпінде / Рабочая поза"),
    valueRow("Рабочая поза", "p5"),

    groupTitleRow("6. Дененің еңкейуі (ауыспалы жұмыстағы саны) / Наклоны корпуса (количество за смену)"),
    valueRow("Наклоны корпуса", "p6"),

    groupTitleRow("7. Кеңістікте орын ауыстыруы (км) / Перемещение в пространстве (км)"),
    valueRow("7.1. По горизонтали", "p7_1"),
    valueRow("7.2. По вертикали", "p7_2"),
  ].join("");

  return `<w:tbl>${tblPr}${grid}${headerRows}${rows}</w:tbl>`;
}

function finalAssessmentBlock() {
  return [
    p("Еңбек ауырлығын бағалау (Окончательная оценка тяжести труда): {finalAssessment}", { bold: true, size: 22, before: 120 }),
  ].join("");
}

function signaturesBlock() {
  return [
    p("Өлшеуді жүргізген / Оценку проводил: {performer.position}    {performer.fullName}", { size: 22, before: 200 }),
    p("Ұйымның өкілі / Представитель организации: {representative.position}    {representative.fullName}", { size: 22 }),
  ].join("");
}

// Page break paragraph (used between cards)
function pageBreak() {
  return `<w:p><w:r><w:br w:type="page"/></w:r></w:p>`;
}

// -------- Compose document.xml --------

function buildDocumentXml() {
  const sectPr = `<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720" w:header="708" w:footer="708" w:gutter="0"/><w:cols w:space="708"/><w:docGrid w:linePitch="360"/></w:sectPr>`;

  const cardBody = [
    labHeader(),
    protocolTitle(),
    customerBlock(),
    indicatorsTable(),
    finalAssessmentBlock(),
    signaturesBlock(),
  ].join("");

  // Workplaces loop: open marker, card, close marker.
  // Page break between cards is rendered AFTER card body but inside the loop;
  // for the last card it leaves a trailing blank page — acceptable for this use case.
  const body = `<w:body>${ctrl("{#workplaces}")}${cardBody}${pageBreak()}${ctrl("{/workplaces}")}${sectPr}</w:body>`;

  const docOpen = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">`;
  return `${docOpen}${body}</w:document>`;
}

// -------- Build --------

function build() {
  const baseBuf = fs.readFileSync(BASE_TEMPLATE);
  const zip = new PizZip(baseBuf);

  // Remove image/footer references that lighting template carries but heaviness shouldn't need.
  // We keep them in the zip (innocuous), but our document.xml.rels will be replaced
  // with a stripped version that only references the parts we use.
  const newRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/><Relationship Id="rId6" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/webSettings" Target="webSettings.xml"/><Relationship Id="rId7" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footnotes" Target="footnotes.xml"/><Relationship Id="rId8" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/endnotes" Target="endnotes.xml"/><Relationship Id="rId12" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/fontTable" Target="fontTable.xml"/><Relationship Id="rId13" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/><Relationship Id="rId4" Type="http://schemas.microsoft.com/office/2007/relationships/stylesWithEffects" Target="stylesWithEffects.xml"/><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/customXml" Target="../customXml/item1.xml"/></Relationships>`;

  zip.file("word/document.xml", buildDocumentXml());
  zip.file("word/_rels/document.xml.rels", newRels);

  // drop unused parts to keep the file clean
  ["word/footer1.xml", "word/media/image1.png", "word/media/image2.png", "word/document.xml.new"].forEach(
    (p) => {
      if (zip.file(p)) zip.remove(p);
    },
  );

  // Fix Content_Types accordingly: remove footer override and png Default.
  const ct = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/customXml/itemProps1.xml" ContentType="application/vnd.openxmlformats-officedocument.customXmlProperties+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/stylesWithEffects.xml" ContentType="application/vnd.ms-word.stylesWithEffects+xml"/><Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/><Override PartName="/word/webSettings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.webSettings+xml"/><Override PartName="/word/footnotes.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml"/><Override PartName="/word/endnotes.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.endnotes+xml"/><Override PartName="/word/fontTable.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.fontTable+xml"/><Override PartName="/word/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`;
  zip.file("[Content_Types].xml", ct);

  const out = zip.generate({ type: "nodebuffer" });
  fs.writeFileSync(OUT_TEMPLATE, out);
  console.log(`Wrote ${OUT_TEMPLATE} (${out.length} bytes)`);
}

build();
