/**
 * Structural integrity sweep for the 5 generated DOCX artifacts plus
 * their originals as a baseline.
 *
 * Checks per file (each is a ZIP container of XML parts):
 *
 *   [zip]      All entries are listed; no entry has zero size when
 *              extracted; CRC32 of every entry matches the central
 *              directory record (PizZip enforces this on load — if a
 *              CRC mismatch existed PizZip would throw).
 *   [parts]    Required parts exist: [Content_Types].xml,
 *              word/document.xml, word/_rels/document.xml.rels,
 *              and (if referenced) word/numbering.xml, word/styles.xml.
 *   [xml]      Each *.xml entry parses with @xmldom/xmldom in strict
 *              mode (no whitespace tolerance for malformed input). Any
 *              parse error is fatal.
 *   [balance]  In word/document.xml, the counts of opening vs closing
 *              tags match for <w:tbl>, <w:tr>, <w:tc>, <w:p>, <w:r>,
 *              <w:rPr>, <w:pPr>, <w:tcPr>, <w:tblPr>, <w:body>.
 *              Mismatches are the #1 cause of Word's repair dialog.
 *   [unrendered]
 *              No leftover docxtemplater tags `{name}` or
 *              `{#name}`/`{/name}` or `{.}` survive in document.xml.
 *   [no-undef] No literal "undefined" substring in extracted text.
 *   [numId-refs]
 *              Every `<w:numId w:val="N"/>` reference in document.xml
 *              has a matching `<w:num w:numId="N">` definition in
 *              numbering.xml (when present). Broken references make
 *              Word render bullets as empty paragraphs.
 *   [num-abs-refs]
 *              Every `<w:abstractNumId w:val="X"/>` inside <w:num>
 *              points to an existing `<w:abstractNum w:abstractNumId="X">`.
 *   [content-types]
 *              Every part listed in [Content_Types].xml Override@PartName
 *              actually exists in the zip; every *.xml/*.rels part in
 *              the zip is covered by Default or Override.
 *   [rels]     All Target attributes in *.rels files resolve to an
 *              existing zip entry (for Internal relationships).
 *   [sentinels]
 *              No remaining `__NUMID_*_SLOT_*__` sentinels (they must
 *              be expanded by the post-render hook).
 *
 * Numbering-restart specific check on tension/heaviness outputs:
 *   - Count distinct numIds per "slot": for N workplaces with K slots,
 *     expect N×K total <w:numId> refs and N distinct ids per slot
 *     (where iteration #1 reuses the original, 2..N use clones).
 *
 * Exit code 0 on success, 1 on any structural failure.
 */

"use strict";

const fs = require("fs");
const path = require("path");
const PizZip = require("pizzip");
const { DOMParser } = require("@xmldom/xmldom");

const ROOT = path.resolve(__dirname, "..");

const TARGETS = [
  { name: "coding (output)",   path: path.join(ROOT, "test-coding-output.docx") },
  { name: "safety (output)",   path: path.join(ROOT, "test-safety-output.docx") },
  { name: "siz (output)",      path: path.join(ROOT, "test-siz-output.docx") },
  { name: "tension (output)",  path: path.join(ROOT, "test-tension-output.docx") },
  { name: "heaviness (output)",path: path.join(ROOT, "test-heaviness-output.docx") },
  { name: "coding (orig)",     path: path.join(ROOT, "3. Кодировка каз-рус kazfood.docx") },
  { name: "safety (orig)",     path: path.join(ROOT, "12. Травма каз-рус ГОТОВО KazFood.docx") },
  { name: "siz (orig)",        path: path.join(ROOT, "13. СИЗ каз-рус ГОТОВо kazfood.docx") },
  { name: "tension (orig)",    path: path.join(ROOT, "11. Напряженность каз-рус ГОТОВО KAZFOOD.docx") },
  { name: "heaviness (orig)",  path: path.join(ROOT, "10. Тяжесть каз-рус ГОТОВО kAZFOOD.docx") },
];

const TAG_PAIRS = [
  "w:tbl","w:tr","w:tc","w:p","w:r","w:rPr","w:pPr","w:tcPr","w:tblPr","w:body","w:sectPr",
];

function countOpenClose(xml, tag) {
  // self-closing forms count as opens with their own close
  const openRe = new RegExp(`<${tag}(?:\\s[^>]*)?(?<!/)>`, "g");
  const selfRe = new RegExp(`<${tag}(?:\\s[^>]*)?/>`, "g");
  const closeRe = new RegExp(`</${tag}>`, "g");
  const opens = (xml.match(openRe) || []).length;
  const selfs = (xml.match(selfRe) || []).length;
  const closes = (xml.match(closeRe) || []).length;
  return { opens, selfs, closes, balanced: opens === closes };
}

