/**
 * Сборка DOCX-шаблона для документа №14 «Заключение / Отчёт».
 *
 * SOURCE-OF-TRUTH: «14. Заключение образец KazFood.docx» в корне репо.
 * Подход — surgical XML replacement (PizZip + минимальные правки
 * word/document.xml): мы ни в коем случае не реконструируем документ,
 * а только:
 *
 *   1. Заменяем содержимое конкретных <w:t> на docxtemplater-плейсхолдеры.
 *   2. Для MERGEFIELD «Дата_проведения» — collapse fldChar begin..end
 *      диапазона в одиночный run с сохранением оригинального w:rPr.
 *   3. В главной таблице оставляем ПЕРВУЮ data-строку (template TR)
 *      и удаляем остальные. В template TR:
 *        — внутри первой ячейки collapsим раздробленные runs
 *          (proofErr/split) до одного <w:r><w:t>{labelKk}</w:t></w:r>
 *          и одного <w:r><w:t>{labelRu}</w:t></w:r> в двух параграфах,
 *          СОХРАНЯЯ оригинальные pPr и rPr;
 *        — для шести classes-ячеек подставляем placeholder в единственный
 *          run, при этом унифицируем rPr (добавляем <w:b/> там, где его
 *          не было) — иначе при попадании значения в «не первую»
 *          колонку оно выглядело бы не bold;
 *        — оборачиваем TR циклом docxtemplater: {#rows} перед {labelKk},
 *          {/rows} после {c4}. С paragraphLoop=true docxtemplater
 *          размножит ВЕСЬ <w:tr>.
 *   4. Все прочие узлы (styles.xml, numbering.xml, theme, font tables,
 *      _rels, tblPr/tblGrid/tcPr/pPr/rPr/borders/heights) КОПИРУЮТСЯ
 *      из оригинала БЕЗ изменений.
 *
 * Все изменения сделаны над байтовыми диапазонами оригинального
 * document.xml. Никаких rebuild XML, никаких synthesize, никакого
 * упрощения формы.
 *
 * Запуск: node scripts/build-conclusion-template.js
 */

const fs = require("fs");
const path = require("path");
const PizZip = require("pizzip");

const ROOT = path.resolve(__dirname, "..");
const ORIGINAL_DOCX = path.join(
  ROOT,
  "14. Заключение ГОТОВО KazFood.docx",
);
const OUT_TEMPLATE = path.join(
  ROOT,
  "public",
  "templates",
  "conclusion-protocol.docx",
);

// ---------- helpers ----------

/** Build a <w:r>...<w:t>{placeholder}</w:t></w:r> with given rPr inner XML. */
function runWithPlaceholder(rPrInnerXml, text, preserveSpace = false) {
  const space = preserveSpace ? ' xml:space="preserve"' : "";
  return `<w:r><w:rPr>${rPrInnerXml}</w:rPr><w:t${space}>${text}</w:t></w:r>`;
}

/**
 * Replace exactly one literal <w:t...>OLD</w:t> occurrence with a new
 * <w:t...>NEW</w:t> at the SAME byte offset, preserving any xml:space
 * attribute that was already there. Throws if not found.
 */
function replaceWtExact(xml, byteStart, oldFull, newText) {
  if (xml.substr(byteStart, oldFull.length) !== oldFull) {
    throw new Error(
      `replaceWtExact: byte mismatch at ${byteStart}; expected ${JSON.stringify(
        oldFull.slice(0, 60),
      )}`,
    );
  }
  // Extract attrs (xml:space) from oldFull
  const m = oldFull.match(/^<w:t(\s[^>]*)?>([\s\S]*)<\/w:t>$/);
  if (!m) throw new Error("replaceWtExact: cannot parse oldFull");
  const attrs = m[1] || "";
  // For placeholders that may include leading/trailing spaces, force
  // xml:space="preserve" to be safe.
  const safeAttrs = /xml:space=/i.test(attrs) ? attrs : ' xml:space="preserve"';
  const replacement = `<w:t${safeAttrs}>${newText}</w:t>`;
  return xml.slice(0, byteStart) + replacement + xml.slice(byteStart + oldFull.length);
}

/** Build a list of {n, start, end, full, text} for every <w:t> in xml, in source order. */
function indexWt(xml) {
  const re = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g;
  let m;
  let i = 0;
  const out = [];
  while ((m = re.exec(xml))) {
    i++;
    out.push({
      n: i,
      start: m.index,
      end: m.index + m[0].length,
      full: m[0],
      text: m[1],
    });
  }
  return out;
}

