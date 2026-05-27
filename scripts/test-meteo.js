// End-to-end test for meteo-protocol DOCX generation.
//
// Loads the built template public/templates/meteo-protocol.docx, feeds it a
// synthetic MeteoProtocol equivalent (kept inline so the script can run
// under plain Node without TypeScript), and writes the rendered output to
// test-meteo-output.docx in the project root.

const { readFileSync, writeFileSync } = require("node:fs");
const Docxtemplater = require("docxtemplater");
const PizZip = require("pizzip");

function m(
  rowNumber,
  pointNumber,
  place,
  workCategory,
  tempMeasured,
  tempAllowed,
  humidityMeasured,
  humidityAllowed,
) {
  return {
    rowNumber,
    pointNumber,
    place,
    workCategory,
    timeOfDay: "день",
    tempMeasured,
    tempAllowed,
    humidityMeasured,
    humidityAllowed,
    airSpeedMeasured: "-",
    airSpeedAllowed: "-",
    pressure: "694",
  };
}

const data = {
  protocol: {
    number: "TEST-MET",
    year: "2026",
    day: "10",
    month: "апреля",
    dateYear: "2026",
  },
  customer: { name: "TestCo", address: "Тест адрес, 1" },
  measurementDate: { day: "10", month: "апреля", year: "2026" },
  purpose: "Аттестация рабочих мест (тест)",
  methodologyStandard: "ГОСТ 30494-2011.",
  productStandard:
    "Приказ Министра здравоохранения Республики Казахстан от 16 февраля 2022 года № ҚР ДСМ-15.",
  representative: "Иванов И.И.",
  roomDescription: "Тестовое описание помещения.",
  conditions: { t: "16", h: "52", p: "694" },
  places: [
    {
      number: 1,
      name: "Административно – управленческий персонал",
      measurements: [
        m(1, "1т", "Директор", "Iб", "23,5", "21-28", "42", "60"),
        m(2, "2т", "Бухгалтер", "Iб", "22,8", "21-28", "41", "60"),
      ],
    },
    {
      number: 2,
      name: "Производственный персонал",
      measurements: [
        m(3, "3т", "Сборщик", "IIб", "16,5", "16-27", "70", "70"),
        m(4, "4т", "Фасовщик", "IIб", "18,1", "16-27", "66", "70"),
        m(5, "5т", "Сторож", "IIб", "20,1", "16-27", "59", "70"),
      ],
    },
  ],
  performer: { fullName: "Тестов Т.Т.", position: "Заведующий лабораторией" },
  director: { fullName: "Директоров Д.Д." },
};

// Replicate buildTemplateContext from src/lib/generateMeteoDocx.ts.
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

function flattenMeasurement(x) {
  return {
    rowNumber: x.rowNumber,
    pointNumber: x.pointNumber,
    place: x.place,
    workCategory: x.workCategory,
    timeOfDay: x.timeOfDay,
    tempMeasured: x.tempMeasured,
    tempAllowed: x.tempAllowed,
    humidityMeasured: x.humidityMeasured,
    humidityAllowed: x.humidityAllowed,
    airSpeedMeasured: x.airSpeedMeasured,
    airSpeedAllowed: x.airSpeedAllowed,
    pressure: x.pressure,
  };
}

const measurements = [];
for (const place of data.places) {
  place.measurements.forEach((meas, i) => {
    measurements.push({
      ...flattenMeasurement(meas),
      showPlace: i === 0,
      placeNumber: place.number,
      placeName: place.name,
    });
  });
}

const ctx = {
  ...flatten(data, ["places"]),
  measurements,
};

const buf = readFileSync("public/templates/meteo-protocol.docx");
const zip = new PizZip(buf);
const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });

try {
  doc.render(ctx);
  const out = doc
    .getZip()
    .generate({
      type: "nodebuffer",
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
  writeFileSync("test-meteo-output.docx", out);
  console.log("Микроклимат: ✓ PASS, размер:", out.length);
} catch (e) {
  console.error("Микроклимат: ✗ FAIL");
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
