// Build intro-protocol.docx template from source DOCX (file №2 "Введение").
//
// The intro document is a long bilingual (kk-KZ + ru-RU) narrative with
// fixed boilerplate and a small set of variable scalars:
//   - customer (name / city / address)
//   - measurement date (day / month / year)
//   - workplace count + male/female counts
//   - performer organization / address / accreditation (number + dates)
//   - heaviness & tension class counts (c1/c2/c31)
//   - final safety class label
//
// The source's variable spans are heavily fragmented across <w:t> runs by
// Word's spell checker / merge field artefacts (e.g. each digit of "55"
// lives in its own run). Instead of trying to merge dozens of digit runs
// in-place, we rewrite the few affected paragraphs whole-cloth, addressed
// by their stable w:paraId. Boilerplate paragraphs are left untouched.
//
// For the bare customer.name (literal "KazEcoFood") and customer.city
// ("Алматы") tokens — which each occur ~10× across boilerplate prose —
// we use the same single-run replacement helper as the cover script.
//
// Usage: node scripts/build-intro-template.js

const fs = require("node:fs");
const path = require("node:path");
const PizZip = require("pizzip");

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

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeXml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Replace every <w:t ...>EXACT</w:t> with a single <w:t> carrying newText.
function replaceWholeRun(xml, exactText, newText) {
  const re = new RegExp(
    `<w:t(?:\\s[^>]*)?>${escapeRegex(exactText)}</w:t>`,
    "g",
  );
  let replaced = 0;
  const next = xml.replace(re, () => {
    replaced += 1;
    return `<w:t xml:space="preserve">${escapeXml(newText)}</w:t>`;
  });
  return { xml: next, replaced };
}

// Replace the entire <w:p w14:paraId="{paraId}" ...>…</w:p> with the
// SAME outer paragraph element (preserving paraId, rsids, styling and any
// existing <w:pPr>) but with the run content replaced by `innerRunsXml`.
// Throws if the paragraph is not found exactly once.
function rewriteParagraph(xml, paraId, innerRunsXml) {
  const re = new RegExp(
    `<w:p\\b([^>]*\\sw14:paraId="${paraId}"[^>]*)>([\\s\\S]*?)</w:p>`,
    "g",
  );
  const matches = [...xml.matchAll(re)];
  if (matches.length === 0) {
    throw new Error(`paragraph paraId=${paraId} not found`);
  }
  if (matches.length > 1) {
    throw new Error(
      `paragraph paraId=${paraId} matched ${matches.length}× (expected exactly 1)`,
    );
  }
  const m = matches[0];
  const attrs = m[1];
  const inner = m[2];
  const pPrMatch = inner.match(/<w:pPr>[\s\S]*?<\/w:pPr>/);
  const pPr = pPrMatch ? pPrMatch[0] : "";
  const replacement = `<w:p${attrs}>${pPr}${innerRunsXml}</w:p>`;
  return xml.slice(0, m.index) + replacement + xml.slice(m.index + m[0].length);
}

// Helpers to compose run XML.
const SZ28 = `<w:rPr><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr>`;
const SZ28_KK = `<w:rPr><w:sz w:val="28"/><w:szCs w:val="28"/><w:lang w:val="kk-KZ"/></w:rPr>`;
const SZ28_BOLD = `<w:rPr><w:b/><w:bCs/><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr>`;
const SZ28_ITAL = `<w:rPr><w:i/><w:iCs/><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr>`;
const SZ28_BU = `<w:rPr><w:b/><w:bCs/><w:sz w:val="28"/><w:szCs w:val="28"/><w:u w:val="single"/></w:rPr>`;
const SZ28_BIU = `<w:rPr><w:b/><w:bCs/><w:i/><w:iCs/><w:sz w:val="28"/><w:szCs w:val="28"/><w:u w:val="single"/></w:rPr>`;

