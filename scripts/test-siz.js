/**
 * Тест генерации DOCX-протокола №13 «Оценка обеспеченности СИЗ».
 * Запуск: node scripts/test-siz.js
 *
 * Шаги:
 *   1) пересборка шаблона public/templates/siz-protocol.docx;
 *   2) рендер шаблона на sizExample (13 + 18 = 31 рабочее место);
 *   3) сохранение в test-siz-output.docx;
 *   4) автопроверка: не должно быть "undefined" и не должно быть
 *      незаменённых шаблонных тегов { ... }.
 */

const fs = require("fs");
const path = require("path");
const PizZip = require("pizzip");
const Docxtemplater = require("docxtemplater");

const ROOT = path.resolve(__dirname, "..");
const TEMPLATE = path.join(ROOT, "public", "templates", "siz-protocol.docx");
const OUT = path.join(ROOT, "test-siz-output.docx");

// --- (1) пересобрать шаблон ---
require("./build-siz-template.js");

// --- inline example (синхронен с src/lib/sizExampleData.ts) ---

const ADMIN_NORM_TEXT =
  '- не предусмотрено, согласно «Нормам выдачи специальной одежды и других средств индивидуальной защиты работникам организаций различных видов экономической деятельности», утвержденных Приказом Министра здравоохранения и социального развития РК от 8 декабря 2015 года № 943';
const PROD_NORM_TEXT = "Жилет, Рубашка, Головной убор, ботинки";

function adminRow(code, position) {
  return {
    code,
    position,
    count: 1,
    normItems: ADMIN_NORM_TEXT,
    issuedFact: "-",
    certificate: "-",
    assessment: "-",
    note: "-",
  };
}
function prodRow(code, position) {
  return {
    code,
    position,
    count: 1,
    normItems: PROD_NORM_TEXT,
    issuedFact: "Да",
    certificate: "В наличии",
    assessment: "Обеспечен",
    note: "-",
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
    "ТОО «KazEcoFood», Алманиская обл, Карасайский район, село Кокозек, улица Несибели, 715",
  measurementDate: { day: "10", month: "апреля", year: "2026" },
  sections: [
    {
      number: 1,
      title: "1. Администрация – 3 рабочих мест",
      rows: [
        adminRow("01 001 001", "Директор"),
        adminRow("01 001 002", "Управляющий производством"),
        adminRow("01 001 003", "Бухгалтер"),
        adminRow("01 001 004", "Коммерческий директор"),
        adminRow("01 001 005", "Технический директор"),
        adminRow("01 001 006", "Менеджер по продажам"),
        adminRow("01 001 007", "Менеджер по снабжению"),
        adminRow("01 001 008", "Главный механик"),
        adminRow("01 001 009", "Главный энергетик"),
        adminRow("01 001 010", "Специалист по кадровым вопросам"),
        adminRow("01 001 011", "Начальник службы безопасности"),
        adminRow("01 001 012", "Специалист по безопасности и охране труда"),
        adminRow("01 001 013", "Технолог оператор"),
      ],
    },
    {
      number: 2,
      title: "2. Производственный персонал",
      rows: [
        prodRow("01 002 014", "Технолог оператор"),
        prodRow("01 002 015", "Бригадир ремонтно-строительной бригады"),
        prodRow("01 002 016", "Бригадир технической бригады"),
        prodRow("01 002 017", "Бригадир цеха выращивания и хранения"),
        prodRow("01 002 018", "Электро слесарь"),
        prodRow("01 002 019", "Водитель экспедитор"),
        prodRow("01 002 020", "Лаборант"),
        prodRow("01 002 021", "Поливщик"),
        prodRow("01 002 022", "Сборщик"),
        prodRow("01 002 023", "Фасовщик"),
        prodRow("01 002 024", "Грузчик"),
        prodRow("01 002 025", "Тракторист"),
        prodRow("01 002 026", "Разнорабочий"),
        prodRow("01 002 027", "Слесарь"),
        prodRow("01 002 028", "Сторож"),
        prodRow("01 002 029", "Шеф повар"),
        prodRow("01 002 030", "Посудомойщица"),
        prodRow("01 002 031", "Прачка"),
      ],
    },
  ],
  performer: {
    fullName: "Исаева А.В.",
    position: "Старший специалист лаборатории",
  },
  representative: {
    fullName: "Богачев А.И.",
    position: "Начальник по БиОТ",
  },
};

// --- утилиты, дублирующие src/lib/generateSizDocx.ts ---

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
    normItems: r.normItems,
    issuedFact: r.issuedFact,
    certificate: r.certificate,
    assessment: r.assessment,
    note: r.note,
  };
}

function mapSection(s, rootFlat) {
  return {
    ...rootFlat,
    section_number: s.number,
    section_title: s.title,
    rows: s.rows.map((r) => ({
      ...rootFlat,
      section_number: s.number,
      section_title: s.title,
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

  // 2) не должно быть незаменённых шаблонных тегов {ключ}/{ключ.путь}
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

  // 3) Контроль количества
  const totalRows = example.sections.reduce((a, s) => a + s.rows.length, 0);
  const directorCount = (xmlText.match(/Директор/g) || []).length;
  const providedCount = (xmlText.match(/Обеспечен/g) || []).length;
  console.log(
    `STATS: разделов=${example.sections.length}, строк=${totalRows}, «Директор»=${directorCount}, «Обеспечен»=${providedCount}`,
  );
}

run();
