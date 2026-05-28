// scripts/build-cover-template.js
// Build cover-protocol.docx template from source DOCX (file №1 "Обложка")
// by injecting docxtemplater placeholders.
//
// FIDELITY RULES (see scripts/lib/safe-injector.js for the contract):
//   * We touch ONLY the inner text of specific <w:t> nodes.
//   * We never rebuild <w:r>, <w:p> or <w:tbl> wrappers.
//   * Every paragraph in the source that has no placeholder remains
//     byte-identical in the generated template.
//
// Strategy:
//   1. For tokens that already live inside a single <w:t> node, use
//      replaceTextNodeOnly().
//   2. For tokens that Word's spell checker / direct edit fragmented
//      across multiple adjacent <w:t> nodes in the SAME paragraph, use
//      spliceAdjacentTextNodes(): the placeholder is spliced into the
//      first <w:t>, the partner <w:t> nodes are emptied (their <w:r> /
//      <w:rPr> wrappers stay intact, no spacing/page-layout changes).
//
// Usage: node scripts/build-cover-template.js

"use strict";

const fs = require("node:fs");
const path = require("node:path");
const PizZip = require("pizzip");
const {
  replaceTextNodeOnly,
  spliceAdjacentTextNodes,
} = require("./lib/safe-injector");

const ROOT = path.resolve(__dirname, "..");

function findSourceDocx() {
  const entries = fs.readdirSync(ROOT);
  const match = entries.find((f) => /^1\..*\.docx$/i.test(f));
  if (!match) {
    throw new Error("Source cover DOCX (1.*.docx) not found in project root");
  }
  return path.join(ROOT, match);
}

const OUT_DOCX = path.join(
  ROOT,
  "public",
  "templates",
  "cover-protocol.docx",
);

function main() {
  const src = findSourceDocx();
  console.log(`Source: ${src}`);
  const buf = fs.readFileSync(src);
  const zip = new PizZip(buf);
  let doc = zip.file("word/document.xml").asText();
  const lenBefore = doc.length;

  // ---- (1) splice fragmented multi-<w:t> tokens ------------------------
  // Each entry maps a list of consecutive <w:t> bodies (in source order)
  // to a single placeholder. The first <w:t> receives the placeholder,
  // partners are emptied. All <w:r>/<w:rPr>/<w:proofErr>/<w:bookmark*>
  // between them remain byte-identical.
  const spliceOps = [
    {
      label: "Балян +   Л.Н.  →  {customer.directorName}",
      runs: ["Балян", "  Л.Н."],
      placeholder: "{customer.directorName}",
      requireMin: 2,
      requireMax: 2,
    },
    {
      label: "Алматы +  202 + 6 +  г.  →  {city} {reportYear} г.",
      runs: ["Алматы", " 202", "6", " г."],
      placeholder: "{city} {reportYear} г.",
      requireMin: 2,
      requireMax: 2,
    },
    {
      label: "Алматы 2020 +  г.  →  {city} {archiveYear} г.",
      runs: ["Алматы 2020", " г."],
      placeholder: "{city} {archiveYear} г.",
      requireMin: 2,
      requireMax: 2,
    },
    {
      label: "ТОО  + «Центр…»  →  {performer.organization}",
      runs: ["ТОО ", "«Центр экспертной оценки условий труда»"],
      placeholder: "{performer.organization}",
      requireMin: 2,
      requireMax: 2,
    },
  ];

  for (const op of spliceOps) {
    const out = spliceAdjacentTextNodes(doc, op.runs, op.placeholder, {
      requireMin: op.requireMin,
      requireMax: op.requireMax,
    });
    doc = out.xml;
    console.log(`splice  ${op.label}: ${out.replaced}`);
  }

  // ---- (2) single-<w:t> placeholder injections -------------------------
  // Each entry rewrites only the text content of every matching <w:t>.
  // The <w:t> attributes and ALL surrounding XML are preserved.
  const textOps = [
    {
      exact: "ТОО  «KazEcoFood»",
      placeholder: "{customer.organization}",
      requireMin: 4,
      requireMax: 4,
    },
    {
      exact: "Дьяченко В. Г.",
      placeholder: "{performer.directorName}",
      requireMin: 2,
      requireMax: 2,
    },
    {
      exact: "Генеральный директор",
      placeholder: "{performer.directorPosition}",
      requireMin: 2,
      requireMax: 2,
    },
  ];

  for (const op of textOps) {
    const out = replaceTextNodeOnly(doc, op.exact, op.placeholder, {
      requireMin: op.requireMin,
      requireMax: op.requireMax,
    });
    doc = out.xml;
    console.log(
      `text    "${op.exact}" → ${op.placeholder}: ${out.replaced}`,
    );
  }

  // ---- (3) sanity scan -------------------------------------------------
  // No source-literal customer/performer data should remain.
  const forbidden = [
    "KazEcoFood",
    "Балян",
    "Дьяченко",
    "Генеральный директор",
    "Алматы",
    "«Центр экспертной оценки",
  ];
  let leaks = 0;
  for (const lit of forbidden) {
    if (doc.includes(lit)) {
      console.warn(`  WARN: source literal still present: "${lit}"`);
      leaks += 1;
    }
  }
  if (leaks > 0) {
    throw new Error(`Cover template still contains ${leaks} source literal(s).`);
  }

  console.log(
    `document.xml: ${lenBefore} → ${doc.length} bytes (Δ ${doc.length - lenBefore})`,
  );

  // ---- (4) emit --------------------------------------------------------
  zip.file("word/document.xml", doc);
  const outDir = path.dirname(OUT_DOCX);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outBuf = zip.generate({ type: "nodebuffer" });
  fs.writeFileSync(OUT_DOCX, outBuf);
  console.log(`Wrote: ${OUT_DOCX} (${outBuf.length} bytes)`);
}

main();