/** Apply many edits (each: {start,end,replacement}). Edits must NOT overlap. Sorted by start desc. */
function applyEdits(xml, edits) {
  const sorted = edits.slice().sort((a, b) => b.start - a.start);
  // sanity: no overlaps
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (b.end > a.start) {
      throw new Error(
        `applyEdits: overlapping edits [${b.start}-${b.end}] vs [${a.start}-${a.end}]`,
      );
    }
  }
  let out = xml;
  for (const e of sorted) {
    out = out.slice(0, e.start) + e.replacement + out.slice(e.end);
  }
  return out;
}

/** Find the byte offset of the second <w:tbl ...> (main results table). */
function findSecondTblRange(xml) {
  const re = /<w:tbl[\s>]|<\/w:tbl>/g;
  let depth = 0;
  const starts = [];
  let m;
  while ((m = re.exec(xml))) {
    if (m[0].startsWith("</")) {
      depth--;
    } else {
      if (depth === 0) starts.push(m.index);
      depth++;
    }
  }
  if (starts.length < 2) throw new Error("Expected at least 2 top-level <w:tbl>");
  const tblStart = starts[1];
  // find matching close
  let dep = 1;
  const re2 = /<w:tbl[\s>]|<\/w:tbl>/g;
  re2.lastIndex = tblStart + 5;
  while ((m = re2.exec(xml))) {
    if (m[0].startsWith("</")) {
      dep--;
      if (dep === 0) return { start: tblStart, end: m.index + m[0].length };
    } else {
      dep++;
    }
  }
  throw new Error("Unterminated main <w:tbl>");
}

/** Find each <w:tr>...</w:tr> top-level range within a slice. */
function findTrRanges(xml, sliceStart, sliceEnd) {
  // tr cannot nest inside tr (nested table aside), so naive non-greedy works
  const re = /<w:tr[\s>][\s\S]*?<\/w:tr>/g;
  re.lastIndex = sliceStart;
  const out = [];
  let m;
  while ((m = re.exec(xml))) {
    if (m.index >= sliceEnd) break;
    out.push({ start: m.index, end: m.index + m[0].length });
  }
  return out;
}

/** Find top-level <w:tc> ranges within a <w:tr> slice (no nested tables here). */
function findTcRanges(trXml) {
  const re = /<w:tc>[\s\S]*?<\/w:tc>/g;
  const out = [];
  let m;
  while ((m = re.exec(trXml))) {
    out.push({ start: m.index, end: m.index + m[0].length, full: m[0] });
  }
  return out;
}

// ---------- MERGEFIELD collapse (date) ----------

/**
 * Inside the MERGEFIELD «Дата_проведения» (fldChar begin..end), find the
 * inner result run (the <w:r> that wraps <w:t>«10» апреля 2026 г.</w:t>),
 * preserve its rPr, and replace the WHOLE fldChar...end range with that
 * single run carrying the docxtemplater placeholder.
 */
