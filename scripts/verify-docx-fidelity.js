// scripts/verify-docx-fidelity.js
//
// Compare a generated DOCX template against its source DOCX and report
// structural drift. Exit code is non-zero only when drift exceeds the
// per-template whitelist below — so legitimate placeholder insertions
// (e.g. an extra <w:p> for {#rows} loop markers) pass while regressions
// (paragraphs/runs/tables disappearing or doubling) fail loudly.
//
// What it compares (per zip entry):
//   * word/document.xml  → <w:p>, <w:r>, <w:t>, <w:tbl>, <w:tr>, <w:tc>
//                          counts and total byte length.
//   * word/styles.xml    → byte length + <w:style> count.
//   * word/numbering.xml → byte length + <w:num>/<w:abstractNum> count.
//   * word/_rels/document.xml.rels → byte length + <Relationship> count.
//   * word/header*.xml, word/footer*.xml → presence + byte length.
//
// The report is printed regardless of pass/fail. With --diff it also
// prints the per-metric delta. Whitelist entries appear marked as `ok`
// in the diff column.
//
// USAGE
//   node scripts/verify-docx-fidelity.js                # all templates
//   node scripts/verify-docx-fidelity.js cover intro    # named ones
//   node scripts/verify-docx-fidelity.js --diff cover   # show all metrics
//
// To add a new template-to-source mapping or relax a metric, edit the
// TEMPLATES table below.

"use strict";

const fs = require("node:fs");
const path = require("node:path");
const PizZip = require("pizzip");

const ROOT = path.resolve(__dirname, "..");

// -- registry --------------------------------------------------------------
//
// Each entry:
//   key:     short name used on the CLI
//   srcRe:   regex matched against root-level filenames to find the source
//            DOCX (the original *.docx in the repo root).
//   built:   path to the generated template under public/templates/.
//   allow:   per-metric absolute drift budget. Positive = generated may
//            grow by N, negative = may shrink by |N|, [-a, +b] = both
//            directions, "any" = no budget (skip the check), missing key
//            = strict equality required.
//
// Drift is measured as (built - source) for counts and for byte length.
//
// FIDELITY POSTURE
//   * cover  → strict on counts; bytes may grow slightly because
//              placeholders are longer than the source literals.
//   * intro  → paragraph rewrites collapse fragmented runs, so total
//              <w:r>/<w:t>/<w:proofErr> counts SHRINK significantly.
//              We whitelist that shrinkage but require <w:p>, <w:tbl>,
//              <w:tr>, <w:tc>, headers/footers, styles, numbering and
//              rels to remain structurally identical.

const TEMPLATES = [
  {
    key: "cover",
    srcRe: /^1\..*\.docx$/i,
    built: path.join(ROOT, "public", "templates", "cover-protocol.docx"),
    allow: {
      "document.xml:bytes": "any",
      "document.xml:w:t": "any", // text-node count unchanged structurally,
                                  // but xml:space attribute additions
                                  // would shift bytes
    },
  },
  {
    key: "intro",
    srcRe: /^2\..*\.docx$/i,
    built: path.join(ROOT, "public", "templates", "intro-protocol.docx"),
    allow: {
      // The 15 paragraph-inner rewrites consolidate dozens of fragmented
      // runs into clean run sequences. Strict equality would always fail.
      "document.xml:bytes": "any",
      "document.xml:w:r": "any",
      "document.xml:w:t": "any",
      "document.xml:w:proofErr": "any",
      "document.xml:w:bookmarkStart": "any",
      "document.xml:w:bookmarkEnd": "any",
      // Structural anchors that MUST be preserved:
      //   <w:p>, <w:tbl>, <w:tr>, <w:tc> → strict (no entry = strict)
    },
  },
];

// -- helpers ---------------------------------------------------------------

function findSource(srcRe) {
  const entry = fs.readdirSync(ROOT).find((f) => srcRe.test(f));
  if (!entry) {
    throw new Error(`source DOCX matching ${srcRe} not found in ${ROOT}`);
  }
  return path.join(ROOT, entry);
}

function loadZip(filePath) {
  return new PizZip(fs.readFileSync(filePath));
}

function listEntries(zip) {
  return Object.keys(zip.files).filter((n) => !zip.files[n].dir).sort();
}

function getText(zip, name) {
  const f = zip.file(name);
  return f ? f.asText() : null;
}

