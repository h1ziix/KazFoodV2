// scripts/lib/safe-injector.js
//
// SAFE PLACEHOLDER INJECTION FOR DOCX TEMPLATE BUILDERS.
//
// Design rule (NON-NEGOTIABLE):
//   Any region of word/document.xml (or header*.xml / footer*.xml) that does
//   NOT receive a placeholder must remain byte-identical to the source DOCX.
//
// What this means in practice:
//   * We never rebuild <w:p>, <w:r>, <w:tbl> or <w:tr> wrappers.
//   * We never strip xml:space, w:rsid*, w:lang, w14:paraId, w14:textId,
//     <w:rPr>, <w:bookmarkStart/End>, <w:proofErr/>, MathML, drawings, …
//   * We never regex-replace whole paragraphs or table blocks.
//   * We never `.replace(/<w:r>…/g, …)` across arbitrary XML.
//
// What the injector DOES do:
//   * Find a specific <w:t …>EXACT</w:t> text node and rewrite ONLY its
//     inner text. The <w:t> element attributes (xml:space, w:rsid*, …) and
//     all surrounding XML are preserved verbatim.
//   * When a placeholder needs to span runs that Word's spell checker split
//     across N adjacent <w:t> nodes inside ONE paragraph (e.g. "5" + "5"
//     for the value 55), we splice the placeholder into the FIRST <w:t> of
//     the group and EMPTY the partner <w:t> nodes — preserving every
//     <w:r>/<w:rPr>/<w:proofErr>/<w:bookmark*> in between unchanged. No
//     run wrappers are dropped, no rPr is mutated, no run order changes.
//
// Helpers exported:
//   * xmlEscape(s)                          – &, <, > escaping for text data
//   * escapeRegex(s)
//   * replaceTextNodeOnly(xml, exact, newText, opts?)
//                                           – text-only replace inside <w:t>
//   * spliceAdjacentTextNodes(xml, runTexts, placeholder, opts?)
//                                           – fuse fragmented <w:t> spans
//                                             without rebuilding runs
//
// Every helper returns { xml, replaced } and never throws on zero matches
// unless the caller sets `requireMin`.
//
// IMPORTANT: this file deliberately contains NO functions that rewrite a
// <w:r> or <w:p> wrapper. Such "destructive" helpers belong elsewhere and
// must be audited individually.

"use strict";

