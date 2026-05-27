/**
 * Тест генерации DOCX-протокола "Тяжесть трудового процесса".
 * Запуск: node scripts/test-heaviness.js
 *
 * Загружает шаблон public/templates/heaviness-protocol.docx, рендерит
 * через docxtemplater на примере heavinessExample и сохраняет
 * test-heaviness-output.docx в корне репозитория.
 */

const fs = require("fs");
const path = require("path");
const PizZip = require("pizzip");
const Docxtemplater = require("docxtemplater");

const ROOT = path.resolve(__dirname, "..");
const TEMPLATE = path.join(ROOT, "public", "templates", "heaviness-protocol.docx");
const OUT = path.join(ROOT, "test-heaviness-output.docx");

// --- inline example (mirrors src/lib/heavinessExampleData.ts) ---

function ind(value, cls = "1") {
  return { value, class: cls };
}

function adminWorkplace(rowNumber, code, position) {
  return {
    rowNumber,
    code,
    position,
    measurementPlace: "Административно – управленческий персонал",
    workDescription:
      "самостоятельно осуществлять трудовую деятельность в рамках предоставленных полномочий (нести полную ответственность за результаты своей работы).",
    finalAssessment: "1 класс – Оптимальный.",
    p1_1_regional: ind("до 2500"),
    p1_2_general_1to5: ind("до 12500"),
    p1_2_general_over5: ind("до 24000"),
    p2_1_alternating: ind("до 15"),
    p2_2_constant: ind("до 5"),
    p2_3_fromSurface: ind("до 250"),
    p2_3_fromFloor: ind("до 100"),
    p3_1_local: ind("до 10000"),
    p3_2_regional: ind("до 10000"),
    p4_1_oneHand: ind("до 12000"),
    p4_2_twoHands: ind("до 10000"),
    p4_3_bodyAndLegs: ind("до 43000"),
    p5_pose: ind("Сидя более 60 %", "2"),
    p6_bends: ind("до 50"),
    p7_1_horizontal: ind("до 4 км"),
    p7_2_vertical: ind("до 2 км"),
  };
}

const example = {
  protocol: {
    number: "1004-ТЯЖ",
    year: "2025",
    day: "10",
    month: "апреля",
    dateYear: "2026",
  },
  customer: {
    name: "ТОО «KazEcoFood»",
    address: "Алманиская обл, Карасайский район, село Кокозек, улица Несибели, 715",
  },
  measurementDate: { day: "10", month: "апреля", year: "2026" },
  workplaces: [
    adminWorkplace(1, "01 001 001", "Директор"),
    adminWorkplace(2, "01 001 002", "Управляющий производством"),
    adminWorkplace(3, "01 001 003", "Бухгалтер"),
  ],
  performer: { fullName: "Исаева А.В.", position: "Специалист лаборатории" },
  representative: { fullName: "Богачев А.И.", position: "Инженер по БиОТ" },
};

// --- expand indicator to template tags ---

function expandIndicator(prefix, ind) {
  const mark = (c) => (ind.class === c ? "+" : "");
  return {
    [`${prefix}_value`]: ind.value,
    [`${prefix}_c1`]: mark("1"),
    [`${prefix}_c2`]: mark("2"),
    [`${prefix}_c31`]: mark("3.1"),
    [`${prefix}_c32`]: mark("3.2"),
  };
}

function mapWorkplace(w) {
  return {
    rowNumber: w.rowNumber,
    code: w.code,
    position: w.position,
    measurementPlace: w.measurementPlace,
    workDescription: w.workDescription,
    finalAssessment: w.finalAssessment,
    ...expandIndicator("p1_1", w.p1_1_regional),
    ...expandIndicator("p1_2a", w.p1_2_general_1to5),
    ...expandIndicator("p1_2b", w.p1_2_general_over5),
    ...expandIndicator("p2_1", w.p2_1_alternating),
    ...expandIndicator("p2_2", w.p2_2_constant),
    ...expandIndicator("p2_3a", w.p2_3_fromSurface),
    ...expandIndicator("p2_3b", w.p2_3_fromFloor),
    ...expandIndicator("p3_1", w.p3_1_local),
    ...expandIndicator("p3_2", w.p3_2_regional),
    ...expandIndicator("p4_1", w.p4_1_oneHand),
    ...expandIndicator("p4_2", w.p4_2_twoHands),
    ...expandIndicator("p4_3", w.p4_3_bodyAndLegs),
    ...expandIndicator("p5", w.p5_pose),
    ...expandIndicator("p6", w.p6_bends),
    ...expandIndicator("p7_1", w.p7_1_horizontal),
    ...expandIndicator("p7_2", w.p7_2_vertical),
  };
}

function flatten(value, prefix = '', out = {}) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    if (prefix) out[prefix] = value;
    return out;
  }
  for (const [k, v] of Object.entries(value)) {
    const nextKey = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      flatten(v, nextKey, out);
    } else {
      out[nextKey] = v;
    }
  }
  return out;
}

function run() {
  const buf = fs.readFileSync(TEMPLATE);
  const zip = new PizZip(buf);
  const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });
  const rootFlat = flatten({
    protocol: example.protocol,
    customer: example.customer,
    measurementDate: example.measurementDate,
    performer: example.performer,
    representative: example.representative,
  });
  const context = {
    ...rootFlat,
    workplaces: example.workplaces.map((w) => ({
      ...rootFlat,
      ...mapWorkplace(w),
    })),
  };
  try {
    doc.render(context);
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

  // --- Автопроверка: в финальном документе не должно быть строки "undefined" ---
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
  console.log("VERIFY: 'undefined' в финальном DOCX не найдено ✅");
}

run();
