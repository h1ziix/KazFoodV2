/**
 * Тест генерации DOCX-протокола №12 "Оценка травмобезопасности".
 * Запуск: node scripts/test-safety.js
 *
 * Шаги:
 *   1) (пере-)собирает шаблон public/templates/safety-protocol.docx;
 *   2) загружает шаблон и рендерит его через docxtemplater
 *      с safetyExample (32 рабочих места, 2 раздела);
 *   3) сохраняет результат в test-safety-output.docx;
 *   4) автопроверка: не должно быть "undefined" и не должно быть
 *      незаменённых шаблонных тегов { ... }.
 */

const fs = require("fs");
const path = require("path");
const PizZip = require("pizzip");
const Docxtemplater = require("docxtemplater");

const ROOT = path.resolve(__dirname, "..");
const TEMPLATE = path.join(ROOT, "public", "templates", "safety-protocol.docx");
const OUT = path.join(ROOT, "test-safety-output.docx");

// --- (1) пересобрать шаблон, чтобы тест всегда работал на свежей версии ---
require("./build-safety-template.js");

// --- inline example, синхронен с src/lib/safetyExampleData.ts ---

function row(code, position) {
  return {
    code,
    position,
    count: 1,
    equipment: "Оборудование согласно перечня",
    documentation: "в наличии",
    result: "соответствует",
    nonComplianceReasons: "отсутствуют",
    finalNote: "соответствует стандартам",
  };
}

const example = {
  protocol: { number: "1" },
  customer: {
    name: "ТОО «KazEcoFood»",
    address:
      "Алманиская обл, Карасайский район, село Кокозек, улица Несибели, 715",
  },
  measurementPlace:
    "1. Административно – управленческий персонал, 2. Производственный персонал",
  measurementDate: { day: "10", month: "апреля", year: "2026" },
  sections: [
    {
      number: 1,
      title: "1. Административно – управленческий персонал",
      rows: [
        row("01 001 001", "Директор"),
        row("01 001 002", "Управляющий производством"),
        row("01 001 003", "Бухгалтер"),
        row("01 001 004", "Коммерческий директор"),
        row("01 001 005", "Технический директор"),
        row("01 001 006", "Менеджер по продажам"),
        row("01 001 007", "Менеджер по продажам"),
        row("01 001 008", "Менеджер по снабжению"),
        row("01 001 009", "Главный механик"),
        row("01 001 010", "Главный энергетик"),
        row("01 001 011", "Специалист по кадровым вопросам"),
        row("01 001 012", "Начальник службы безопасности"),
        row("01 001 013", "Специалист по безопасности и охране труда"),
        row("01 001 014", "Технолог оператор"),
      ],
    },
    {
      number: 2,
      title: "2. Производственный персонал",
      rows: [
        row("01 002 015", "Технолог оператор"),
        row("01 002 016", "Бригадир ремонтно-строительной бригады"),
        row("01 002 017", "Бригадир технической бригады"),
        row("01 002 018", "Бригадир цеха выращивания и хранения"),
        row("01 002 019", "Электро слесарь"),
        row("01 002 020", "Водитель экспедитор"),
        row("01 002 021", "Лаборант"),
        row("01 002 022", "Поливщик"),
        row("01 002 023", "Сборщик"),
        row("01 002 024", "Фасовщик"),
        row("01 002 025", "Грузчик"),
        row("01 002 026", "Тракторист"),
        row("01 002 027", "Разнорабочий"),
        row("01 002 028", "Слесарь"),
        row("01 002 029", "Сторож"),
        row("01 002 030", "Шеф повар"),
        row("01 002 031", "Посудомойщица"),
        row("01 002 032", "Прачка"),
      ],
    },
  ],
  performer: {
    fullName: "Исаева А.В.",
    position: "Специалист лаборатории",
  },
  representative: {
    fullName: "Богачев А.И.",
    position: "Начальник по БиОТ",
  },
};

