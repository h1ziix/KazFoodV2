/**
 * Regression test: numberingRestart must never insert cloned <w:num>
 * elements AFTER <w:numIdMacAtCleanup> (or any other CT_Numbering
 * sequence-trailing element). Violating ECMA-376's CT_Numbering child
 * sequence causes Word to refuse the document.
 *
 * Background bug:
 *   restartListNumberingPerLoop used `lastIndexOf("</w:numbering>")`
 *   for the insertion point. When numbering.xml contained
 *   <w:numIdMacAtCleanup …/> just before </w:numbering> (which it
 *   normally does), all cloned <w:num> elements ended up after
 *   <w:numIdMacAtCleanup>, producing a schema-invalid file. Word would
 *   refuse to open it ("Ошибка Word при попытке открытия файла…").
 *
 * Run: node scripts/test-numbering-regression.js
 */

"use strict";

const assert = require("assert");
const PizZip = require("pizzip");
const {
  restartListNumberingPerLoop,
  findNumInsertionIndex,
} = require("../src/lib/docs/numberingRestart.cjs");

// --- Unit-level: findNumInsertionIndex --------------------------------

function unitFindInsertion() {
  // Case 1: numbering ends with <w:numIdMacAtCleanup/> just before </w:numbering>
  const xml1 =
    '<?xml version="1.0"?><w:numbering xmlns:w="W">' +
    '<w:abstractNum w:abstractNumId="0"/>' +
    '<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>' +
    '<w:num w:numId="2"><w:abstractNumId w:val="0"/></w:num>' +
    '<w:numIdMacAtCleanup w:val="0"/>' +
    "</w:numbering>";
  const idx1 = findNumInsertionIndex(xml1);
  const lastNumEnd = xml1.lastIndexOf("</w:num>") + "</w:num>".length;
  assert.strictEqual(idx1, lastNumEnd, "must point right after the last </w:num>");
  const macStart = xml1.indexOf("<w:numIdMacAtCleanup");
  assert.ok(idx1 <= macStart, "insertion point must precede <w:numIdMacAtCleanup>");

  // Case 2: no <w:num> yet but numIdMacAtCleanup present
  const xml2 =
    '<w:numbering xmlns:w="W">' +
    '<w:abstractNum w:abstractNumId="0"/>' +
    '<w:numIdMacAtCleanup w:val="0"/>' +
    "</w:numbering>";
  const idx2 = findNumInsertionIndex(xml2);
  assert.strictEqual(
    idx2,
    xml2.indexOf("<w:numIdMacAtCleanup"),
    "must fall back to just before <w:numIdMacAtCleanup>",
  );

  // Case 3: nothing trailing — fall back to </w:numbering>
  const xml3 = '<w:numbering xmlns:w="W"><w:abstractNum w:abstractNumId="0"/></w:numbering>';
  const idx3 = findNumInsertionIndex(xml3);
  assert.strictEqual(idx3, xml3.lastIndexOf("</w:numbering>"));

  console.log("OK  unit: findNumInsertionIndex");
}

// --- Integration: restartListNumberingPerLoop on a synthetic zip ------

