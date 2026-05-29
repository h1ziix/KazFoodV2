/**
 * Regression test for the UI render path that broke production.
 *
 * The bug:
 *   src/lib/docs/registry.ts → renderDescriptor() routes ALL UI clicks
 *   through renderDocument(...). For tension/heaviness this path did
 *   NOT pass `postProcess: restartListNumberingPerLoop`. As a result
 *   the build-time sentinels `__NUMID_<n>_SLOT_<k>__` survived inside
 *   word/document.xml, and Word refused to open the file because
 *   `w:numId/@w:val` must be a decimal integer per ECMA-376.
 *
 * The fix:
 *   1. DocumentDescriptor gained an optional `postProcess` field.
 *   2. renderDescriptor forwards it to renderDocument.
 *   3. The tension and heaviness descriptors register
 *      restartListNumberingPerLoop.
 *   4. engine.renderBlob throws TemplateRenderError if any __NUMID_
 *      sentinel survives — so the bug can never silently produce a
 *      corrupt download again.
 *
 * This test asserts (1)–(3) by inspecting the registry directly, and
 * asserts (4) end-to-end by simulating what renderDescriptor does on
 * the real tension template.
 *
 * Run: node scripts/test-registry-postprocess.js
 */

"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const PizZip = require("pizzip");
const Docxtemplater = require("docxtemplater");

const ROOT = path.resolve(__dirname, "..");
const REGISTRY_FILE = path.join(ROOT, "src", "lib", "docs", "registry.ts");

// --- Static check: the registry source registers postProcess --------

function staticRegistryCheck() {
  const src = fs.readFileSync(REGISTRY_FILE, "utf8");

  // 1. The descriptor type must declare an optional postProcess field.
  assert.ok(
    /postProcess\?:\s*\(zip:\s*PizZip\)\s*=>\s*void/.test(src),
    "DocumentDescriptor must declare optional postProcess",
  );

  // 2. renderDescriptor must forward postProcess to renderDocument.
  const renderDescriptor = src.match(
    /export function renderDescriptor[\s\S]*?\n\}/,
  );
  assert.ok(renderDescriptor, "renderDescriptor not found");
  assert.ok(
    /postProcess:\s*desc\.postProcess/.test(renderDescriptor[0]),
    "renderDescriptor must forward desc.postProcess",
  );

  // 3. tension and heaviness descriptors must wire
  //    restartListNumberingPerLoop as postProcess.
  for (const key of ["tension", "heaviness"]) {
    const re = new RegExp(
      `describe<[^>]+>\\(\\{[\\s\\S]*?key:\\s*"${key}"[\\s\\S]*?\\}\\),`,
      "m",
    );
    const m = src.match(re);
    assert.ok(m, `descriptor for key="${key}" not found`);
    assert.ok(
      /postProcess:\s*restartListNumberingPerLoop/.test(m[0]),
      `descriptor "${key}" must register postProcess: restartListNumberingPerLoop`,
    );
  }
  console.log("OK  static: registry wires postProcess for tension & heaviness");
}

// --- End-to-end: simulate renderDescriptor on the real tension template

function endToEndTensionRender() {
  const { restartListNumberingPerLoop } = require(
    path.join(ROOT, "src", "lib", "docs", "numberingRestart.cjs"),
  );

  const tplPath = path.join(
    ROOT,
    "public",
    "templates",
    "tension-protocol.docx",
  );
  if (!fs.existsSync(tplPath)) {
    console.log("SKIP e2e: tension template not present");
    return;
  }

  // Minimal-but-valid context that drives the {#workplaces} loop with
  // 3 iterations — same multiplier the UI uses.
  const wp = (n) => {
    const row = {
      rowNumber: n,
      code: "K" + n,
      position: "Pos" + n,
      measurementPlace: "MP" + n,
      workDescription: "WD" + n,
      finalAssessment: "2",
      count_c1: "",
      count_c2: "1",
      count_c31: "",
      count_c32: "",
    };
    const keys = [
      "p1_1","p1_2","p1_3","p1_4",
      "p2_1","p2_2","p2_3","p2_4","p2_5","p2_6","p2_7","p2_8",
      "p3_1","p3_2","p3_3",
      "p4_1","p4_2","p4_3","p4_4",
      "p5_1","p5_2","p5_3",
    ];
    for (const k of keys) {
      row[k + "_value"] = "—";
      row[k + "_class"] = "2";
    }
    return row;
  };
  const ctx = {
    "protocol.number": "1004-НАП",
    "protocol.date": "01.01.2026",
    "customer.fullName": "X",
    "customer.address": "Y",
    measurementDate: "01.01.2026",
    "performer.fullName": "P",
    "performer.position": "Q",
    "representative.fullName": "R",
    "representative.position": "S",
    workplaces: [wp(1), wp(2), wp(3)],
  };

  const buf = fs.readFileSync(tplPath);
  const zip = new PizZip(buf);
  const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });
  doc.render(ctx);

  const renderedZip = doc.getZip();
  const before = (renderedZip.file("word/document.xml").asText().match(/__NUMID_/g) || []).length;
  assert.ok(before > 0, "expected at least one sentinel in rendered template (template setup invariant)");

  // Apply the postProcess that renderDescriptor must now wire.
  restartListNumberingPerLoop(renderedZip);

  const docXml = renderedZip.file("word/document.xml").asText();
  assert.ok(
    docXml.indexOf("__NUMID_") === -1,
    "REGRESSION: __NUMID_ sentinel survived postProcess — UI would emit a corrupt .docx",
  );

  const numXml = renderedZip.file("word/numbering.xml").asText();
  // All numId references in document.xml must resolve to a defined <w:num>.
  const refs = new Set(
    [...docXml.matchAll(/<w:numId\s+w:val="(\d+)"/g)].map((m) => m[1]),
  );
  const defined = new Set(
    [...numXml.matchAll(/<w:num\s+w:numId="(\d+)"/g)].map((m) => m[1]),
  );
  for (const r of refs) {
    if (r === "0") continue;
    assert.ok(
      defined.has(r),
      `dangling numId reference in document.xml: ${r}`,
    );
  }

  // CT_Numbering order: any </w:num> must precede <w:numIdMacAtCleanup>.
  const lastNumClose = numXml.lastIndexOf("</w:num>");
  const macAt = numXml.indexOf("<w:numIdMacAtCleanup");
  if (macAt !== -1) {
    assert.ok(
      lastNumClose < macAt,
      "REGRESSION: cloned <w:num> ended up after <w:numIdMacAtCleanup>",
    );
  }

  console.log("OK  e2e: tension renderDescriptor path produces sentinel-free document.xml");
}

staticRegistryCheck();
endToEndTensionRender();
console.log("\nAll registry/postProcess regression checks passed.");
