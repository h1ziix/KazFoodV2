/**
 * Тест генерации DOCX-протокола "Напряжённость трудового процесса".
 * Запуск: node scripts/test-tension.js
 *
 * Загружает шаблон public/templates/tension-protocol.docx, рендерит
 * через docxtemplater на примере tensionExample и сохраняет
 * test-tension-output.docx в корне репозитория.
 */

const fs = require("fs");
const path = require("path");
const PizZip = require("pizzip");
const Docxtemplater = require("docxtemplater");

const ROOT = path.resolve(__dirname, "..");
const TEMPLATE = path.join(ROOT, "public", "templates", "tension-protocol.docx");
const OUT = path.join(ROOT, "test-tension-output.docx");

// --- inline example (mirrors src/lib/tensionExampleData.ts) ---

function ind(value, cls = "2") {
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
    finalAssessment: "2 класс – Допустимый.",

    p1_1_content: ind("Решение простых задач по инструкции"),
    p1_2_signals: ind("Восприятие сигналов с последующей коррекцией действий"),
    p1_3_distribution: ind("Обработка, выполнение задания и его проверка"),
    p1_4_character: ind("Работа по установленному графику"),

    p2_1_duration: ind("26 – 50"),
    p2_2_density: ind("76 – 175"),
    p2_3_objects: ind("6 – 10"),
    p2_4_sizeLong: ind("5 – 1,1 мм – более 50 %"),
    p2_5_optical: ind("до 25"),
    p2_6_videoTerminal: ind("до 3"),
    p2_7_voiceLoad: ind("Разборчивость слов и сигналов от 90 до 70 %"),
    p2_8_speakLoad: ind("16 – 20"),

    p3_1_responsibility: ind(
      "Несет ответственность за функциональное качество вспомогательных работ",
    ),
    p3_2_risk: ind("Исключена", "1"),
    p3_3_othersRisk: ind("Исключена", "1"),

    p4_1_elements: ind("9 – 6"),
    p4_2_duration: ind("100 – 25"),
    p4_3_active: ind("20 – 9"),
    p4_4_passive: ind("76 – 80"),

    p5_1_duration: ind("8 – 9 ч"),
    p5_2_shift: ind("Односменная работа без ночной смены", "1"),
    p5_3_breaks: ind(
      "Перерывы регламентированы, достаточной продолжительности",
      "1",
    ),
  };
}

const example = {
  protocol: {
    number: "1004-НАП",
    year: "2025",
    day: "10",
    month: "апреля",
    dateYear: "2026",
  },
  customer: {
    name: "ТОО «KazEcoFood»",
    address:
      "Алманиская обл, Карасайский район, село Кокозек, улица Несибели, 715",
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

function expandIndicator(prefix, indicator) {
  const mark = (c) => (indicator.class === c ? "+" : "");
  return {
    [`${prefix}_value`]: indicator.value,
    [`${prefix}_c1`]: mark("1"),
    [`${prefix}_c2`]: mark("2"),
    [`${prefix}_c31`]: mark("3.1"),
    [`${prefix}_c32`]: mark("3.2"),
  };
}

function mapWorkplace(w) {
  const allIndicators = [
    w.p1_1_content, w.p1_2_signals, w.p1_3_distribution, w.p1_4_character,
    w.p2_1_duration, w.p2_2_density, w.p2_3_objects, w.p2_4_sizeLong,
    w.p2_5_optical, w.p2_6_videoTerminal, w.p2_7_voiceLoad, w.p2_8_speakLoad,
    w.p3_1_responsibility, w.p3_2_risk, w.p3_3_othersRisk,
    w.p4_1_elements, w.p4_2_duration, w.p4_3_active, w.p4_4_passive,
    w.p5_1_duration, w.p5_2_shift, w.p5_3_breaks,
  ];
  const counts = { "1": 0, "2": 0, "3.1": 0, "3.2": 0 };
  for (const i of allIndicators) if (i && counts[i.class] !== undefined) counts[i.class]++;
  const fmt = (n) => (n > 0 ? String(n) : "");

  return {
    rowNumber: w.rowNumber,
    code: w.code,
    position: w.position,
    measurementPlace: w.measurementPlace,
    workDescription: w.workDescription,
    finalAssessment: w.finalAssessment,

    count_c1: fmt(counts["1"]),
    count_c2: fmt(counts["2"]),
    count_c31: fmt(counts["3.1"]),
    count_c32: fmt(counts["3.2"]),

    ...expandIndicator("p1_1", w.p1_1_content),
    ...expandIndicator("p1_2", w.p1_2_signals),
    ...expandIndicator("p1_3", w.p1_3_distribution),
    ...expandIndicator("p1_4", w.p1_4_character),

    ...expandIndicator("p2_1", w.p2_1_duration),
    ...expandIndicator("p2_2", w.p2_2_density),
    ...expandIndicator("p2_3", w.p2_3_objects),
    ...expandIndicator("p2_4", w.p2_4_sizeLong),
    ...expandIndicator("p2_5", w.p2_5_optical),
    ...expandIndicator("p2_6", w.p2_6_videoTerminal),
    ...expandIndicator("p2_7", w.p2_7_voiceLoad),
    ...expandIndicator("p2_8", w.p2_8_speakLoad),

    ...expandIndicator("p3_1", w.p3_1_responsibility),
    ...expandIndicator("p3_2", w.p3_2_risk),
    ...expandIndicator("p3_3", w.p3_3_othersRisk),

    ...expandIndicator("p4_1", w.p4_1_elements),
    ...expandIndicator("p4_2", w.p4_2_duration),
    ...expandIndicator("p4_3", w.p4_3_active),
    ...expandIndicator("p4_4", w.p4_4_passive),

    ...expandIndicator("p5_1", w.p5_1_duration),
    ...expandIndicator("p5_2", w.p5_2_shift),
    ...expandIndicator("p5_3", w.p5_3_breaks),
  };
}

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

function run() {
  const buf = fs.readFileSync(TEMPLATE);
  const zip = new PizZip(buf);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
  });
  const rootFlat = flatten({
    protocol: example.protocol,
    customer: example.customer,
    measurementDate: example.measurementDate,
    performer: example.performer,
    representative: example.representative,
  });
  // Mirror src/lib/docs/protocolNumber.ts (formatProtocolNumber): one
  // leading zero + the number padded to >=2 digits → 001, 010, 0100.
  const fmtProtocolNumber = (seq) => "0" + String(seq).padStart(2, "0");
  const context = {
    ...rootFlat,
    workplaces: example.workplaces.map((w, idx) => ({
      ...rootFlat,
      ...mapWorkplace(w),
      "protocol.number": fmtProtocolNumber(idx + 1),
    })),
  };
  try {
    doc.render(context);
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
  // Apply the same post-render numbering-restart hook the browser
  // generator wires through engine.renderBlob. Without this, every
  // workplace iteration shares the same <w:numId>, so Word's list
  // counters continue 1..N across all iterations instead of restarting.
  const {
    restartListNumberingPerLoop,
  } = require("../src/lib/docs/numberingRestart.cjs");
  restartListNumberingPerLoop(doc.getZip());
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

  // 2) не должно быть незаменённых тегов вида { ... }
  // Учитываем, что в готовом DOCX встречаются настоящие фигурные скобки в
  // обычном тексте (например в номерах разделов вроде "(% уақыт ауысым)").
  // Поэтому ищем именно ОДНОстрочные шаблоны {ключ} / {ключ.путь} без пробелов.
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
}

run();
