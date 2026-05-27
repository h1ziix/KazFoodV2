// Build cover-protocol.docx template from source DOCX (file №1 "Обложка")
// by injecting docxtemplater placeholders.
//
// The cover document is two identical halves (kk-KZ + ru-RU) with no
// dynamic tables, loops or indicators — just a fixed layout populated by
// a flat set of scalars. Each variable token appears twice (once per half)
// — docxtemplater accepts the same placeholder repeated N times.
//
// Strategy: do exact-text replacement on the XML string. For tokens that
// Word's spell checker split across multiple <w:t> runs we first close the
// adjacent runs into a single one, then replace.
//
// Usage: node scripts/build-cover-template.js

const fs = require("node:fs");
const path = require("node:path");
const PizZip = require("pizzip");

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

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Find every <w:t ...>TEXT</w:t> in `xml` whose body equals `exactText`
// and replace the WHOLE node with a single <w:t xml:space="preserve">
// containing `newText`. Returns { xml, replaced }.
function replaceWholeRun(xml, exactText, newText) {
  const escaped = escapeRegex(exactText);
  const re = new RegExp(
    `<w:t(?:\\s[^>]*)?>${escaped}</w:t>`,
    "g",
  );
  let replaced = 0;
  const next = xml.replace(re, () => {
    replaced += 1;
    return `<w:t xml:space="preserve">${escapeXml(newText)}</w:t>`;
  });
  return { xml: next, replaced };
}

function escapeXml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Collapse the sequence of runs:
//   <w:r ...> <w:rPr>RPR_A</w:rPr> <w:t ...>A</w:t> </w:r>
//   [<w:proofErr ...>/]*
//   <w:r ...> <w:rPr>RPR_B</w:rPr> <w:t ...>B</w:t> </w:r>
// into a single run containing `merged` (text). The replacement uses
// RPR_A as the run formatting. Returns { xml, replaced } across all
// non-overlapping matches.
function collapseTwoRuns(xml, textA, textB, merged) {
  const a = escapeRegex(textA);
  const b = escapeRegex(textB);
  // Limit the [\\s\\S] runs to at most 600 chars to avoid catastrophic
  // backtracking and to localise matches.
  const re = new RegExp(
    `<w:r\\b[^>]*>([\\s\\S]{0,600}?)<w:t(?:\\s[^>]*)?>${a}</w:t>\\s*</w:r>` +
      `(?:\\s*<w:proofErr[^>]*/>|\\s*<w:bookmarkStart[^>]*/>|\\s*<w:bookmarkEnd[^>]*/>)*` +
      `\\s*<w:r\\b[^>]*>[\\s\\S]{0,600}?<w:t(?:\\s[^>]*)?>${b}</w:t>\\s*</w:r>`,
    "g",
  );
  let replaced = 0;
  const next = xml.replace(re, (full, rPrInnerA) => {
    replaced += 1;
    const rPrMatch = rPrInnerA.match(/<w:rPr>[\s\S]*?<\/w:rPr>/);
    const rPr = rPrMatch ? rPrMatch[0] : "";
    return `<w:r>${rPr}<w:t xml:space="preserve">${escapeXml(merged)}</w:t></w:r>`;
  });
  return { xml: next, replaced };
}

// Collapse 4 adjacent runs in one pass.
function collapseFourRuns(xml, textA, textB, textC, textD, merged) {
  const [a, b, c, d] = [textA, textB, textC, textD].map(escapeRegex);
  const re = new RegExp(
    `<w:r\\b[^>]*>([\\s\\S]{0,600}?)<w:t(?:\\s[^>]*)?>${a}</w:t>\\s*</w:r>` +
      `(?:\\s*<w:proofErr[^>]*/>|\\s*<w:bookmarkStart[^>]*/>|\\s*<w:bookmarkEnd[^>]*/>)*` +
      `\\s*<w:r\\b[^>]*>[\\s\\S]{0,600}?<w:t(?:\\s[^>]*)?>${b}</w:t>\\s*</w:r>` +
      `(?:\\s*<w:proofErr[^>]*/>|\\s*<w:bookmarkStart[^>]*/>|\\s*<w:bookmarkEnd[^>]*/>)*` +
      `\\s*<w:r\\b[^>]*>[\\s\\S]{0,600}?<w:t(?:\\s[^>]*)?>${c}</w:t>\\s*</w:r>` +
      `(?:\\s*<w:proofErr[^>]*/>|\\s*<w:bookmarkStart[^>]*/>|\\s*<w:bookmarkEnd[^>]*/>)*` +
      `\\s*<w:r\\b[^>]*>[\\s\\S]{0,600}?<w:t(?:\\s[^>]*)?>${d}</w:t>\\s*</w:r>`,
    "g",
  );
  let replaced = 0;
  const next = xml.replace(re, (full, rPrInnerA) => {
    replaced += 1;
    const rPrMatch = rPrInnerA.match(/<w:rPr>[\s\S]*?<\/w:rPr>/);
    const rPr = rPrMatch ? rPrMatch[0] : "";
    return `<w:r>${rPr}<w:t xml:space="preserve">${escapeXml(merged)}</w:t></w:r>`;
  });
  return { xml: next, replaced };
}