function integrationRestart() {
  const numXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    '<w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:start w:val="1"/></w:lvl></w:abstractNum>' +
    '<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>' +
    '<w:num w:numId="2"><w:abstractNumId w:val="0"/></w:num>' +
    '<w:numIdMacAtCleanup w:val="0"/>' +
    "</w:numbering>";

  // Three sentinels for the same (origId=1, slot=0): first stays at numId=1,
  // second and third must allocate fresh ids and clone <w:num>.
  const docXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
    '<w:p><w:pPr><w:numPr><w:numId w:val="__NUMID_1_SLOT_0__"/></w:numPr></w:pPr></w:p>' +
    '<w:p><w:pPr><w:numPr><w:numId w:val="__NUMID_1_SLOT_0__"/></w:numPr></w:pPr></w:p>' +
    '<w:p><w:pPr><w:numPr><w:numId w:val="__NUMID_1_SLOT_0__"/></w:numPr></w:pPr></w:p>' +
    "</w:body></w:document>";

  // Minimal valid zip with just the two files we need.
  const zip = new PizZip();
  zip.file("word/numbering.xml", numXml);
  zip.file("word/document.xml", docXml);

  restartListNumberingPerLoop(zip);

  const outNum = zip.file("word/numbering.xml").asText();
  const outDoc = zip.file("word/document.xml").asText();

  // 1. No sentinel residue.
  assert.ok(outDoc.indexOf("__NUMID_") === -1, "sentinels must be replaced");

  // 2. Two new <w:num> were created (clones for occurrences #2 and #3).
  const numIds = [];
  const re = /<w:num\s+w:numId="(\d+)"/g;
  let m;
  while ((m = re.exec(outNum)) !== null) numIds.push(m[1]);
  assert.deepStrictEqual(numIds.sort(), ["1", "2", "3", "4"], "expected numIds 1..4");

  // 3. Schema order: every </w:num> must precede <w:numIdMacAtCleanup>.
  const lastNumCloseAt = outNum.lastIndexOf("</w:num>");
  const macAt = outNum.indexOf("<w:numIdMacAtCleanup");
  assert.notStrictEqual(macAt, -1, "<w:numIdMacAtCleanup> must still be present");
  assert.ok(
    lastNumCloseAt < macAt,
    "REGRESSION: cloned <w:num> ended up AFTER <w:numIdMacAtCleanup> " +
      `(lastNumCloseAt=${lastNumCloseAt}, macAt=${macAt})`,
  );

  // 4. <w:numIdMacAtCleanup> stays before </w:numbering>.
  const closeAt = outNum.lastIndexOf("</w:numbering>");
  assert.ok(macAt < closeAt, "<w:numIdMacAtCleanup> must precede </w:numbering>");

  // 5. document.xml references resolve.
  const refs = [];
  const refRe = /<w:numId\s+w:val="(\d+)"/g;
  while ((m = refRe.exec(outDoc)) !== null) refs.push(m[1]);
  for (const r of refs) {
    assert.ok(numIds.indexOf(r) !== -1, `dangling numId reference: ${r}`);
  }

  console.log("OK  integration: restartListNumberingPerLoop preserves CT_Numbering order");
}

