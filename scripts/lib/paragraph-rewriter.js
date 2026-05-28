// scripts/lib/paragraph-rewriter.js
//
// ⚠️  DESTRUCTIVE PRIMITIVE — USE ONLY AS A LAST RESORT.  ⚠️
//
// This file exists because a small number of paragraphs in the intro
// source DOCX cannot be parameterised with the safe injectors in
// scripts/lib/safe-injector.js:
//
//   * The visible text is heavily fragmented across <w:t> nodes
//     (e.g. each digit of "55" is its own run), AND
//   * Large portions of the prose are encoded in such a way that the
//     <w:t> bodies in the source XML are not the human-readable text we
//     want to keep — so we cannot match them with replaceTextNodeOnly.
//
// For those paragraphs we accept a fidelity tradeoff: we rewrite the
// inner runs of the paragraph from scratch, BUT we preserve:
//
//   * the outer <w:p ...> element (paraId, textId, rsid*, style refs),
//   * the existing <w:pPr> block (numbering, indent, spacing, jc, …),
//   * any <w:bookmarkStart/End> siblings that live inside the paragraph
//     before <w:pPr> or directly inside <w:p> outside <w:pPr>,
//   * any <w:proofErr/> siblings inside the paragraph that wrap run
//     boundaries (we drop them — they are spell-checker artefacts and
//     have no layout effect).
//
// RULES OF USE
//   * Do NOT use this primitive for paragraphs whose visible <w:t>
//     bodies match the intended placeholder context — use
//     replaceTextNodeOnly / spliceAdjacentTextNodes from safe-injector
//     instead.
//   * Each call must target exactly one paragraph by its w14:paraId.
//     Throws if zero or >1 matches.
//   * The caller supplies the inner-runs XML. The primitive does not
//     touch <w:p> attributes or <w:pPr>.

"use strict";

function replaceParagraphInner(xml, paraId, innerRunsXml) {
  const re = new RegExp(
    `<w:p\\b([^>]*\\sw14:paraId="${paraId}"[^>]*)>([\\s\\S]*?)</w:p>`,
    "g",
  );
  const matches = [...xml.matchAll(re)];
  if (matches.length === 0) {
    throw new Error(`replaceParagraphInner: paraId=${paraId} not found`);
  }
  if (matches.length > 1) {
    throw new Error(
      `replaceParagraphInner: paraId=${paraId} matched ${matches.length}× (expected exactly 1)`,
    );
  }
  const m = matches[0];
  const attrs = m[1];
  const inner = m[2];

  // Preserve the existing <w:pPr> verbatim (layout/numbering/spacing).
  const pPrMatch = inner.match(/<w:pPr>[\s\S]*?<\/w:pPr>/);
  const pPr = pPrMatch ? pPrMatch[0] : "";

  // Preserve <w:bookmarkStart/End> nodes that live inside the paragraph
  // (Word treats bookmark anchors as paragraph-scope siblings of runs;
  // dropping them silently breaks references and TOC entries).
  const bookmarkRe = /<w:bookmark(?:Start|End)[^>]*\/>/g;
  const bookmarks = inner.match(bookmarkRe) || [];

  const replacement =
    `<w:p${attrs}>${pPr}${bookmarks.join("")}${innerRunsXml}</w:p>`;
  return xml.slice(0, m.index) + replacement + xml.slice(m.index + m[0].length);
}

module.exports = { replaceParagraphInner };