function collapseDateMergeField(xml) {
  // Locate fldChar begin
  const beginRe = /<w:r\b[^>]*>(?:(?!<\/w:r>).)*?<w:fldChar w:fldCharType="begin"\/>(?:(?!<\/w:r>).)*?<\/w:r>/s;
  const m1 = xml.match(beginRe);
  if (!m1) throw new Error("collapseDateMergeField: fldChar begin run not found");
  const beginStart = xml.indexOf(m1[0]);
  // Locate fldChar end run (the very next one)
  const endRe = /<w:r\b[^>]*>(?:(?!<\/w:r>).)*?<w:fldChar w:fldCharType="end"\/>(?:(?!<\/w:r>).)*?<\/w:r>/s;
  endRe.lastIndex = beginStart;
  const tail = xml.slice(beginStart);
  const m2 = tail.match(endRe);
  if (!m2) throw new Error("collapseDateMergeField: fldChar end run not found");
  const endStart = beginStart + tail.indexOf(m2[0]);
  const endEnd = endStart + m2[0].length;

  const fullRange = xml.slice(beginStart, endEnd);
  // Inside this range, find the inner result run: the <w:r> that contains a <w:t>
  // (NOT instrText). It is between fldChar=separate and fldChar=end.
  const sepIdx = fullRange.indexOf('w:fldChar w:fldCharType="separate"');
  if (sepIdx < 0) throw new Error("collapseDateMergeField: separate not found");
  const afterSep = fullRange.slice(sepIdx);
  // first run-with-text after separate
  const resultRunRe = /<w:r\b[^>]*>(?:(?!<\/w:r>).)*?<w:t[\s\S]*?<\/w:t>(?:(?!<\/w:r>).)*?<\/w:r>/s;
  const rm = afterSep.match(resultRunRe);
  if (!rm) throw new Error("collapseDateMergeField: result run not found");
  // Extract rPr inner content
  const resultRun = rm[0];
  const rPrM = resultRun.match(/<w:rPr>([\s\S]*?)<\/w:rPr>/);
  let rPrInner = rPrM ? rPrM[1] : "";
  // remove noProof — это специфично для merge result, для placeholder бесполезно
  rPrInner = rPrInner.replace(/<w:noProof\s*\/>/g, "");

  // Build new placeholder run
  const placeholderText =
    "«{measurementDate.day}» {measurementDate.month} {measurementDate.year} г.";
  const newRun = runWithPlaceholder(rPrInner, placeholderText, true);

  return xml.slice(0, beginStart) + newRun + xml.slice(endEnd);
}

// ---------- main ----------

function build() {
  if (!fs.existsSync(ORIGINAL_DOCX)) {
    throw new Error(`Original DOCX not found: ${ORIGINAL_DOCX}`);
  }
  const buf = fs.readFileSync(ORIGINAL_DOCX);
  const zip = new PizZip(buf);
  const docXmlFile = zip.file("word/document.xml");
  if (!docXmlFile) throw new Error("word/document.xml not in zip");
  let xml = docXmlFile.asText();

  // ---- Step 1: scalar text replacements driven by w:t index ----
  // (Indexes obtained empirically from the unmodified original; if the
  //  source ever changes, run the diagnostic dump in /scripts/lib first.)
  const wt = indexWt(xml);
  const scalarMap = [
    { n: 56, text: "{customer.name}, {customer.address}" }, // ТОО «KazEcoFood», адрес
    { n: 68, text: "{measurementPlace}" },
    { n: 75, text: "{workplaceCodeNote}" },
    { n: 83, text: "{totalWorkplaces}" },
    { n: 84, text: "" }, // " мест" — поглощено totalWorkplaces
    { n: 209, text: "{performer.fullName}" },
    { n: 210, text: "{performer.position}" },
    { n: 211, text: "" },
    { n: 212, text: "" },
    { n: 226, text: "{laboratoryHead.fullName}" },
    { n: 228, text: "{laboratoryHead.position}" },
    { n: 240, text: "{representative.position}" },
    { n: 241, text: "" },
    { n: 242, text: "{representative.fullName}" },
  ];

  // Build edits for scalar map. Each replaces exactly the full <w:t...>...</w:t>.
  const scalarEdits = scalarMap.map(({ n, text }) => {
    const e = wt[n - 1];
    if (!e) throw new Error(`w:t #${n} not found`);
    const safeAttrs = /xml:space=/.test(e.full)
      ? e.full.match(/^<w:t(\s[^>]*)?>/)[1] || ""
      : ' xml:space="preserve"';
    return {
      start: e.start,
      end: e.end,
      replacement: `<w:t${safeAttrs}>${text}</w:t>`,
    };
  });

  // ---- Step 2: main table — collapse data rows into one template tr ----
  const tblRange = findSecondTblRange(xml);
  const trs = findTrRanges(xml, tblRange.start, tblRange.end);
  if (trs.length < 4)
    throw new Error(`main tbl has ${trs.length} tr, expected >= 4`);
  // First 3 trs are header (TR0..TR2). Data rows are TR3..end.
  const headerCount = 3;
  const templateTr = trs[headerCount]; // TR3
  const extraTrs = trs.slice(headerCount + 1); // TR4..TR15

  // Build replacement for templateTr — collapsed factor cell + 6 class cells.
  const templateTrXml = xml.slice(templateTr.start, templateTr.end);
  const newTemplateTrXml = rebuildTemplateTr(templateTrXml);

  // Edits: remove extra trs, replace template tr.
  // We must combine edits across both passes carefully, since scalarEdits
  // all live OUTSIDE the main table while tr edits live INSIDE.
  const trEdits = [];
  trEdits.push({
    start: templateTr.start,
    end: templateTr.end,
    replacement: newTemplateTrXml,
  });
  for (const t of extraTrs) {
    trEdits.push({ start: t.start, end: t.end, replacement: "" });
  }

  // sanity: scalar edits all outside tblRange
  for (const e of scalarEdits) {
    if (e.start >= tblRange.start && e.end <= tblRange.end) {
      throw new Error(
        `Scalar edit at ${e.start}-${e.end} unexpectedly inside main tbl`,
      );
    }
  }

  // ---- Step 3: apply tr + scalar edits (none overlap) ----
  xml = applyEdits(xml, [...scalarEdits, ...trEdits]);

  // ---- Step 4: collapse MERGEFIELD «Дата_проведения» ----
  // (Done last because byte offsets above are sourced from the ORIGINAL xml;
  //  but the date merge field lives at offset ~32k which is BEFORE the table
  //  edits at 37k+. To stay safe, we ran applyEdits in a single pass above
  //  WITHOUT touching the merge field; now its offsets are unchanged from
  //  the post-applyEdits xml because nothing before offset 30k was edited
  //  EXCEPT the n=56 (offset 24-25k) and earlier — those preceded merge.
  //  So we re-locate it by searching, not by byte offset.)
  xml = collapseDateMergeField(xml);

  // ---- Step 5: write back ----
  zip.file("word/document.xml", xml);

  const outBuf = zip.generate({ type: "nodebuffer", compression: "DEFLATE" });
  fs.mkdirSync(path.dirname(OUT_TEMPLATE), { recursive: true });
  fs.writeFileSync(OUT_TEMPLATE, outBuf);
  console.log(
    `OK: wrote ${OUT_TEMPLATE} (${outBuf.length} bytes, document.xml ${xml.length} chars)`,
  );
}

