/**
 * Тест генерации DOCX-документа №13 «Кодировка рабочих мест».
 * Запуск: node scripts/test-coding.js
 *
 * Шаги:
 *   1) пересборка шаблона public/templates/coding-protocol.docx;
 *   2) рендер шаблона на codingExample-эквиваленте (зеркало
 *      src/lib/codingExampleData.ts);
 *   3) сохранение в test-coding-output.docx;
 *   4) автопроверки:
 *        – нет "undefined" в финальном XML;
 *        – нет незаменённых тегов { ... };
 *        – derived counts ("13 рабочих мест", "42 рабочих мест",
 *          "Итого: 55") присутствуют ровно так, как ожидается.
 */

const fs = require("fs");
const path = require("path");
const PizZip = require("pizzip");
const Docxtemplater = require("docxtemplater");

const ROOT = path.resolve(__dirname, "..");
const TEMPLATE = path.join(ROOT, "public", "templates", "coding-protocol.docx");
const OUT = path.join(ROOT, "test-coding-output.docx");

// --- (1) пересобрать шаблон ---
require("./build-coding-template.js");

// --- inline example (зеркало src/lib/codingExampleData.ts) ---

function r(code, name, count = 1) {
  return { code, name, count };
}

const example = {
  approval: {
    position: "Директор",
    organization: "ТОО «KazEcoFood»",
    fullName: "Балян Л.Н.",
    date: { day: "20", month: "апреля", year: "2026" },
  },
  sections: [
    {
      number: 1,
      title: "Административно – управленческий персонал",
      rows: [
        r("01 001 001", "Директор"),
        r("01 001 002", "Управляющий производством"),
        r("01 001 003", "Бухгалтер"),
        r("01 001 004", "Коммерческий директор"),
        r("01 001 005", "Технический директор"),
        r("01 001 006", "Менеджер по продажам", 2),
        r("01 001 007", "Менеджер по снабжению"),
        r("01 001 008", "Главный механик"),
        r("01 001 009", "Главный энергетик"),
        r("01 001 010", "Специалист по кадровым вопросам"),
        r("01 001 011", "Начальник службы безопасности"),
        r("01 001 012", "Специалист по безопасности и охране труда"),
        r("01 001 013", "Технолог оператор"),
      ],
    },
    {
      number: 2,
      title: "Производственный персонал",
      rows: [
        r("01 001 014", "Технолог оператор"),
        r("01 001 015", "Бригадир ремонтно-строительной бригады"),
        r("01 001 016", "Бригадир технической бригады"),
        r("01 002 017", "Бригадир цеха выращивания и хранения"),
        r("01 002 018", "Электро слесарь", 3),
        r("01 002 019", "Водитель экспедитор", 3),
        r("01 003 020", "Лаборант"),
        r("01 003 021", "Поливщик", 2),
        r("01 003 022", "Сборщик", 5),
        r("01 003 023", "Фасовщик", 4),
        r("01 004 024", "Грузчик", 2),
        r("01 004 025", "Тракторист"),
        r("01 004 026", "Разнорабочий", 3),
        r("01 004 027", "Слесарь"),
        r("01 004 028", "Сторож", 9),
        r("01 004 029", "Шеф повар"),
        r("01 005 030", "Посудомойщица"),
        r("01 005 031", "Прачка"),
      ],
    },
  ],
};

// --- утилиты, зеркальные src/lib/docs/*.ts ---

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

function sumBy(items, getter) {
  let acc = 0;
  for (const item of items) acc += getter(item);
  return acc;
}

function flattenSectionsRows(sections, mapRow, rootFlat) {
  return sections.map((section) => ({
    ...rootFlat,
    section_number: section.number,
    section_title: section.title,
    rows: section.rows.map((rw) => ({
      ...rootFlat,
      section_number: section.number,
      section_title: section.title,
      ...mapRow(rw),
    })),
  }));
}

function mapRow(rw) {
  return { code: rw.code, name: rw.name, count: rw.count };
}

function buildContext(data) {
  const rootFlat = flatten({ approval: data.approval });
  const sectionsCtx = flattenSectionsRows(data.sections, mapRow, rootFlat).map(
    (sectionCtx, idx) => {
      const s = data.sections[idx];
      const total = sumBy(s.rows, (rw) => rw.count);
      return {
        ...sectionCtx,
        section_count: total,
        section_header: `${s.number}. ${s.title} — ${total} рабочих мест`,
      };
    },
  );
  return {
    ...rootFlat,
    sections: sectionsCtx,
    grand_total: sumBy(data.sections, (s) => sumBy(s.rows, (rw) => rw.count)),
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
  console.log("VERIFY: 'undefined' не найдено ✅");

  const tagMatches = [
    ...xmlText.matchAll(/\{[a-zA-Z_][a-zA-Z0-9_.#/]*\}/g),
  ].map((m) => m[0]);
  if (tagMatches.length > 0) {
    console.error(
      `FAIL: остались незаменённые теги (${tagMatches.length}):`,
    );
    tagMatches.slice(0, 20).forEach((s, i) => console.error(`  [${i}]`, s));
    process.exit(3);
  }
  console.log("VERIFY: незаменённых шаблонных тегов { ... } не найдено ✅");

  // Derived aggregates check
  const expectAdmin = sumBy(example.sections[0].rows, (rw) => rw.count); // 14
  const expectProd = sumBy(example.sections[1].rows, (rw) => rw.count); // 42
  const expectGrand = expectAdmin + expectProd; // 56

  function mustContain(needle) {
    if (xmlText.indexOf(needle) === -1) {
      console.error(`FAIL: ожидался текст «${needle}» в финальном DOCX`);
      process.exit(4);
    }
  }
  mustContain(
    `1. Административно – управленческий персонал — ${expectAdmin} рабочих мест`,
  );
  mustContain(`2. Производственный персонал — ${expectProd} рабочих мест`);
  mustContain(`Итого: ${expectGrand} р/м`);
  console.log(
    `VERIFY: section counts (${expectAdmin}, ${expectProd}) и grand_total (${expectGrand}) на месте ✅`,
  );

  const totalRows = example.sections.reduce((a, s) => a + s.rows.length, 0);
  console.log(
    `STATS: разделов=${example.sections.length}, строк=${totalRows}, sum(count)=${expectGrand}`,
  );
}

run();