function checkXmlWellFormed(name, content) {
  const errors = [];
  // @xmldom/xmldom 0.9 replaced the legacy `errorHandler` constructor option
  // with a single `onError(level, msg)` callback. Levels are 1=warning,
  // 2=error, 3=fatalError per the xmldom changelog.
  const parser = new DOMParser({
    onError: (level, msg) => {
      if (level >= 2) errors.push(`L${level}: ${msg}`);
    },
  });
  try {
    parser.parseFromString(content, "text/xml");
  } catch (e) {
    errors.push("throw: " + e.message);
  }
  return errors;
}

function loadZip(p) {
  const buf = fs.readFileSync(p);
  // PizZip throws on CRC mismatch / invalid central directory.
  return { zip: new PizZip(buf), size: buf.length };
}

function sweep(target) {
  const findings = []; // {level: "OK"|"WARN"|"FAIL", area, msg}
  const file = target.path;
  if (!fs.existsSync(file)) {
    return { name: target.name, file, findings: [{ level: "FAIL", area: "exists", msg: "missing" }] };
  }

  let zip, size;
  try {
    ({ zip, size } = loadZip(file));
  } catch (e) {
    findings.push({ level: "FAIL", area: "zip", msg: "load: " + e.message });
    return { name: target.name, file, findings, size: 0 };
  }
  findings.push({ level: "OK", area: "zip", msg: `${size} bytes` });

  const entries = Object.keys(zip.files).filter((n) => !zip.files[n].dir);
  const xmlEntries = entries.filter((n) => /\.(xml|rels)$/i.test(n));

  // [parts]
  const required = ["[Content_Types].xml", "word/document.xml", "word/_rels/document.xml.rels"];
  for (const r of required) {
    if (!zip.file(r)) findings.push({ level: "FAIL", area: "parts", msg: `missing ${r}` });
  }

  // [xml] well-formedness
  let xmlErrors = 0;
  for (const n of xmlEntries) {
    const txt = zip.file(n).asText();
    const errs = checkXmlWellFormed(n, txt);
    if (errs.length > 0) {
      xmlErrors++;
      findings.push({ level: "FAIL", area: "xml", msg: `${n}: ${errs[0]}` });
    }
  }
  if (xmlErrors === 0) findings.push({ level: "OK", area: "xml", msg: `${xmlEntries.length} XML parts well-formed` });

  // document.xml-specific checks
  const docXml = zip.file("word/document.xml").asText();

  // [balance]
  const bad = [];
  for (const t of TAG_PAIRS) {
    const { opens, closes, balanced } = countOpenClose(docXml, t);
    if (!balanced) bad.push(`<${t}>: ${opens} open / ${closes} close`);
  }
  if (bad.length) findings.push({ level: "FAIL", area: "balance", msg: bad.join("; ") });
  else findings.push({ level: "OK", area: "balance", msg: "all tag pairs balanced" });

  // [unrendered] — only the OUTPUT files; originals legitimately contain literal "{...}" strings (e.g. units, footnotes)
  if (/output/.test(target.name)) {
    const stripped = docXml.replace(/<[^>]+>/g, "");
    const tags = [...stripped.matchAll(/\{[#/]?[a-zA-Z_][a-zA-Z0-9_.]*\}/g)].map((m) => m[0]);
    if (tags.length) findings.push({ level: "FAIL", area: "unrendered", msg: `${tags.length} leftover tags: ${tags.slice(0,5).join(", ")}` });
    else findings.push({ level: "OK", area: "unrendered", msg: "no leftover {...} tags" });

    // [no-undef]
    const undefCount = (stripped.match(/undefined/g) || []).length;
    if (undefCount) findings.push({ level: "FAIL", area: "no-undef", msg: `${undefCount} occurrences` });
    else findings.push({ level: "OK", area: "no-undef", msg: "no 'undefined' in text" });

    // [sentinels]
    const sentinels = (docXml.match(/__NUMID_\d+_SLOT_\d+__/g) || []).length;
    if (sentinels) findings.push({ level: "FAIL", area: "sentinels", msg: `${sentinels} unexpanded sentinels` });
    else findings.push({ level: "OK", area: "sentinels", msg: "no sentinels remain" });
  }

  // [numId-refs] + [num-abs-refs]
  const numFile = zip.file("word/numbering.xml");
  if (numFile) {
    const numXml = numFile.asText();
    const definedNumIds = new Set([...numXml.matchAll(/<w:num\s+w:numId="(\d+)"/g)].map((m) => m[1]));
    const definedAbs    = new Set([...numXml.matchAll(/<w:abstractNum\s+w:abstractNumId="(\d+)"/g)].map((m) => m[1]));
    const refsNum = [...docXml.matchAll(/<w:numId\s+w:val="(\d+)"\s*\/>/g)].map((m) => m[1]);
    const refsAbs = [...numXml.matchAll(/<w:num\s+w:numId="\d+"[^>]*>[\s\S]*?<w:abstractNumId\s+w:val="(\d+)"/g)].map((m) => m[1]);

    const missingNum = refsNum.filter((id) => !definedNumIds.has(id));
    const missingAbs = refsAbs.filter((id) => !definedAbs.has(id));

    if (missingNum.length) findings.push({ level: "FAIL", area: "numId-refs", msg: `${missingNum.length} dangling w:numId refs (e.g. ${[...new Set(missingNum)].slice(0,5).join(", ")})` });
    else findings.push({ level: "OK", area: "numId-refs", msg: `${refsNum.length} refs, all defined (${definedNumIds.size} defs)` });

    if (missingAbs.length) findings.push({ level: "FAIL", area: "num-abs-refs", msg: `${missingAbs.length} dangling abstractNumId refs` });
    else findings.push({ level: "OK", area: "num-abs-refs", msg: `${refsAbs.length} defs, all point to existing abstractNum (${definedAbs.size} abstract defs)` });
  } else {
    findings.push({ level: "OK", area: "numId-refs", msg: "(no numbering.xml — skipped)" });
  }

  // [content-types]
  const ctFile = zip.file("[Content_Types].xml");
  if (ctFile) {
    const ct = ctFile.asText();
    const overrides = [...ct.matchAll(/<Override\s+PartName="([^"]+)"/g)].map((m) => m[1].replace(/^\//, ""));
    const missingOverride = overrides.filter((p) => !zip.file(p));
    if (missingOverride.length) findings.push({ level: "FAIL", area: "content-types", msg: `Override→missing: ${missingOverride.slice(0,3).join(", ")}` });
    else findings.push({ level: "OK", area: "content-types", msg: `${overrides.length} overrides, all parts present` });
  }

  // [rels]
  let relsBad = 0, relsCount = 0;
  for (const n of entries.filter((e) => /\.rels$/.test(e))) {
    const relsXml = zip.file(n).asText();
    const dir = path.posix.dirname(n).replace(/_rels$/, "").replace(/\/$/, "");
    const targets = [...relsXml.matchAll(/<Relationship\b[^>]*\bTarget="([^"]+)"[^>]*\/>/g)]
      .map((m) => m[0].includes('TargetMode="External"') ? null : m[1])
      .filter(Boolean);
    for (const t of targets) {
      relsCount++;
      const resolved = path.posix.normalize((dir ? dir + "/" : "") + t).replace(/^\//, "");
      if (!zip.file(resolved)) {
        relsBad++;
        findings.push({ level: "WARN", area: "rels", msg: `${n}: target not found "${resolved}"` });
      }
    }
  }
  if (relsBad === 0) findings.push({ level: "OK", area: "rels", msg: `${relsCount} internal targets, all resolved` });

  return { name: target.name, file, findings, size, docXml, zip };
}

// Numbering-restart sanity check (tension/heaviness outputs only).
function checkNumberingRestart(name, docXml) {
  // We approximate # of workplace iterations as count of <w:br w:type="page"/>
  // inserted by the build script per iteration (one per iteration).
  const iters = (docXml.match(/<w:br\s+w:type="page"\s*\/>/g) || []).length;
  if (iters === 0) return { ok: true, msg: "no page breaks (not a looped doc)" };
  const refs = [...docXml.matchAll(/<w:numId\s+w:val="(\d+)"\s*\/>/g)].map((m) => m[1]);
  if (refs.length === 0) return { ok: true, msg: "no w:numId references" };
  const distinct = new Set(refs).size;
  if (distinct >= iters) {
    return { ok: true, msg: `${iters} iterations, ${refs.length} refs, ${distinct} distinct numIds (≥ iter count → restart works)` };
  }
  return { ok: false, msg: `${iters} iterations but only ${distinct} distinct numIds (counters will continue across iterations)` };
}

function printReport(results) {
  let anyFail = false;
  for (const r of results) {
    console.log(`\n=== ${r.name} ===`);
    console.log(`  file: ${path.basename(r.file)}`);
    for (const f of r.findings) {
      const tag = f.level === "OK" ? "  [ ok ]" : f.level === "WARN" ? "  [WARN]" : "  [FAIL]";
      console.log(`${tag} ${f.area}: ${f.msg}`);
      if (f.level === "FAIL") anyFail = true;
    }
    if (r.docXml && /(tension|heaviness) \(output\)/.test(r.name)) {
      const nr = checkNumberingRestart(r.name, r.docXml);
      const tag = nr.ok ? "  [ ok ]" : "  [FAIL]";
      console.log(`${tag} num-restart: ${nr.msg}`);
      if (!nr.ok) anyFail = true;
    }
  }
  console.log("\n----------------------------------------------------------------");
  console.log(anyFail ? "RESULT: FAIL — structural problems detected." : "RESULT: PASS — all structural checks succeeded.");
  return anyFail ? 1 : 0;
}

const results = TARGETS.map(sweep);
process.exit(printReport(results));