// Build a single <w:r> with rPr and text (text is taken verbatim — caller
// is responsible for embedding `{placeholders}` and escaping XML metas).
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

  // 1. Paragraph-level rewrites, addressed by stable w:paraId.
  //    Each rewrite collapses the fragmented runs into a clean run sequence
  //    that embeds docxtemplater placeholders.
  const paragraphOps = [
    // 57 — Kazakh accreditation sentence ("…№KZ.T.02.Е 1210 2022 жылғы
    // 25 шілденаң аккредиттеу аттестаты.")
    {
      paraId: "6373B7C3",
      label: "kk accreditation",
      build: () =>
        run(
          SZ28_KK,
          "        «Еңбек жағдайын сараптамалық бағалау орталығы» ЖШС-нің жұмыс орындарын еңбек жағдайлары бойынша аттестаттау жұмыстарын жүргізуге келесі құқықтарымен дәлелденеді: «Еңбек жағдайын сараптамалық бағалау орталығы» ЖШС-нің Жарғысы, заңды тұлғаны мемлекеттік тіркеу туралы куәлігі және №{performer.accreditation.number} {performer.accreditation.dateKk} аккредиттеу аттестаты.",
        ),
    },

    // 64 — Russian accreditation sentence
    {
      paraId: "16FB90BA",
      label: "ru accreditation",
      build: () =>
        run(
          SZ28,
          "Право {performer.organization} на проведение работ по аттестации рабочих мест по условиям труда подтверждается: Уставом {performer.organization} и свидетельством о государственной регистрации юридического лица, аттестатом аккредитации лаборатории № {performer.accreditation.number} от {performer.accreditation.dateRu}.",
        ),
    },

    // 58 — Kazakh lab address ("Зертхана мекенжайы: …")
    //    The source verbatim opens with «Зертхананың мекенжайы:» but the
    //    text is irretrievably garbled by mojibake-grade encoding in the
    //    source XML, so we rebuild the prefix using the canonical Kazakh
    //    wording. Value comes from performer.addressKk.
    {
      paraId: "0C6AD052",
      label: "kk performer.address",
      build: () =>
        run(SZ28_KK, "Зертхананың мекенжайы: {performer.addressKk}."),
    },

    // 65 — Адрес испытательной лаборатории (Russian)
    {
      paraId: "01CC687F",
      label: "ru performer.address",
      build: () =>
        run(SZ28, "Адрес испытательной лаборатории: {performer.addressRu}"),
    },

    // 71 — Customer line: ТОО «{name}», {address}.
    //    The Kazakh prefix "Ұйымның толық заңды атауы" stays static
    //    (bold), the Russian gloss "(Полное юридическое название
    //    организации)" stays italic, then the value runs underlined-bold-
    //    italic to preserve the source emphasis.
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

    // 72 — Количество рабочих мест, подлежащих аттестации – N
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

    // 73 — Дата проведения аттестации
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

    // 190 — Количество работников ... мужчин ... женщин
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

    // 194 — Тяжесть c1
    {
      paraId: "1378B660",
      label: "heaviness c1",
      build: () =>
        run(
          SZ28,
          "I) класс условий труда (оптимальный 1) - {heavinessCounts.c1} сотрудников, занятых на {heavinessCounts.c1} рабочих местах.",
        ),
    },
    // 195 — Тяжесть c2
    {
      paraId: "18F94942",
      label: "heaviness c2",
      build: () =>
        run(
          SZ28,
          "II) класс условий труда (допустимый 2) - {heavinessCounts.c2} сотрудников, занятых на {heavinessCounts.c2} рабочих местах.",
        ),
    },
    // 196 — Тяжесть c31
    {
      paraId: "2E7C2E49",
      label: "heaviness c31",
      build: () =>
        run(
          SZ28,
          "III) класс условий труда (вредный 3.1) - {heavinessCounts.c31} сотрудников, занятых на {heavinessCounts.c31} рабочих местах.",
        ),
    },
    // 199 — Напряженность c1
    {
      paraId: "3FFCCFC6",
      label: "tension c1",
      build: () =>
        run(
          SZ28,
          "I) класс условий труда (оптимальный 1) - {tensionCounts.c1} сотрудников, занятых на {tensionCounts.c1} рабочих местах.",
        ),
    },
    // 200 — Напряженность c2
    {
      paraId: "2962FA33",
      label: "tension c2",
      build: () =>
        run(
          SZ28,
          "II) класс условий труда (допустимый 2) - {tensionCounts.c2} сотрудников, занятых на {tensionCounts.c2} рабочих местах.",
        ),
    },
    // 201 — Напряженность c31
    {
      paraId: "55254F2B",
      label: "tension c31",
      build: () =>
        run(
          SZ28,
          "III) класс условий труда (вредный 3.1) - {tensionCounts.c31} сотрудников, занятых на {tensionCounts.c31} рабочих местах.",
        ),
    },

    // 204 — Большинство рабочих мест ... отнесены к классу ({label}).
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
    doc = rewriteParagraph(doc, op.paraId, op.build());
    console.log(`rewrote para ${op.paraId} (${op.label})`);
  }

  // 2. Whole-run replacements for the bare customer.name token that
  //    occurs in many boilerplate sentences as its own single <w:t> run.
  //    Same for the bare city "Алматы".
  const singleRunOps = [
    {
      exact: "KazEcoFood",
      replacement: "{customer.name}",
      expectedMin: 5,
    },
    {
      exact: "Алматы",
      replacement: "{customer.city}",
      expectedMin: 5,
    },
  ];
  for (const op of singleRunOps) {
    const out = replaceWholeRun(doc, op.exact, op.replacement);
    doc = out.xml;
    console.log(
      `replace ${op.exact}  →  ${op.replacement}: ${out.replaced} run(s)`,
    );
    if (out.replaced < op.expectedMin) {
      throw new Error(
        `Expected ≥${op.expectedMin} replacements for "${op.exact}", got ${out.replaced}`,
      );
    }
  }

  // 3. Sanity: scan for any remaining source-specific literals that the
  //    user would NOT want to leak through unparameterized. These are
  //    only warnings since most of the boilerplate intentionally stays
  //    static. Note: "Кааганда" appears once in a standalone Kazakh
  //    boilerplate paragraph (a typo in the source: it reads "Каагандағы"
  //    where context implies Almaty); leaving it static is acceptable
  //    for the current minimal-scalar scope and avoids parameterising a
  //    Kazakh-declined city form.
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
