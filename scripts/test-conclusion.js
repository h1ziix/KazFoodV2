/**
 * Тест генерации DOCX «Заключение / Отчёт» (документ №14).
 * Запуск: node scripts/test-conclusion.js
 *
 * Загружает public/templates/conclusion-protocol.docx, рендерит через
 * docxtemplater на примере conclusionExample и сохраняет
 * test-conclusion-output.docx в корне репозитория.
 */

const fs = require("fs");
const path = require("path");
const PizZip = require("pizzip");
const Docxtemplater = require("docxtemplater");

const ROOT = path.resolve(__dirname, "..");
const TEMPLATE = path.join(ROOT, "public", "templates", "conclusion-protocol.docx");
const OUT = path.join(ROOT, "test-conclusion-output.docx");

// --- inline example mirroring src/lib/conclusionExampleData.ts ---

const example = {
  customer: {
    name: "ТОО «KazEcoFood»",
    address: "Алманиская обл, Карасайский район, село Кокозек, улица Несибели, 715",
  },
  measurementPlace:
    "Административное помещение, производственное помещение, складское помещение, автомастерская (грузовая), помещение лаборатории, кухня.",
  workplaceCodeNote: "см. стр. материала аттестации рабочих мест.",
  totalWorkplaces: "55 мест",
  measurementDate: { day: "10", month: "апреля", year: "2026" },
  rows: [
    { labelKk: "Жарықтандыру", labelRu: "Освещение", classValue: "2", count: 55 },
    { labelKk: "Микроклиматы", labelRu: "Микроклимат", classValue: "2", count: 55 },
    { labelKk: "Шу", labelRu: "Шум", classValue: "2", count: 55 },
    {
      labelKk:
        "Бейне-дисплей терминалы мен дербес компьютерде пайда болатын электромагниттік өрістер",
      labelRu:
        "Электромагнитные поля, создаваемые видео дисплейным терминалом и персональным компьютером",
      classValue: "2",
      count: 14,
    },
    { labelKk: "Жұмыс ауырлығы", labelRu: "Тяжесть труда:", classValue: "2", count: 55 },
    { labelKk: "", labelRu: "мужчины", classValue: "2", count: 30 },
    { labelKk: "", labelRu: "женщины", classValue: "2", count: 25 },
    {
      labelKk: "Жұмыс қауырттылығы",
      labelRu: "Напряженность труда:",
      classValue: "2",
      count: 55,
    },
    { labelKk: "", labelRu: "мужчины", classValue: "2", count: 30 },
    { labelKk: "", labelRu: "женщины", classValue: "2", count: 25 },
    {
      labelKk: "Еңбек жағдайларын жалпы бағасы",
      labelRu: "Общая оценка условий труда:",
      classValue: "2",
      count: 55,
    },
    { labelKk: "", labelRu: "мужчины", classValue: "2", count: 30 },
    { labelKk: "", labelRu: "женщины", classValue: "2", count: 25 },
  ],
  performer: { fullName: "Дьяченко И.С.", position: "Заведующий лабораторией" },
  laboratoryHead: { fullName: "Дьяченко В.Г.", position: "Генеральный директор" },
  representative: { fullName: "Богачев А.И.", position: "Начальник по БиОТ" },
};

// --- shared-layer mirrors ---

const SIX_CLASS_SUFFIXES = {
  "2": "c2",
  "3.1": "c31",
  "3.2": "c32",
  "3.3": "c33",
  "3.4": "c34",
  "4": "c4",
};

function expandClassCount(prefix, classValue, display) {
  const out = {};
  for (const cls of Object.keys(SIX_CLASS_SUFFIXES)) {
    const key = prefix ? `${prefix}_${SIX_CLASS_SUFFIXES[cls]}` : SIX_CLASS_SUFFIXES[cls];
    out[key] = classValue === cls ? display : "";
  }
  return out;
}

function flatten(value, skipKeys = [], prefix = "", out = {}) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    if (prefix) out[prefix] = value;
    return out;
  }
  for (const [k, v] of Object.entries(value)) {
    if (!prefix && skipKeys.includes(k)) continue;
    const nextKey = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      flatten(v, skipKeys, nextKey, out);
    } else {
      out[nextKey] = v;
    }
  }
  return out;
}

function rowCells(r) {
  const display = r.count === "" ? "" : String(r.count);
  return {
    labelKk: r.labelKk,
    labelRu: r.labelRu,
    ...expandClassCount("", r.classValue, display),
  };
}

function buildContext(data) {
  return {
    ...flatten(data, ["rows"]),
    rows: data.rows.map(rowCells),
  };
}

function run() {
  const buf = fs.readFileSync(TEMPLATE);
  const zip = new PizZip(buf);
  const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });
  try {
    doc.render(buildContext(example));
  } catch (err) {
    console.error("RENDER ERROR:", err.message);
    if (err.properties && err.properties.errors) {
      err.properties.errors.forEach((e, i) =>
        console.error(`  [${i}]`, e.message, e.properties && e.properties.explanation),
      );
    }
    process.exit(1);
  }
  const out = doc.getZip().generate({ type: "nodebuffer" });
  fs.writeFileSync(OUT, out);
  console.log(`OK: wrote ${OUT} (${out.length} bytes)`);

  // verify no 'undefined' and no leftover {tags}
  const verifyZip = new PizZip(out);
  const xmlText = verifyZip
    .file("word/document.xml")
    .asText()
    .replace(/<[^>]+>/g, "");

  const undefMatches = [...xmlText.matchAll(/.{0,40}undefined.{0,40}/g)].map((m) => m[0]);
  if (undefMatches.length > 0) {
    console.error(`FAIL: найдено ${undefMatches.length} вхождений 'undefined':`);
    undefMatches.slice(0, 10).forEach((s, i) => console.error(`  [${i}]`, s));
    process.exit(2);
  }
  const leftover = [...xmlText.matchAll(/\{[^{}]+\}/g)].map((m) => m[0]);
  if (leftover.length > 0) {
    console.error(`FAIL: незаменённые плейсхолдеры (${leftover.length}):`);
    leftover.slice(0, 10).forEach((s, i) => console.error(`  [${i}]`, s));
    process.exit(3);
  }

  // verify expected counts ended up in c2 column (we expect "55" and "14" and "30"/"25")
  const must = ["55", "14", "30", "25", "ТОО «KazEcoFood»", "Богачев А.И."];
  for (const needle of must) {
    if (!xmlText.includes(needle)) {
      console.error(`FAIL: ожидаемая строка не найдена в результате: ${needle}`);
      process.exit(4);
    }
  }
  console.log("VERIFY: ✅ undefined нет, незаменённых тегов нет, ключевые значения присутствуют");
}

run();
