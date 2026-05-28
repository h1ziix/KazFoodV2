// scripts/build-intro-template.js
//
// Build intro-protocol.docx from the source DOCX (file №2 "Введение") by
// injecting docxtemplater placeholders.
//
// FIDELITY POSTURE:
//
//   * For tokens that already live in a single <w:t> node (the bare
//     "KazEcoFood" customer name and the bare "Алматы" city scattered
//     across boilerplate prose) we use scripts/lib/safe-injector's
//     replaceTextNodeOnly(). Surrounding XML is byte-identical.
//
//   * For a small, hand-picked set of paragraphs that bind multi-field
//     bilingual sentences (accreditation, lab address, workplace/male/
//     female counts, heaviness/tension class counts, final safety
//     class), we rewrite the inner runs of the paragraph via
//     scripts/lib/paragraph-rewriter's replaceParagraphInner(). The
//     outer <w:p>, its <w:pPr> and any <w:bookmark*> siblings are
//     preserved verbatim. This is a documented fidelity exception —
//     see paragraph-rewriter.js for why the safe injectors cannot work
//     on those paragraphs (heavy run fragmentation + non-roundtrippable
//     <w:t> bodies in the source).
//
// Every paragraph NOT listed below remains byte-identical between the
// source DOCX and the generated template (verify with
// `node scripts/verify-docx-fidelity.js intro`).
//
// Usage: node scripts/build-intro-template.js

"use strict";

const fs = require("node:fs");
const path = require("node:path");
const PizZip = require("pizzip");
const { replaceTextNodeOnly } = require("./lib/safe-injector");
const { replaceParagraphInner } = require("./lib/paragraph-rewriter");

const ROOT = path.resolve(__dirname, "..");

function findSourceDocx() {
  const entries = fs.readdirSync(ROOT);
  const match = entries.find((f) => /^2\..*\.docx$/i.test(f));
  if (!match) {
    throw new Error("Source intro DOCX (2.*.docx) not found in project root");
  }
  return path.join(ROOT, match);
}

const OUT_DOCX = path.join(
  ROOT,
  "public",
  "templates",
  "intro-protocol.docx",
);

// ----- Run-composition helpers (used only for paragraphs we rewrite) ------
const SZ28 = `<w:rPr><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr>`;
const SZ28_KK = `<w:rPr><w:sz w:val="28"/><w:szCs w:val="28"/><w:lang w:val="kk-KZ"/></w:rPr>`;
const SZ28_BOLD = `<w:rPr><w:b/><w:bCs/><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr>`;
const SZ28_ITAL = `<w:rPr><w:i/><w:iCs/><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr>`;
const SZ28_BU = `<w:rPr><w:b/><w:bCs/><w:sz w:val="28"/><w:szCs w:val="28"/><w:u w:val="single"/></w:rPr>`;
const SZ28_BIU = `<w:rPr><w:b/><w:bCs/><w:i/><w:iCs/><w:sz w:val="28"/><w:szCs w:val="28"/><w:u w:val="single"/></w:rPr>`;

// Compose a single <w:r> with the given <w:rPr> and verbatim text body.
// The caller embeds `{placeholders}` directly and is responsible for any
// XML escaping of literal '&', '<', '>'.
function run(rPr, text) {
  return `<w:r>${rPr}<w:t xml:space="preserve">${text}</w:t></w:r>`;
}