/**
 * Rebuild template <w:tr> so that:
 *   - tc#1 (factor): два параграфа — kk и ru, каждый со своим pPr из
 *     оригинала, но содержащий ровно один <w:r> с original rPr и
 *     <w:t>{labelKk}</w:t> / <w:t>{labelRu}</w:t>.
 *   - tc#2..tc#7 (classes): пустой <w:p> с original pPr заменяется на
 *     параграф с одним bold-run, содержащим {c2}/{c31}/{c32}/{c33}/{c34}/{c4}.
 *   - {#rows} в начале текста {labelKk}, {/rows} в конце текста {c4}.
 */
function rebuildTemplateTr(trXml) {
  const tcs = findTcRanges(trXml);
  if (tcs.length !== 7)
    throw new Error(`template tr: expected 7 tc, got ${tcs.length}`);

  // Replacements per tc:
  const newTcs = [];
  // ---- tc#1 (factor with labelKk + labelRu) ----
  newTcs.push(rebuildFactorTc(tcs[0].full));
  // ---- tc#2..tc#7 (classes) ----
  const classKeys = ["c2", "c31", "c32", "c33", "c34", "c4"];
  for (let i = 0; i < 6; i++) {
    const isLastClass = i === 5;
    let placeholder = `{${classKeys[i]}}`;
    if (isLastClass) placeholder = placeholder + "{/rows}";
    newTcs.push(rebuildClassTc(tcs[i + 1].full, placeholder));
  }

  // Build new tr: keep original outer <w:tr ...> open + <w:trPr>, then 7 new tcs, then </w:tr>.
  // We slice everything BEFORE first tc and AFTER last tc.
  const before = trXml.slice(0, tcs[0].start);
  const after = trXml.slice(tcs[6].end);
  return before + newTcs.join("") + after;
}

function rebuildFactorTc(tcFull) {
  // Find tcPr (keep it verbatim) and the paragraphs.
  const tcPrM = tcFull.match(/<w:tcPr>[\s\S]*?<\/w:tcPr>/);
  if (!tcPrM) throw new Error("factor tc: tcPr not found");
  const tcPr = tcPrM[0];

  // Find paragraphs in this tc
  const pRe = /<w:p\b[\s\S]*?<\/w:p>/g;
  const ps = [];
  let m;
  while ((m = pRe.exec(tcFull))) ps.push(m[0]);
  if (ps.length < 2)
    throw new Error(`factor tc: expected >=2 paragraphs, got ${ps.length}`);

  // Take pPr of each paragraph and replace its body (runs/proofErr) with a
  // single placeholder run that uses the rPr from the FIRST run of that paragraph.
  const kkP = collapseParagraphToPlaceholder(ps[0], "{#rows}{labelKk}");
  const ruP = collapseParagraphToPlaceholder(ps[1], "{labelRu}");

  return `<w:tc>${tcPr}${kkP}${ruP}</w:tc>`;
}