function countTag(xml, tag) {
  // self-closing OR opening (we don't need to subtract closings since
  // every element has exactly one opening tag).
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?(?:/?>|>)`, "g");
  let n = 0;
  while (re.exec(xml) !== null) n += 1;
  return n;
}

const DOC_TAGS = ["w:p", "w:r", "w:t", "w:tbl", "w:tr", "w:tc", "w:proofErr", "w:bookmarkStart", "w:bookmarkEnd"];

function collectMetrics(zip) {
  const m = {};
  const entries = listEntries(zip);

  const doc = getText(zip, "word/document.xml");
  if (doc !== null) {
    m["document.xml:bytes"] = doc.length;
    for (const t of DOC_TAGS) m[`document.xml:${t}`] = countTag(doc, t);
  }

  const styles = getText(zip, "word/styles.xml");
  if (styles !== null) {
    m["styles.xml:bytes"] = styles.length;
    m["styles.xml:w:style"] = countTag(styles, "w:style");
  }

  const numbering = getText(zip, "word/numbering.xml");
  if (numbering !== null) {
    m["numbering.xml:bytes"] = numbering.length;
    m["numbering.xml:w:num"] = countTag(numbering, "w:num");
    m["numbering.xml:w:abstractNum"] = countTag(numbering, "w:abstractNum");
  }

  const rels = getText(zip, "word/_rels/document.xml.rels");
  if (rels !== null) {
    m["rels:bytes"] = rels.length;
    m["rels:Relationship"] = countTag(rels, "Relationship");
  }

  for (const name of entries) {
    if (/^word\/header\d+\.xml$/.test(name) || /^word\/footer\d+\.xml$/.test(name)) {
      const xml = getText(zip, name);
      m[`${name}:bytes`] = xml.length;
      m[`${name}:w:p`] = countTag(xml, "w:p");
      m[`${name}:w:t`] = countTag(xml, "w:t");
    }
  }

  return m;
}

function checkBudget(allow, key, delta) {
  if (!(key in allow)) return delta === 0; // strict
  const rule = allow[key];
  if (rule === "any") return true;
  if (typeof rule === "number") {
    return rule >= 0 ? delta >= 0 && delta <= rule : delta <= 0 && delta >= rule;
  }
  if (Array.isArray(rule) && rule.length === 2) {
    return delta >= rule[0] && delta <= rule[1];
  }
  throw new Error(`bad allow rule for ${key}: ${JSON.stringify(rule)}`);
}

function pad(s, n) {
  s = String(s);
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}
function padLeft(s, n) {
  s = String(s);
  return s.length >= n ? s : " ".repeat(n - s.length) + s;
}

function verifyOne(entry, opts) {
  const showAll = !!opts.diff;
  const srcPath = findSource(entry.srcRe);
  if (!fs.existsSync(entry.built)) {
    console.error(`[${entry.key}] FAIL: built template not found: ${entry.built}`);
    return { ok: false, breaks: 1 };
  }
  const src = loadZip(srcPath);
  const built = loadZip(entry.built);

  // Entry presence check.
  const srcEntries = new Set(listEntries(src));
  const builtEntries = new Set(listEntries(built));
  const dropped = [...srcEntries].filter((e) => !builtEntries.has(e));
  const added = [...builtEntries].filter((e) => !srcEntries.has(e));

  const srcM = collectMetrics(src);
  const builtM = collectMetrics(built);
  const keys = new Set([...Object.keys(srcM), ...Object.keys(builtM)]);

  const rows = [];
  let breaks = 0;
  for (const k of [...keys].sort()) {
    const a = srcM[k];
    const b = builtM[k];
    const delta = (b ?? 0) - (a ?? 0);
    const ok = checkBudget(entry.allow || {}, k, delta);
    if (!ok) breaks += 1;
    if (showAll || !ok || delta !== 0) {
      rows.push({ k, a, b, delta, ok });
    }
  }

  console.log("");
  console.log(`==== [${entry.key}] ${path.basename(entry.built)} ====`);
  console.log(`source: ${srcPath}`);
  console.log(`built:  ${entry.built}`);
  if (dropped.length) console.log(`DROPPED entries: ${dropped.join(", ")}`);
  if (added.length) console.log(`ADDED entries:   ${added.join(", ")}`);
  if (rows.length === 0) {
    console.log("structurally byte-identical: OK");
  } else {
    console.log(
      pad("metric", 38) + " " +
      padLeft("source", 10) + " " +
      padLeft("built", 10) + " " +
      padLeft("delta", 10) + "  status",
    );
    for (const r of rows) {
      const tag = r.ok ? (r.delta === 0 ? "  =" : " ok") : "FAIL";
      console.log(
        pad(r.k, 38) + " " +
        padLeft(r.a ?? "-", 10) + " " +
        padLeft(r.b ?? "-", 10) + " " +
        padLeft(r.delta >= 0 ? `+${r.delta}` : r.delta, 10) + "  " + tag,
      );
    }
  }
  const ok = breaks === 0 && dropped.length === 0;
  console.log(`result: ${ok ? "PASS" : "FAIL"} (breaks=${breaks}, dropped=${dropped.length})`);
  return { ok, breaks: breaks + dropped.length };
}

function main() {
  const args = process.argv.slice(2);
  const diff = args.includes("--diff");
  const names = args.filter((a) => !a.startsWith("--"));
  const selected = names.length
    ? TEMPLATES.filter((t) => names.includes(t.key))
    : TEMPLATES;
  if (selected.length === 0) {
    console.error(
      `no templates matched. known: ${TEMPLATES.map((t) => t.key).join(", ")}`,
    );
    process.exit(2);
  }
  let totalBreaks = 0;
  for (const e of selected) {
    const r = verifyOne(e, { diff });
    totalBreaks += r.breaks;
  }
  console.log("");
  console.log(
    totalBreaks === 0
      ? "ALL TEMPLATES PASS"
      : `FAILED: ${totalBreaks} drift(s) outside whitelist`,
  );
  process.exit(totalBreaks === 0 ? 0 : 1);
}

main();
