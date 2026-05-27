/**
 * Сборка DOCX-шаблона для протокола "Напряжённость трудового процесса".
 *
 * Берёт за основу public/templates/lighting-protocol.docx (для styles/theme/
 * settings/numbering и т.п.), заменяет только word/document.xml на собственный
 * с docxtemplater-плейсхолдерами, и сохраняет результат как
 * public/templates/tension-protocol.docx.
 *
 * Запуск: node scripts/build-tension-template.js
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
  "tension-protocol.docx",
);

// -------- XML helpers --------

function xmlEscape(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function p(text, opts = {}) {
  const { bold = false, italic = false, size = 22, align = "left", before = 0, after = 0 } = opts;
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
    p("еңбек өрдісінің қауырттылық көрсеткіштері бойынша еңбек жағдайын бағалау", {
      bold: true,
      italic: true,
      align: "center",
      size: 22,
    }),
    p("оценки условий труда по показателям напряженности трудового процесса", {
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
    p("Жұмыс жағдайларын жұмыс барысының қауырттылығы көрсеткіштері бойынша бағалау нәтижелері (результаты оценки условий труда по показателям напряженности трудового процесса):", { bold: true, size: 22 }),
  ].join("");
}

// -------- The big indicators table --------

const W = {
  code: 900,
  position: 1500,
  indicator: 4200,
  value: 1400,
  cls: 500,
};

function tableHeader() {
  const row1 = tr(
    tc(cellP("Жұмыс орнының коды (код рабочего места)", { bold: true, size: 16 }), { width: W.code, vMerge: "restart" }),
    tc(cellP("Кәсіптер мен лауазымдардың атауы (наименование профессий, должностей)", { bold: true, size: 16 }), { width: W.position, vMerge: "restart" }),
    tc(cellP("Жұмыс барысының қауырттылығының көрсеткіштері (Показатели напряженности трудового процесса)", { bold: true, size: 16 }), { width: W.indicator, vMerge: "restart" }),
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
    // 1. Интеллектуальные нагрузки
    groupTitleRow("1. Интелектуалды ауыртпалықтар / Интеллектуальные нагрузки", true),
    valueRow("1.1. Жұмыстың мазмұны / Содержание работы", "p1_1"),
    valueRow("1.2. Сигналдарды қабылдау және оларды бағалау / Восприятие сигналов и их оценка", "p1_2"),
    valueRow("1.3. Тапсырманың қиындық дәрежесіне қарай функцияларды бөлу / Распределение функций по степени сложности задания", "p1_3"),
    valueRow("1.4. Орындалған жұмыстың сипаты / Характер выполняемой работы", "p1_4"),

    // 2. Сенсорные нагрузки
    groupTitleRow("2. Сезімтал ауыртпалықтар / Сенсорные нагрузки"),
    valueRow("2.1. Шоғырланған бақылау ұзақтығы (% уақыт ауысым) / Длительность сосредоточенного наблюдения (% времени смены)", "p2_1"),
    valueRow("2.2. Сигналдар мен хабарламалардың тығыздығы (1 сағ үшін) / Плотность сигналов и сообщений в среднем за 1 час работы", "p2_2"),
    valueRow("2.3. Бір уақытта бақылау объектілерінің саны / Число производственных объектов одновременного наблюдения", "p2_3"),
    valueRow("2.4. Айырмашылық объектісінің өлшемі (мм), смена 50%-нан астам / Размер объекта различения (при длительности >50% смены), мм", "p2_4"),
    valueRow("2.5. Оптикалық аспаптармен жұмыс істеу (%) / Работа с оптическими приборами (%)", "p2_5"),
    valueRow("2.6. Бейне-терминал экрандарын бақылау (сағ) / Наблюдение за экранами видеотерминалов, ч", "p2_6"),
    valueRow("2.7. Естуге арналған анализатор жүктемесі / Нагрузка на слуховой анализатор", "p2_7"),
    valueRow("2.8. Дауыс аппаратына жүктеме (сағ/апта) / Нагрузка на голосовой аппарат (ч в неделю)", "p2_8"),

    // 3. Эмоциональные нагрузки
    groupTitleRow("3. Эмоциялық ауыртпалық / Эмоциональные нагрузки"),
    valueRow("3.1. Өз қызметінің нәтижесі үшін жауапкершілік дәрежесі / Степень ответственности за результат собственной деятельности", "p3_1"),
    valueRow("3.2. Өз өміріне қауіп-қатер дәрежесі / Степень риска для собственной жизни", "p3_2"),
    valueRow("3.3. Басқа адамдардың қауіпсіздігі үшін жауапкершілік / Ответственность за безопасность других лиц", "p3_3"),

    // 4. Монотонность нагрузок
    groupTitleRow("4. Жүктемелер монотондылығы / Монотонность нагрузок"),
    valueRow("4.1. Қарапайым тапсырманы орындау үшін қажетті элементтер саны / Число элементов, необходимых для реализации простого задания", "p4_1"),
    valueRow("4.2. Қарапайым тапсырмаларды орындау ұзақтығы (с) / Продолжительность выполнения простых заданий, с", "p4_2"),
    valueRow("4.3. Белсенді әрекет уақыты (% уақыт ауысымнан) / Время активных действий (% к продолжительности смены)", "p4_3"),
    valueRow("4.4. Өндірістік ортаның монотондылығы (% уақыт ауысым) / Монотонность производственной обстановки (% времени смены)", "p4_4"),

    // 5. Режим работы
    groupTitleRow("5. Жұмыс режимі / Режим работы"),
    valueRow("5.1. Жұмыс күнінің нақты ұзақтығы / Фактическая продолжительность рабочего дня", "p5_1"),
    valueRow("5.2. Жұмыс ауысымдылығы / Сменность работы", "p5_2"),
    valueRow("5.3. Регламенттелген үзілістердің болуы / Наличие регламентированных перерывов", "p5_3"),
  ].join("");

  return `<w:tbl>${tblPr}${grid}${headerRows}${rows}</w:tbl>`;
}

function finalAssessmentBlock() {
  return [
    p("Еңбек қауырттылығын бағалау (Окончательная оценка напряженности труда): {finalAssessment}", { bold: true, size: 22, before: 120 }),
  ].join("");
}

function signaturesBlock() {
  return [
    p("Өлшеуді жүргізген / Оценку проводил: {performer.position}    {performer.fullName}", { size: 22, before: 200 }),
    p("Ұйымның өкілі / Представитель организации: {representative.position}    {representative.fullName}", { size: 22 }),
  ].join("");
}

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

  const body = `<w:body>${ctrl("{#workplaces}")}${cardBody}${pageBreak()}${ctrl("{/workplaces}")}${sectPr}</w:body>`;

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

  ["word/footer1.xml", "word/media/image1.png", "word/media/image2.png", "word/document.xml.new"].forEach(
    (p) => {
      if (zip.file(p)) zip.remove(p);
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