function xmlEscape(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Replace the inner text of every <w:t …>EXACT</w:t> node whose body
// equals `exact`. Preserves every attribute on the <w:t> element
// (xml:space, w:rsid*, …) and every byte outside the text node.
//
// Returns { xml, replaced }. If `opts.requireMin` is given and fewer
// replacements occurred, throws.
//
// NOTE: `exact` is matched against the raw XML body of <w:t>. That body is
// already XML-escaped in the source (e.g. "&amp;" for "&"). Callers should
// pass the literal as it appears in the file. For human text without
// XML metacharacters this is the same as the visible text.
function replaceTextNodeOnly(xml, exact, newText, opts) {
  const requireMin = opts && typeof opts.requireMin === "number"
    ? opts.requireMin
    : 0;
  const requireMax = opts && typeof opts.requireMax === "number"
    ? opts.requireMax
    : Infinity;
  const escaped = escapeRegex(exact);
  // Capture the <w:t …> opening tag verbatim — including any attributes —
  // and re-emit it unchanged. Only the text body is rewritten.
  const re = new RegExp(`(<w:t(?:\\s[^>]*)?>)${escaped}(</w:t>)`, "g");
  let replaced = 0;
  const next = xml.replace(re, (_full, open, close) => {
    replaced += 1;
    return `${open}${xmlEscape(newText)}${close}`;
  });
  if (replaced < requireMin) {
    throw new Error(
      `replaceTextNodeOnly: expected >= ${requireMin} matches of "${exact}", got ${replaced}`,
    );
  }
  if (replaced > requireMax) {
    throw new Error(
      `replaceTextNodeOnly: expected <= ${requireMax} matches of "${exact}", got ${replaced}`,
    );
  }
  return { xml: next, replaced };
}

// Splice a placeholder into a group of adjacent <w:t> nodes whose bodies
// equal `runTexts[0]`, `runTexts[1]`, … in order, where the only XML
// between consecutive nodes consists of run/paragraph-internal markup
// that Word inserts when it fragments a span (other <w:r>/<w:rPr>/<w:t>
// pairs that own the partner pieces, plus <w:proofErr/>,
// <w:bookmarkStart/End/>, <w:lastRenderedPageBreak/>). The first <w:t>
// node receives `placeholder`; the partner <w:t> nodes are emptied.
//
// The surrounding <w:r> wrappers, their <w:rPr>, the paragraph wrapper
// and every <w:proofErr>/<w:bookmark*> remain byte-identical — only the
// text content of the matching <w:t> nodes changes.
//
// Use this for source fragments like
//   <w:r><w:rPr>…bold…</w:rPr><w:t>5</w:t></w:r>
//   <w:r><w:rPr>…bold…</w:rPr><w:t>5</w:t></w:r>
// which together render "55" and should map to `{count}`.
//
// Returns { xml, replaced }. Throws if zero matches and requireMin > 0,
// or if more than one match is found inside any single paragraph (the
// caller almost certainly meant exactly one).
function spliceAdjacentTextNodes(xml, runTexts, placeholder, opts) {
  if (!Array.isArray(runTexts) || runTexts.length < 2) {
    throw new Error(
      "spliceAdjacentTextNodes: runTexts must be an array of >=2 fragments",
    );
  }
  const requireMin = opts && typeof opts.requireMin === "number"
    ? opts.requireMin
    : 0;
  const requireMax = opts && typeof opts.requireMax === "number"
    ? opts.requireMax
    : Infinity;
  // Window between consecutive matching <w:t> bodies: at most one closing
  // </w:r> followed by any number of run-internal markers and partner
  // <w:r>…<w:t>…</w:t>…</w:r> wrappers — but NOT another <w:p> boundary
  // (no </w:p> allowed between fragments).
  const between =
    `(?:(?!</w:p>)(?:` +
    `</w:r>|` +
    `<w:r\\b[^>]*>|` +
    `<w:rPr>[\\s\\S]*?</w:rPr>|` +
    `<w:proofErr[^>]*/>|` +
    `<w:bookmarkStart[^>]*/>|` +
    `<w:bookmarkEnd[^>]*/>|` +
    `<w:lastRenderedPageBreak[^>]*/>|` +
    `<w:t(?:\\s[^>]*)?>[\\s\\S]{0,400}?</w:t>|` +
    `\\s+` +
    `))*?`;
  const head =
    `(<w:t(?:\\s[^>]*)?>)${escapeRegex(runTexts[0])}(</w:t>)`;
  const tail = runTexts
    .slice(1)
    .map(
      (t) =>
        `(${between})(<w:t(?:\\s[^>]*)?>)${escapeRegex(t)}(</w:t>)`,
    )
    .join("");
  const re = new RegExp(head + tail, "g");
  let replaced = 0;
  const next = xml.replace(re, (...args) => {
    replaced += 1;
    // args layout:
    //   [0] full match, [1] head-open, [2] head-close,
    //   then groups of 4: between, open, close
    const headOpen = args[1];
    const headClose = args[2];
    let out = `${headOpen}${xmlEscape(placeholder)}${headClose}`;
    let i = 3;
    for (let f = 1; f < runTexts.length; f++) {
      const betweenSrc = args[i];
      const partnerOpen = args[i + 1];
      const partnerClose = args[i + 2];
      // Emit the between region verbatim and an EMPTY partner <w:t>
      // (with xml:space="preserve" so Word does not auto-trim).
      const safeOpen = /xml:space=/.test(partnerOpen)
        ? partnerOpen
        : partnerOpen.replace(/<w:t\b/, '<w:t xml:space="preserve"');
      out += `${betweenSrc}${safeOpen}${partnerClose}`;
      i += 3;
    }
    return out;
  });
  if (replaced < requireMin) {
    throw new Error(
      `spliceAdjacentTextNodes: expected >= ${requireMin} matches of [${runTexts
        .map((t) => JSON.stringify(t))
        .join(", ")}], got ${replaced}`,
    );
  }
  if (replaced > requireMax) {
    throw new Error(
      `spliceAdjacentTextNodes: expected <= ${requireMax} matches of [${runTexts
        .map((t) => JSON.stringify(t))
        .join(", ")}], got ${replaced}`,
    );
  }
  return { xml: next, replaced };
}

module.exports = {
  xmlEscape,
  escapeRegex,
  replaceTextNodeOnly,
  spliceAdjacentTextNodes,
};
