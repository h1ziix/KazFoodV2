// End-to-end test for intro-protocol DOCX generation.
//
// Loads public/templates/intro-protocol.docx, feeds it an IntroDocument
// equivalent, renders and writes test-intro-output.docx in the project
// root. Replicates buildTemplateContext from generateIntroDocx.ts inline
// (just `flatten`) so the script runs under plain Node without TS.

const { readFileSync, writeFileSync } = require("node:fs");
const Docxtemplater = require("docxtemplater");
const PizZip = require("pizzip");

const data = {
  customer: {
    name: "KazEcoFood",
    city: "Алматы",
    address:
      "Алманиская обл, Карасайский район, село Кокозек, улица Несибели, 715",
  },
  measurementDate: { day: "10", month: "апреля", year: "2026" },
  workplaceCount: 55,
  maleCount: 0,
  femaleCount: 0,
  performer: {
    organization: "ТОО «Центр экспертной оценки условий труда»",
    addressRu: "г. Алматы, Турксибский район, ул. Остроумова, 50А",
    addressKk: "Алматы қ., Турксиб ауданы, Остроумов көш., 50А үй",
    accreditation: {
      number: "KZ.T.02.Е 1210",
      dateRu: "25 июля 2022 года",
      dateKk: "2022 жылғы 25 шілдедегі",
    },
  },
  heavinessCounts: { c1: 13, c2: 42, c31: 0 },
  tensionCounts: { c1: 0, c2: 55, c31: 0 },
  safetyClassLabel: "допустимый 2",
};

function flatten(value, prefix = "", out = {}) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    if (prefix) out[prefix] = value;
    return out;
  }
  for (const [k, v] of Object.entries(value)) {
    const nk = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      flatten(v, nk, out);
    } else {
      out[nk] = v;
    }
  }
  return out;
}

const ctx = flatten(data);
const buf = readFileSync("public/templates/intro-protocol.docx");
const zip = new PizZip(buf);
const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });

try {
  doc.render(ctx);
  const out = doc.getZip().generate({
    type: "nodebuffer",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
  writeFileSync("test-intro-output.docx", out);

  const renderedXml = doc.getZip().file("word/document.xml").asText();
  const unreplaced = renderedXml.match(/\{[a-zA-Z][a-zA-Z0-9.]*\}/g) || [];
  const undefinedHits = renderedXml.match(/>undefined</g) || [];
  if (unreplaced.length) {
    console.error("Введение: ✗ FAIL — unreplaced tags:", unreplaced.slice(0, 10));
    process.exit(1);
  }
  if (undefinedHits.length) {
    console.error(
      "Введение: ✗ FAIL — `undefined` rendered:",
      undefinedHits.length,
    );
    process.exit(1);
  }
  console.log("Введение: ✓ PASS, размер:", out.length);
} catch (e) {
  console.error("Введение: ✗ FAIL");
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