function main() {
  const src = findSourceDocx();
  console.log(`Source: ${src}`);
  const buf = fs.readFileSync(src);
  const zip = new PizZip(buf);
  let doc = zip.file("word/document.xml").asText();
  const lenBefore = doc.length;

  // 1. Collapse Word's spell-check splits BEFORE any text replacement.
  //
  //   "Балян" + "  Л.Н."  →  "{customer.directorName}"  (×2)
  //   "Алматы" + " 202" + "6" + " г."  →  "{city} {reportYear} г."  (×2)
  //   "Алматы 2020" + " г."  →  "{city} {archiveYear} г."  (×2)
  //   "ТОО " + "«Центр ... труда»"  →  "{performer.organization}"  (×2)
  const collapses = [
    {
      fn: () => collapseTwoRuns(doc, "Балян", "  Л.Н.", "{customer.directorName}"),
      label: "Балян +   Л.Н.  →  {customer.directorName}",
    },
    {
      fn: () =>
        collapseFourRuns(doc, "Алматы", " 202", "6", " г.", "{city} {reportYear} г."),
      label: "Алматы +  202 + 6 +  г.  →  {city} {reportYear} г.",
    },
    {
      fn: () =>
        collapseTwoRuns(doc, "Алматы 2020", " г.", "{city} {archiveYear} г."),
      label: "Алматы 2020 +  г.  →  {city} {archiveYear} г.",
    },
    {
      fn: () =>
        collapseTwoRuns(
          doc,
          "ТОО ",
          "«Центр экспертной оценки условий труда»",
          "{performer.organization}",
        ),
      label: "ТОО  + «Центр…»  →  {performer.organization}",
    },
  ];
  for (const c of collapses) {
    const out = c.fn();
    doc = out.xml;
    console.log(`collapse ${c.label}: ${out.replaced} occurrence(s)`);
    if (out.replaced === 0) {
      throw new Error(`Expected at least 1 collapse for: ${c.label}`);
    }
  }

  // 2. Whole-run replacements for tokens that already live in their own
  //    single run.
  const singleRunOps = [
    {
      exact: "ТОО  «KazEcoFood»",
      replacement: "{customer.organization}",
      expectedMin: 4,
    },
    {
      exact: "Дьяченко В. Г.",
      replacement: "{performer.directorName}",
      expectedMin: 2,
    },
    {
      exact: "Генеральный директор",
      replacement: "{performer.directorPosition}",
      expectedMin: 2,
    },
  ];
  for (const op of singleRunOps) {
    const out = replaceWholeRun(doc, op.exact, op.replacement);
    doc = out.xml;
    console.log(`replace ${op.exact}  →  ${op.replacement}: ${out.replaced} run(s)`);
    if (out.replaced < op.expectedMin) {
      throw new Error(
        `Expected ≥${op.expectedMin} replacements for "${op.exact}", got ${out.replaced}`,
      );
    }
  }

  // 3. Sanity check: no source literals remain.
  const forbidden = [
    "KazEcoFood",
    "Балян",
    "Дьяченко",
    "Генеральный директор",
    "Алматы",
    "«Центр экспертной оценки",
  ];
  for (const lit of forbidden) {
    if (doc.includes(lit)) {
      console.warn(`  WARN: source literal still present in template: "${lit}"`);
    }
  }

  console.log(
    `document.xml: ${lenBefore} → ${doc.length} bytes (Δ ${doc.length - lenBefore})`,
  );

  // 4. Write the modified document back.
  zip.file("word/document.xml", doc);
  const outDir = path.dirname(OUT_DOCX);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outBuf = zip.generate({ type: "nodebuffer" });
  fs.writeFileSync(OUT_DOCX, outBuf);
  console.log(`Wrote: ${OUT_DOCX} (${outBuf.length} bytes)`);
}

main();
