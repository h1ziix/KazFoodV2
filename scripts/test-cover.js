// End-to-end test for cover-protocol DOCX generation.
//
// Loads public/templates/cover-protocol.docx, feeds it a CoverDocument
// equivalent, renders and writes test-cover-output.docx in the project
// root. Replicates buildTemplateContext from generateCoverDocx.ts inline so
// the script runs under plain Node without TypeScript.

const { readFileSync, writeFileSync } = require("node:fs");
const Docxtemplater = require("docxtemplater");
const PizZip = require("pizzip");

const data = {
  customer: {
    organization: "ТОО  «KazEcoFood»",
    directorName: "Балян  Л.Н.",
  },
  performer: {
    organization: "ТОО «Центр экспертной оценки условий труда»",
    directorPosition: "Генеральный директор",
    directorName: "Дьяченко В. Г.",
  },
  city: "Алматы",
  reportYear: "2026",
  archiveYear: "2020",
};

// Inline flatten — same implementation as src/lib/docs/flatten.ts.
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

const ctx = flatten(data);

const buf = readFileSync("public/templates/cover-protocol.docx");
const zip = new PizZip(buf);
const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });

try {
  doc.render(ctx);
  const out = doc.getZip().generate({
    type: "nodebuffer",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
  writeFileSync("test-cover-output.docx", out);

  // Verify zero unreplaced tags and no `undefined` slipped through.
  const renderedXml = doc.getZip().file("word/document.xml").asText();
  const unreplaced = renderedXml.match(/\{[a-zA-Z][a-zA-Z0-9.]*\}/g) || [];
  const undefinedHits = renderedXml.match(/>undefined</g) || [];
  if (unreplaced.length) {
    console.error("Обложка: ✗ FAIL — unreplaced tags:", unreplaced.slice(0, 10));
    process.exit(1);
  }
  if (undefinedHits.length) {
    console.error(
      "Обложка: ✗ FAIL — `undefined` rendered:",
      undefinedHits.length,
    );
    process.exit(1);
  }
  console.log("Обложка: ✓ PASS, размер:", out.length);
} catch (e) {
  console.error("Обложка: ✗ FAIL");
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