function rebuildClassTc(tcFull, placeholderText) {
  const tcPrM = tcFull.match(/<w:tcPr>[\s\S]*?<\/w:tcPr>/);
  if (!tcPrM) throw new Error("class tc: tcPr not found");
  const tcPr = tcPrM[0];
  const pM = tcFull.match(/<w:p\b[\s\S]*?<\/w:p>/);
  if (!pM) throw new Error("class tc: paragraph not found");
  const newP = ensureBoldParagraphWithPlaceholder(pM[0], placeholderText);
  return `<w:tc>${tcPr}${newP}</w:tc>`;
}

/**
 * Replace the body (runs/proofErr) of a paragraph with a single
 * <w:r><w:rPr>{firstRunRPrInner}</w:rPr><w:t xml:space="preserve">PH</w:t></w:r>,
 * preserving original <w:pPr> verbatim.
 */
function collapseParagraphToPlaceholder(pXml, placeholderText) {
  const pPrM = pXml.match(/<w:pPr>[\s\S]*?<\/w:pPr>/);
  const pPr = pPrM ? pPrM[0] : "";
  // Get rPr from first <w:r> in paragraph
  const rM = pXml.match(/<w:r\b[^>]*>([\s\S]*?)<\/w:r>/);
  let rPrInner = "";
  if (rM) {
    const rPrInnerM = rM[1].match(/<w:rPr>([\s\S]*?)<\/w:rPr>/);
    if (rPrInnerM) rPrInner = rPrInnerM[1];
  }
  // Extract opening <w:p ...> attrs
  const openM = pXml.match(/^<w:p\b([^>]*)>/);
  const pOpen = openM ? `<w:p${openM[1]}>` : "<w:p>";
  const newRun = runWithPlaceholder(rPrInner, placeholderText, true);
  return `${pOpen}${pPr}${newRun}</w:p>`;
}

/**
 * For empty class-cell paragraphs (no <w:r>), keep pPr and inject a
 * single bold placeholder run. The rPr is built by taking the paragraph's
 * default rPr (from <w:pPr><w:rPr>) if present, and ensuring <w:b/> is set.
 */
function ensureBoldParagraphWithPlaceholder(pXml, placeholderText) {
  const pPrM = pXml.match(/<w:pPr>[\s\S]*?<\/w:pPr>/);
  const pPr = pPrM ? pPrM[0] : "";
  // Try to pull <w:rPr> from inside pPr (paragraph-level mark run props)
  let rPrInner = "";
  if (pPrM) {
    const inner = pPrM[0];
    const rPrInnerM = inner.match(/<w:rPr>([\s\S]*?)<\/w:rPr>/);
    if (rPrInnerM) rPrInner = rPrInnerM[1];
  }
  // If paragraph already has a <w:r> with rPr, prefer that.
  const rM = pXml.match(/<w:r\b[^>]*>[\s\S]*?<\/w:r>/);
  if (rM) {
    const rPrInnerM = rM[0].match(/<w:rPr>([\s\S]*?)<\/w:rPr>/);
    if (rPrInnerM) rPrInner = rPrInnerM[1];
  }
  // Ensure <w:b/> present (idempotent)
  if (!/<w:b\s*\/>/.test(rPrInner) && !/<w:b\s+/.test(rPrInner)) {
    // Insert <w:b/> after rFonts if present, else at start
    if (/<w:rFonts\b[^/]*\/>/.test(rPrInner)) {
      rPrInner = rPrInner.replace(/(<w:rFonts\b[^/]*\/>)/, "$1<w:b/>");
    } else {
      rPrInner = "<w:b/>" + rPrInner;
    }
  }
  const openM = pXml.match(/^<w:p\b([^>]*)>/);
  const pOpen = openM ? `<w:p${openM[1]}>` : "<w:p>";
  const newRun = runWithPlaceholder(rPrInner, placeholderText, true);
  return `${pOpen}${pPr}${newRun}</w:p>`;
}

build();
