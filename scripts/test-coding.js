/**
 * Тест генерации DOCX-документа №13 «Кодировка рабочих мест».
 * Запуск: node scripts/test-coding.js
 *
 * Шаги:
 *   1) пересборка шаблона public/templates/coding-protocol.docx;
 *   2) рендер шаблона на тестовом наборе из 5 РАЗДЕЛОВ (для проверки
 *      динамической поддержки произвольного числа разделов);
 *   3) сохранение в test-coding-output.docx;
 *   4) автопроверки:
 *        – нет "undefined" в финальном XML;
 *        – нет незаменённых тегов { ... };
 *        – ВСЕ 5 заголовков разделов и grand_total присутствуют.
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
        r("01 001 006", "Менеджер по продажам", 2),
      ],
    },
    {
      number: 2,
      title: "Производственный персонал",
      rows: [
        r("01 002 014", "Технолог оператор"),
        r("01 002 018", "Электро слесарь", 3),
        r("01 002 019", "Водитель экспедитор", 3),
      ],
    },
    {
      number: 3,
      title: "Складской персонал",
      rows: [
        r("01 003 001", "Заведующий складом"),
        r("01 003 002", "Кладовщик", 2),
        r("01 003 003", "Грузчик", 4),
      ],
    },
    {
      number: 4,
      title: "Транспортный персонал",
      rows: [
        r("01 004 001", "Водитель", 5),
        r("01 004 002", "Механик автопарка"),
      ],
    },
    {
      number: 5,
      title: "Вспомогательный персонал",
      rows: [
        r("01 005 001", "Уборщик", 3),
        r("01 005 002", "Сторож", 4),
        r("01 005 003", "Дворник"),
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

function mapRow(rw) {
  return { code: rw.code, name: rw.name, count: rw.count };
}

function buildSection(s) {
  return {
    section_header: `${s.number}. ${s.title}`,
    rows: s.rows.map(mapRow),
  };
}

function buildContext(data) {
  const rootFlat = flatten({ approval: data.approval });
  return {
    ...rootFlat,
    sections: data.sections.map(buildSection),
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
  const expectGrand = sumBy(example.sections, (s) =>
    sumBy(s.rows, (rw) => rw.count),
  );

  function mustContain(needle) {
    if (xmlText.indexOf(needle) === -1) {
      console.error(`FAIL: ожидался текст «${needle}» в финальном DOCX`);
      process.exit(4);
    }
  }
  function mustNotContain(needle) {
    if (xmlText.indexOf(needle) !== -1) {
      console.error(
        `FAIL: НЕ должен встречаться текст «${needle}» в финальном DOCX`,
      );
      process.exit(5);
    }
  }
  // Every section header MUST appear in the rendered DOCX. This is the
  // core regression assertion: prior to the dynamic refactor only
  // sections[0] and sections[1] were rendered.
  for (const s of example.sections) {
    mustContain(`${s.number}. ${s.title}`);
  }
  // grand_total must reflect ALL sections (not just first two).
  mustContain(`Итого: ${expectGrand} р/м`);
  // Sanity: no leftover hardcoded "1." / "2." literals from the old
  // template that would indicate stale rows survived the splice.
  // (The section 1 / 2 titles ARE expected because they're in the data.)

  // Verify each section's data rows actually rendered.
  for (const s of example.sections) {
    for (const row of s.rows) {
      mustContain(row.code);
    }
  }
  console.log(
    `VERIFY: все ${example.sections.length} разделов отрендерены, ` +
      `grand_total=${expectGrand} ✅`,
  );

  const totalRows = example.sections.reduce((a, s) => a + s.rows.length, 0);
  console.log(
    `STATS: разделов=${example.sections.length}, строк=${totalRows}, sum(count)=${expectGrand}`,
  );
}

run();