// --- утилиты, дублирующие src/lib/generateSafetyDocx.ts ---

function flatten(value, prefix = "", out = {}) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    if (prefix) out[prefix] = value;
    return out;
  }
  for (const [k, v] of Object.entries(value)) {
    const nextKey = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      flatten(v, nextKey, out);
    } else {
      out[nextKey] = v;
    }
  }
  return out;
}

function mapRow(r) {
  return {
    code: r.code,
    position: r.position,
    count: r.count,
    equipment: r.equipment,
    documentation: r.documentation,
    result: r.result,
    nonComplianceReasons: r.nonComplianceReasons,
    finalNote: r.finalNote,
  };
}

function mapSection(section, rootFlat) {
  return {
    ...rootFlat,
    section_number: section.number,
    section_title: section.title,
    rows: section.rows.map((r) => ({
      ...rootFlat,
      section_number: section.number,
      section_title: section.title,
      ...mapRow(r),
    })),
  };
}

function buildContext(data) {
  const rootFlat = flatten({
    protocol: data.protocol,
    customer: data.customer,
    measurementDate: data.measurementDate,
    performer: data.performer,
    representative: data.representative,
  });
  rootFlat["measurementPlace"] = data.measurementPlace;
  return {
    ...rootFlat,
    sections: data.sections.map((s) => mapSection(s, rootFlat)),
  };
}

function run() {
  const buf = fs.readFileSync(TEMPLATE);
  const zip = new PizZip(buf);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
  });

  try {
    doc.render(buildContext(example));
  } catch (err) {
    console.error("RENDER ERROR:", err.message);
    if (err.properties && err.properties.errors) {
      err.properties.errors.forEach((e, i) =>
        console.error(
          `  [${i}]`,
          e.message,
          e.properties && e.properties.explanation,
        ),
      );
    }
    process.exit(1);
  }

  const out = doc.getZip().generate({ type: "nodebuffer" });
  fs.writeFileSync(OUT, out);
  console.log(`OK: wrote ${OUT} (${out.length} bytes)`);

  // --- Автопроверка финального DOCX ---
  const verifyZip = new PizZip(out);
  const xmlText = verifyZip
    .file("word/document.xml")
    .asText()
    .replace(/<[^>]+>/g, "");

  // 1) не должно быть "undefined"
  const undefMatches = [...xmlText.matchAll(/.{0,40}undefined.{0,40}/g)].map(
    (m) => m[0],
  );
  if (undefMatches.length > 0) {
    console.error(
      `FAIL: найдено ${undefMatches.length} вхождений 'undefined' в DOCX:`,
    );
    undefMatches.slice(0, 10).forEach((s, i) => console.error(`  [${i}]`, s));
    process.exit(2);
  }
  console.log("VERIFY: 'undefined' в финальном DOCX не найдено ✅");

  // 2) не должно быть незаменённых тегов вида {ключ} / {ключ.путь}
  const tagMatches = [
    ...xmlText.matchAll(/\{[a-zA-Z_][a-zA-Z0-9_.#/]*\}/g),
  ].map((m) => m[0]);
  if (tagMatches.length > 0) {
    console.error(
      `FAIL: в финальном DOCX остались незаменённые шаблонные теги (${tagMatches.length}):`,
    );
    tagMatches.slice(0, 20).forEach((s, i) => console.error(`  [${i}]`, s));
    process.exit(3);
  }
  console.log("VERIFY: незаменённых шаблонных тегов { ... } не найдено ✅");

  // 3) контроль: подсчёт количества вхождений ключевых данных
  const totalRows = example.sections.reduce((a, s) => a + s.rows.length, 0);
  const directorOccurrences = (xmlText.match(/Директор/g) || []).length;
  console.log(
    `STATS: разделов=${example.sections.length}, строк всего=${totalRows}, вхождений «Директор» в DOCX=${directorOccurrences}`,
  );
}

run();