// --- Integration: per-iteration grouping by origId --------------------
//
// Bug fixed: heaviness template has SIX paragraphs in one workplace that
// share the same original numId (logical list 1..6). Build-time assigns
// slot indices 0..5 to them. The old run-time hook treated each (N, K)
// pair independently, allocating six DIFFERENT cloned numIds for the
// second/third workplace iteration — turning a continuous "1, 2, 3, 4,
// 5, 6" list into six separate "1." starts.
//
// New contract: SLOT_0 marks an iteration boundary; subsequent non-zero
// slots within that iteration must reuse the SAME mapped numId, so the
// six paragraphs of one workplace stay on one list.
function integrationGroupingByOrigId() {
  const numXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    '<w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:start w:val="1"/></w:lvl></w:abstractNum>' +
    '<w:num w:numId="2"><w:abstractNumId w:val="0"/></w:num>' +
    "</w:numbering>";

  // Three iterations × three slots (0, 1, 2) of origId=2.
  // Expectation: each iteration collapses to ONE numId (so 3 distinct
  // numIds total across the document, not 9).
  function paraWithSentinel(k) {
    return (
      "<w:p><w:pPr><w:numPr><w:numId w:val=\"__NUMID_2_SLOT_" +
      k +
      '__"/></w:numPr></w:pPr></w:p>'
    );
  }
  function iteration() {
    return paraWithSentinel(0) + paraWithSentinel(1) + paraWithSentinel(2);
  }
  const docXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
    iteration() +
    iteration() +
    iteration() +
    "</w:body></w:document>";

  const zip = new PizZip();
  zip.file("word/numbering.xml", numXml);
  zip.file("word/document.xml", docXml);
  restartListNumberingPerLoop(zip);

  const outDoc = zip.file("word/document.xml").asText();
  const outNum = zip.file("word/numbering.xml").asText();

  assert.ok(outDoc.indexOf("__NUMID_") === -1, "sentinels must be replaced");

  // Group document numId references into the three iteration blocks
  // (each iteration produced exactly 3 paragraphs).
  const docRefs = [];
  const refRe = /<w:numId\s+w:val="(\d+)"/g;
  let m;
  while ((m = refRe.exec(outDoc)) !== null) docRefs.push(m[1]);
  assert.strictEqual(docRefs.length, 9, "expected 9 numId refs in document");

  const iter1 = docRefs.slice(0, 3);
  const iter2 = docRefs.slice(3, 6);
  const iter3 = docRefs.slice(6, 9);

  // Within each iteration, all three slots must collapse to ONE numId.
  for (const it of [iter1, iter2, iter3]) {
    assert.ok(
      it[0] === it[1] && it[1] === it[2],
      "all slots of one iteration must share the same numId; got " +
        JSON.stringify(it),
    );
  }
  // Across iterations the numIds must DIFFER (otherwise Word keeps
  // counting the list continuously).
  const distinct = new Set([iter1[0], iter2[0], iter3[0]]);
  assert.strictEqual(
    distinct.size,
    3,
    "the three iterations must use three distinct numIds; got " +
      JSON.stringify([iter1[0], iter2[0], iter3[0]]),
  );
  // First iteration must reuse the original numId.
  assert.strictEqual(iter1[0], "2", "first iteration must reuse original numId");

  // Exactly 2 new <w:num> definitions should have been added
  // (one per non-first iteration), each pointing at abstractNumId=0.
  // Cloned <w:num> elements now also carry <w:lvlOverride> children to
  // force a hard counter restart in Word, so match the full <w:num>
  // block rather than the compact form.
  const numIds = [];
  const cloneRe =
    /<w:num\s+w:numId="(\d+)">[\s\S]*?<w:abstractNumId w:val="0"\/>[\s\S]*?<\/w:num>/g;
  while ((m = cloneRe.exec(outNum)) !== null) numIds.push(m[1]);
  assert.ok(
    numIds.length === 3,
    "expected 3 <w:num> entries (original + 2 clones) referencing abstractNumId=0; got " +
      numIds.length,
  );

  // Each cloned <w:num> (everything except the original numId=2) must
  // carry a <w:startOverride w:val="1"/> for ilvl=0, otherwise Word
  // will continue counting across iterations even though numIds differ.
  for (const id of numIds) {
    if (id === "2") continue;
    const cloneBlockRe = new RegExp(
      '<w:num\\s+w:numId="' + id + '">[\\s\\S]*?</w:num>',
    );
    const block = outNum.match(cloneBlockRe);
    assert.ok(block, "clone numId=" + id + " not found in numbering.xml");
    assert.ok(
      /<w:lvlOverride\s+w:ilvl="0"><w:startOverride\s+w:val="1"\/>/.test(
        block[0],
      ),
      "clone numId=" +
        id +
        ' must contain <w:lvlOverride w:ilvl="0"><w:startOverride w:val="1"/>',
    );
  }

  console.log(
    "OK  integration: per-iteration grouping collapses same-origId slots onto one numId",
  );
}

// --- End-to-end: validate already-rendered tension/heaviness outputs --

function endToEndValidateOutputs() {
  const fs = require("fs");
  const path = require("path");
  const ROOT = path.resolve(__dirname, "..");
  const targets = [
    path.join(ROOT, "test-tension-output.docx"),
    path.join(ROOT, "test-heaviness-output.docx"),
  ];

  for (const file of targets) {
    if (!fs.existsSync(file)) {
      console.log(`SKIP e2e: ${path.basename(file)} not found`);
      continue;
    }
    const zip = new PizZip(fs.readFileSync(file));
    const numFile = zip.file("word/numbering.xml");
    if (!numFile) {
      console.log(`SKIP e2e: no numbering.xml in ${path.basename(file)}`);
      continue;
    }
    const numXml = numFile.asText();
    const lastNumClose = numXml.lastIndexOf("</w:num>");
    const macAt = numXml.indexOf("<w:numIdMacAtCleanup");
    if (macAt !== -1) {
      assert.ok(
        lastNumClose < macAt,
        `REGRESSION in ${path.basename(file)}: <w:num> appears after <w:numIdMacAtCleanup>`,
      );
    }
    console.log(`OK  e2e: ${path.basename(file)} CT_Numbering order is valid`);
  }
}

unitFindInsertion();
integrationRestart();
integrationGroupingByOrigId();
endToEndValidateOutputs();
console.log("\nAll numbering regression checks passed.");
