// End-to-end test for summary-protocol DOCX generation.
//
// Loads the built template public/templates/summary-protocol.docx, feeds it a
// synthetic SummaryProtocol equivalent (kept inline so the script runs under
// plain Node without TypeScript), and writes the rendered output to
// test-summary-output.docx in the project root.

const { readFileSync, writeFileSync } = require("node:fs");
const Docxtemplater = require("docxtemplater");
const PizZip = require("pizzip");

// ---------- inline test data (subset, mirrors src/lib/summaryExampleData.ts) ----------

function f(name, method, norm, actual, classValue = "") {
  return { name, method, norm, actual, classValue };
}

const adminFactors = (light, temp, hum, noise) => [
  f("Освещение, лк", "ГОСТ 24940-96", "300", light, "2"),
  f("Температура, ºС", "ГОСТ 12.1.005-88", "21-27", temp, "2"),
  f("Влажность, %", "ГОСТ 12.1.005-88", "60", hum, "2"),
  f("Шум, дБа", "ГОСТ ISO 9612-2016", "50", noise, "2"),
];

const prodFactors = (light, lightNorm, noise, noiseNorm) => [
  f("Освещение, лк", "ГОСТ 24940-96", lightNorm, light, "2"),
  f("Шум, дБа", "ГОСТ ISO 9612-2016", noiseNorm, noise, "2"),
];

const data = {
  protocol: {
    number: "TEST-СВД",
    year: "2026",
    day: "10",
    month: "апреля",
    dateYear: "2026",
  },
  customer: { name: "ТОО «TestCo»", address: "Алматы, ул. Тестовая, 1" },
  measurementLocation: "1. АУП, 2. Производственный персонал",
  measurementDate: { day: "10", month: "апреля", year: "2026" },
  roomDescription: "Тестовое помещение.",
  collectiveProtection: "имеется",
  equipment: "ПК, рабочий стол.",
  professionsList: "Директор, Бухгалтер, Сборщик, Фасовщик",
  measuringTools: [
    {
      rowNumber: 1,
      name: "Люксметр ТКА-ПКМ",
      certificate: "№ TEST-001",
      verificationDate: "01.01.2025 г.",
    },
    {
      rowNumber: 2,
      name: "Шумомер MS 6702",
      certificate: "№ TEST-002",
      verificationDate: "01.02.2025 г.",
    },
    {
      rowNumber: 3,
      name: "Метеометр МЭС-200А",
      certificate: "№ TEST-003",
      verificationDate: "01.03.2025 г.",
    },
  ],
  productStandard:
    "Приказ Министра здравоохранения РК от 16 февраля 2022 года № ҚР ДСМ-15.",
  conditions: { temperature: "16", humidity: "52", pressure: "694" },
  places: [
    {
      number: 1,
      name: "Административно – управленческий персонал",
      workplaces: [
        {
          code: "01 001 001",
          profession: "Директор",
          count: 1,
          factors: adminFactors("461", "23,5", "42", "45.4"),
        },
        {
          code: "01 001 002",
          profession: "Бухгалтер",
          count: 1,
          factors: adminFactors("525", "23,3", "41", "44.0"),
        },
      ],
    },
    {
      number: 2,
      name: "Производственный персонал",
      workplaces: [
        {
          code: "01 002 028",
          profession: "Сборщик",
          count: 1,
          factors: prodFactors("218", "200", "56.6", "70"),
        },
        {
          code: "01 002 033",
          profession: "Фасовщик",
          count: 1,
          factors: prodFactors("395", "200", "53.7", "70"),
        },
        {
          code: "01 002 037",
          profession: "Грузчик",
          count: 1,
          factors: prodFactors("222", "200", "58.7", "70"),
        },
      ],
    },
  ],
  performer: { fullName: "Тестов Т.Т.", position: "Заведующий лабораторией" },
  director: { fullName: "Иванов И.И.", position: "Начальник по БиОТ" },
};

// ---------- replicate buildTemplateContext from src/lib/generateSummaryProtocolDocx.ts ----------

function flatten(value, skipKeys = [], prefix = "", out = {}) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    if (prefix) out[prefix] = value;
    return out;
  }
  for (const [k, v] of Object.entries(value)) {
    if (!prefix && skipKeys.includes(k)) continue;
    const nk = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      flatten(v, skipKeys, nk, out);
    } else {
      out[nk] = v;
    }
  }
  return out;
}

function factorCells(factor) {
  const cells = {
    factorName: factor.name,
    factorMethod: factor.method,
    factorNorm: factor.norm,
    factorActual: factor.actual,
    class2: "",
    class31: "",
    class32: "",
    class33: "",
    class34: "",
    class4: "",
  };
  const display = factor.classValue ? `${factor.classValue} кл` : "";
  switch (factor.classValue) {
    case "2":   cells.class2 = display; break;
    case "3.1": cells.class31 = display; break;
    case "3.2": cells.class32 = display; break;
    case "3.3": cells.class33 = display; break;
    case "3.4": cells.class34 = display; break;
    case "4":   cells.class4 = display; break;
  }
  return cells;
}

const rows = [];
for (const place of data.places) {
  let firstWorkplace = true;
  for (const wp of place.workplaces) {
    let firstFactor = true;
    for (const factor of wp.factors) {
      rows.push({
        showSection: firstWorkplace && firstFactor,
        placeNumber: place.number,
        placeName: place.name,
        code: firstFactor ? wp.code : "",
        profession: firstFactor ? wp.profession : "",
        count: firstFactor ? String(wp.count) : "",
        ...factorCells(factor),
      });
      firstFactor = false;
    }
    firstWorkplace = false;
  }
}

const ctx = {
  ...flatten(data, ["places", "measuringTools"]),
  measuringTools: data.measuringTools.map((t) => ({ ...t })),
  rows,
};

// ---------- render ----------

const buf = readFileSync("public/templates/summary-protocol.docx");
const zip = new PizZip(buf);
const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });

try {
  doc.render(ctx);
  const out = doc.getZip().generate({
    type: "nodebuffer",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
  writeFileSync("test-summary-output.docx", out);
  console.log("Сводный протокол: ✓ PASS, размер:", out.length, "байт");
  console.log("  строк в основной таблице:", rows.length);
  console.log("  приборов СИ:", data.measuringTools.length);
} catch (e) {
  console.error("Сводный протокол: ✗ FAIL");
  console.error(e.message);
  if (e.properties && e.properties.errors) {
    e.properties.errors.forEach((err) => {
      console.error("  -", err.message);
      if (err.properties && err.properties.explanation) {
        console.error("    ", err.properties.explanation);
      }
    });
  }
  process.exit(1);
}