function main() {
  const src = findSourceDocx();
  console.log(`Source: ${src}`);
  const buf = fs.readFileSync(src);
  const zip = new PizZip(buf);
  let doc = zip.file("word/document.xml").asText();
  const lenBefore = doc.length;

  // (1) Documented paragraph-inner rewrites for paragraphs that cannot be
  //     parameterised with text-only injection (see file docblock).
  //     IMPORTANT: do NOT add new entries here without first checking
  //     whether replaceTextNodeOnly / spliceAdjacentTextNodes can do the
  //     job. Every entry here is a fidelity exception.
  const paragraphOps = [
    {
      paraId: "6373B7C3",
      label: "kk accreditation",
      build: () =>
        run(
          SZ28_KK,
          "        «Еңбек жағдайын сараптамалық бағалау орталығы» ЖШС-нің жұмыс орындарын еңбек жағдайлары бойынша аттестаттау жұмыстарын жүргізуге келесі құқықтарымен дәлелденеді: «Еңбек жағдайын сараптамалық бағалау орталығы» ЖШС-нің Жарғысы, заңды тұлғаны мемлекеттік тіркеу туралы куәлігі және №{performer.accreditation.number} {performer.accreditation.dateKk} аккредиттеу аттестаты.",
        ),
    },
    {
      paraId: "16FB90BA",
      label: "ru accreditation",
      build: () =>
        run(
          SZ28,
          "Право {performer.organization} на проведение работ по аттестации рабочих мест по условиям труда подтверждается: Уставом {performer.organization} и свидетельством о государственной регистрации юридического лица, аттестатом аккредитации лаборатории № {performer.accreditation.number} от {performer.accreditation.dateRu}.",
        ),
    },
    {
      paraId: "0C6AD052",
      label: "kk performer.address",
      build: () =>
        run(SZ28_KK, "Зертхананың мекенжайы: {performer.addressKk}."),
    },
    {
      paraId: "01CC687F",
      label: "ru performer.address",
      build: () =>
        run(SZ28, "Адрес испытательной лаборатории: {performer.addressRu}"),
    },
    {
      paraId: "5B953EEF",
      label: "customer org + address",
      build: () =>
        run(SZ28_BOLD, "Ұйымның толық заңды атауы") +
        run(SZ28, " ") +
        run(SZ28_ITAL, "(Полное юридическое название организации)") +
        run(SZ28, ": ") +
        run(SZ28_BIU, "ТОО «{customer.name}», {customer.address}"),
    },
    {
      paraId: "15A64610",
      label: "workplaceCount line",
      build: () =>
        run(SZ28_BOLD, "Аттестаттауға жататын жұмыс орындарының саны") +
        run(SZ28, " ") +
        run(SZ28_ITAL, "(Количество рабочих мест, подлежащих аттестации)") +
        run(SZ28, " - ") +
        run(SZ28_BU, "{workplaceCount}") +
        run(SZ28, ":"),
    },
    {
      paraId: "2613A18B",
      label: "measurement date",
      build: () =>
        run(SZ28_BOLD, "Аттестаттау куні") +
        run(SZ28, " ") +
        run(SZ28_ITAL, "(Дата проведения аттестации/оценки)") +
        run(SZ28, " - ") +
        run(
          SZ28_BIU,
          "«{measurementDate.day}» {measurementDate.month} {measurementDate.year} г.",
        ),
    },
    {
      paraId: "0221DEB0",
      label: "worker / male / female counts",
      build: () =>
        run(SZ28, "Количество работников, подлежащих аттестации - ") +
        run(SZ28_BU, "{workplaceCount}") +
        run(SZ28, ", из них мужчин - ") +
        run(SZ28_BU, "{maleCount}") +
        run(SZ28, ", женщин - ") +
        run(SZ28_BU, "{femaleCount}") +
        run(SZ28, "."),
    },
    {
      paraId: "1378B660",
      label: "heaviness c1",
      build: () =>
        run(
          SZ28,
          "I) класс условий труда (оптимальный 1) - {heavinessCounts.c1} сотрудников, занятых на {heavinessCounts.c1} рабочих местах.",
        ),
    },
    {
      paraId: "18F94942",
      label: "heaviness c2",
      build: () =>
        run(
          SZ28,
          "II) класс условий труда (допустимый 2) - {heavinessCounts.c2} сотрудников, занятых на {heavinessCounts.c2} рабочих местах.",
        ),
    },
    {
      paraId: "2E7C2E49",
      label: "heaviness c31",
      build: () =>
        run(
          SZ28,
          "III) класс условий труда (вредный 3.1) - {heavinessCounts.c31} сотрудников, занятых на {heavinessCounts.c31} рабочих местах.",
        ),
    },
    {
      paraId: "3FFCCFC6",
      label: "tension c1",
      build: () =>
        run(
          SZ28,
          "I) класс условий труда (оптимальный 1) - {tensionCounts.c1} сотрудников, занятых на {tensionCounts.c1} рабочих местах.",
        ),
    },
    {
      paraId: "2962FA33",
      label: "tension c2",
      build: () =>
        run(
          SZ28,
          "II) класс условий труда (допустимый 2) - {tensionCounts.c2} сотрудников, занятых на {tensionCounts.c2} рабочих местах.",
        ),
    },
    {
      paraId: "55254F2B",
      label: "tension c31",
      build: () =>
        run(
          SZ28,
          "III) класс условий труда (вредный 3.1) - {tensionCounts.c31} сотрудников, занятых на {tensionCounts.c31} рабочих местах.",
        ),
    },
    {
      paraId: "17663A32",
      label: "safety class label",
      build: () =>
        run(
          SZ28,
          "Большинство рабочих мест по условиям труда отнесены к классу ({safetyClassLabel}).",
        ),
    },
  ];

  for (const op of paragraphOps) {
    doc = replaceParagraphInner(doc, op.paraId, op.build());
    console.log(`paragraph ${op.paraId} (${op.label})`);
  }

  // (2) Safe text-only replacements for bare tokens.
  //     These tokens already live in their own single <w:t> nodes
  //     throughout the boilerplate, so we never touch surrounding XML.
  const textOps = [
    {
      exact: "KazEcoFood",
      placeholder: "{customer.name}",
      requireMin: 5,
    },
    {
      exact: "Алматы",
      placeholder: "{customer.city}",
      requireMin: 5,
    },
  ];
  for (const op of textOps) {
    const out = replaceTextNodeOnly(doc, op.exact, op.placeholder, {
      requireMin: op.requireMin,
    });
    doc = out.xml;
    console.log(
      `text     "${op.exact}" → ${op.placeholder}: ${out.replaced}`,
    );
  }

  // (3) Soft sanity scan for any remaining source-specific literals.
  //     These are warnings only — much of the bilingual boilerplate is
  //     intentionally static (see the original script comments for the
  //     "Кааганда" note).
  const forbidden = [
    "KazEcoFood",
    "Алманиская",
    "Карасайский",
    "Кокозек",
    "KZ.T.02",
  ];
  for (const lit of forbidden) {
    if (doc.includes(lit)) {
      console.warn(
        `  WARN: source literal still present in template: "${lit}"`,
      );
    }
  }

  console.log(
    `document.xml: ${lenBefore} → ${doc.length} bytes (Δ ${doc.length - lenBefore})`,
  );

  zip.file("word/document.xml", doc);
  const outDir = path.dirname(OUT_DOCX);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outBuf = zip.generate({ type: "nodebuffer" });
  fs.writeFileSync(OUT_DOCX, outBuf);
  console.log(`Wrote: ${OUT_DOCX} (${outBuf.length} bytes)`);
}

main();
