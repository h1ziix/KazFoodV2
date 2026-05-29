// Quick smoke test that the production buildTemplateContext from
// src/lib/generateSizDocx.ts produces a context that renders cleanly
// against the actual published template and that both row layouts
// appear when example data contains admin (merged) + production
// (split) sections. Mirrors the imports/transpilation that Next would
// do via tsx — we use a small inline shim because tsx is not in the
// repo: just re-implement isMergedRow + map locally.
import { readFileSync, writeFileSync } from "node:fs";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TPL = resolve(ROOT, "public/templates/siz-protocol.docx");
const OUT = resolve(ROOT, "test-siz-example-output.docx");

const EMPTY_FACT_RE = /^\s*[-\u2013\u2014]?\s*$/;
const isMerged = (r) =>
  EMPTY_FACT_RE.test(r.issuedFact) && EMPTY_FACT_RE.test(r.certificate);

function flatten(v, prefix = "", out = {}) {
  if (v === null || typeof v !== "object" || Array.isArray(v)) {
    if (prefix) out[prefix] = v;
    return out;
  }
  for (const [k, vv] of Object.entries(v)) {
    const nk = prefix ? `${prefix}.${k}` : k;
    if (vv !== null && typeof vv === "object" && !Array.isArray(vv))
      flatten(vv, nk, out);
    else out[nk] = vv;
  }
  return out;
}

function build(data) {
  const flat = flatten({
    protocol: data.protocol,
    customer: data.customer,
    measurementDate: data.measurementDate,
    performer: data.performer,
    representative: data.representative,
  });
  flat.measurementPlace = data.measurementPlace;
  return {
    ...flat,
    sections: data.sections.map((s) => {
      const t = s.title.trim();
      return {
        section_header: /^\d+\.\s*/.test(t) ? t : `${s.number}. ${t}`,
        rows: s.rows.map((r) => {
          const m = isMerged(r);
          return { ...r, isMerged: m, isSplit: !m };
        }),
      };
    }),
  };
}

const ADMIN_NORM =
  '- не предусмотрено, согласно «Нормам выдачи специальной одежды и других средств индивидуальной защиты работникам организаций различных видов экономической деятельности», утвержденных Приказом Министра здравоохранения и социального развития РК от 8 декабря 2015 года № 943';

const sizExample = {
  protocol: { number: "1" },
  customer: { name: "ТОО «KazEcoFood»", address: "addr" },
  measurementPlace: "place",
  measurementDate: { day: "10", month: "апреля", year: "2026" },
  sections: [
    {
      number: 1,
      title: "1. Администрация – 3 рабочих мест",
      rows: [
        { code: "01 001 001", position: "Директор", count: 1, normItems: ADMIN_NORM, issuedFact: "-", certificate: "-", assessment: "-", note: "-" },
        { code: "01 001 002", position: "Бухгалтер", count: 1, normItems: ADMIN_NORM, issuedFact: "-", certificate: "-", assessment: "-", note: "-" },
      ],
    },
    {
      number: 2,
      title: "2. Производственный персонал",
      rows: [
        { code: "01 002 001", position: "Технолог", count: 1, normItems: "Жилет, Рубашка", issuedFact: "Да", certificate: "В наличии", assessment: "Обеспечен", note: "-" },
        { code: "01 002 002", position: "Грузчик", count: 1, normItems: "Куртка", issuedFact: "Да", certificate: "В наличии", assessment: "Обеспечен", note: "-" },
      ],
    },
  ],
  performer: { fullName: "Исаева А.В.", position: "Старший" },
  representative: { fullName: "Богачев А.И.", position: "Нач." },
};

const tpl = readFileSync(TPL);
const doc = new Docxtemplater(new PizZip(tpl), { paragraphLoop: true, linebreaks: true });
doc.render(build(sizExample));
const out = doc.getZip().generate({ type: "nodebuffer" });
writeFileSync(OUT, out);

// Verification
const xml = new PizZip(out).file("word/document.xml").asText();
function check(label, cond) {
  if (!cond) { console.error("FAIL:", label); process.exit(1); }
  console.log("OK:", label);
}
check("admin code 01 001 001 present", xml.includes("01 001 001"));
check("admin code 01 001 002 present", xml.includes("01 001 002"));
check("prod code 01 002 001 present", xml.includes("01 002 001"));
check("admin norm text present", xml.includes("не предусмотрено"));
check("prod material present", xml.includes("Жилет"));
check("prod fact 'Да' present", xml.includes(">Да<"));
check("prod cert 'В наличии' present", xml.includes("В наличии"));
check("no leftover {-w:tr", !xml.includes("{-w:tr"));
check("no leftover {#rows", !xml.includes("{#rows"));
check("no leftover isMerged}", !xml.includes("isMerged}"));
check("no leftover isSplit}", !xml.includes("isSplit}"));

// Count gridSpan=3 cells — admin rows contribute 1 each (2), plus the
// column-header row of the original table also has gridSpan=3 cells
// that survive verbatim (1 in our template). So we expect >= 2.
const gs3 = (xml.match(/<w:gridSpan w:val="3"\/>/g) || []).length;
check(`gridSpan=3 occurrences >= 2 admin rows (got ${gs3})`, gs3 >= 2);

// Find the cell containing the admin norm text — must have gridSpan=3
const idx = xml.indexOf("не предусмотрено");
const tcStart = xml.lastIndexOf("<w:tc>", idx);
const tcEnd = xml.indexOf("</w:tc>", idx);
const tcXml = xml.slice(tcStart, tcEnd);
check("admin norm cell has gridSpan=3", tcXml.includes('<w:gridSpan w:val="3"/>'));

// Find prod cert cell — must NOT have gridSpan
const ci = xml.indexOf("В наличии");
const cs = xml.lastIndexOf("<w:tc>", ci);
const ce = xml.indexOf("</w:tc>", ci);
const cell = xml.slice(cs, ce);
check("prod cert cell has NO gridSpan", !cell.includes("<w:gridSpan"));

console.log("\n✅ end-to-end example data renders correctly. Wrote", OUT);
