import type PizZip from "pizzip";

/**
 * Per-iteration numbering-list restart for templates whose loop body
 * contains <w:numId w:val="N"/> references that must restart counters on
 * every workplace iteration.
 *
 * BUILD-TIME (scripts/build-tension-template.js, build-heaviness-template.js):
 *   Each <w:numId w:val="N"/> INSIDE the {#workplaces}…{/workplaces} loop
 *   body is rewritten to a sentinel `<w:numId w:val="__NUMID_${N}_SLOT_${K}__"/>`
 *   where N is the original numId value and K is a stable per-slot index
 *   (one slot per distinct numId reference position in the loop body).
 *
 * RUN-TIME (this helper, invoked via engine.renderBlob postProcess hook):
 *   The hook groups sentinels by original numId N PER ITERATION, not per
 *   slot. All references to the same N within one workplace iteration
 *   must collapse to a SINGLE numId so that Word treats them as one
 *   continuous list (e.g. items 1..6 of a six-paragraph list inside one
 *   workplace must share one <w:num> so they get numbered 1, 2, 3, 4, 5,
 *   6 — not six separate "1." starts).
 *
 *   Iteration boundaries are detected via SLOT_0: build-time assigns
 *   slot indices in document order starting at 0, so the K=0 sentinel
 *   for any given N is guaranteed to be the FIRST sentinel of that N in
 *   every iteration. Algorithm:
 *
 *   1. Walk sentinels in document order.
 *   2. On `__NUMID_<N>_SLOT_0__`: open a new iteration for N.
 *        – iteration #0 → mapped numId = N (original, no clone)
 *        – iteration #i (i ≥ 1) → allocate fresh numId, clone the
 *          original <w:num w:numId="N"><w:abstractNumId w:val="X"/></w:num>
 *          in word/numbering.xml pointing at the SAME abstractNumId
 *          (Word restarts each <w:num> instance from its `start` value).
 *   3. On `__NUMID_<N>_SLOT_<K!=0>__`: reuse the mapped numId of N's
 *      current iteration. If no iteration is open yet (malformed input
 *      or unusual slot order) fall back to the original N.
 *
 * NOTE: A line-by-line CommonJS twin lives at
 * src/lib/docs/numberingRestart.cjs and is required by Node-side test
 * scripts (scripts/test-tension.js, scripts/test-heaviness.js) because
 * tsconfig has allowJs:false. If you change one, change the other.
 */
export function restartListNumberingPerLoop(zip: PizZip): void {
  const docFile = zip.file("word/document.xml");
  const numFile = zip.file("word/numbering.xml");
  if (!docFile || !numFile) return;

  let docXml = docFile.asText();
  if (docXml.indexOf("__NUMID_") === -1) return;

  let numXml = numFile.asText();

  const existingIds: number[] = [];
  const idRe = /<w:num w:numId="(\d+)"/g;
  let m: RegExpExecArray | null;
  while ((m = idRe.exec(numXml)) !== null) {
    existingIds.push(Number(m[1]));
  }
  let nextId = existingIds.length > 0 ? Math.max(...existingIds) + 1 : 1;

  // Cache of original <w:num w:numId="N"> definitions keyed by N.
  // We capture the abstractNumId AND the set of ilvl values defined on
  // that abstractNum so we can emit <w:lvlOverride><w:startOverride/>
  // entries for every level when we clone — without lvlOverride entries
  // Word frequently CONTINUES the list counter across two <w:num>
  // instances that share the same abstractNumId (observed in Word 2016
  // and 365), even though they are nominally independent. The override
  // forces a hard restart at 1 for the cloned instance.
  type NumDef = { abstractId: string; raw: string; ilvls: string[] };
  const defCache = new Map<string, NumDef>();
  const ilvlsByAbstract = new Map<string, string[]>();
  function getIlvlsForAbstract(abstractId: string): string[] {
    const cached = ilvlsByAbstract.get(abstractId);
    if (cached) return cached;
    const re = new RegExp(
      `<w:abstractNum\\s+w:abstractNumId="${abstractId}"[\\s\\S]*?</w:abstractNum>`,
    );
    const mm = numXml.match(re);
    const out: string[] = [];
    if (mm) {
      const lvlRe = /<w:lvl\s+w:ilvl="(\d+)"/g;
      let lm: RegExpExecArray | null;
      while ((lm = lvlRe.exec(mm[0])) !== null) out.push(lm[1]);
    }
    if (out.length === 0) out.push("0");
    ilvlsByAbstract.set(abstractId, out);
    return out;
  }
  function getOriginalDef(originalNumId: string): NumDef | null {
    if (defCache.has(originalNumId)) return defCache.get(originalNumId)!;
    const re = new RegExp(
      `<w:num\\s+w:numId="${originalNumId}"[\\s\\S]*?<\\/w:num>`,
    );
    const mm = numXml.match(re);
    if (!mm) return null;
    const raw = mm[0];
    const abs = raw.match(/<w:abstractNumId\s+w:val="(\d+)"/);
    if (!abs) return null;
    const def: NumDef = {
      abstractId: abs[1],
      raw,
      ilvls: getIlvlsForAbstract(abs[1]),
    };
    defCache.set(originalNumId, def);
    return def;
  }

  // Build a cloned <w:num> XML with explicit lvlOverride/startOverride
  // entries for every defined ilvl of the abstract. ECMA-376 CT_Num
  // requires children in order: abstractNumId, lvlOverride*.
  function buildClone(newId: string, def: NumDef): string {
    let s =
      `<w:num w:numId="${newId}"><w:abstractNumId w:val="${def.abstractId}"/>`;
    for (const ilvl of def.ilvls) {
      s += `<w:lvlOverride w:ilvl="${ilvl}"><w:startOverride w:val="1"/></w:lvlOverride>`;
    }
    s += "</w:num>";
    return s;
  }

  const seenSlot0Count = new Map<string, number>();
  // Active mapping per origId for the CURRENT iteration. Updated each
  // time we encounter a SLOT_0 sentinel for that origId; non-zero slots
  // read this map to reuse the iteration's mapped numId.
  const currentMapping = new Map<string, string>();
  const additions: string[] = [];

  const sentinelRe =
    /<w:numId\s+w:val="__NUMID_(\d+)_SLOT_(\d+)__"\s*\/>/g;

  docXml = docXml.replace(sentinelRe, (_match, origIdStr, slotStr) => {
    if (slotStr === "0") {
      // Iteration boundary for this origId.
      const iterIdx = seenSlot0Count.get(origIdStr) ?? 0;
      seenSlot0Count.set(origIdStr, iterIdx + 1);
      if (iterIdx === 0) {
        // First iteration: keep the original numId.
        currentMapping.set(origIdStr, origIdStr);
        return `<w:numId w:val="${origIdStr}"/>`;
      }
      // Subsequent iteration: clone a fresh numId pointing at the same
      // abstractNumId so Word restarts the counter for this iteration.
      const def = getOriginalDef(origIdStr);
      if (!def) {
        currentMapping.set(origIdStr, origIdStr);
        return `<w:numId w:val="${origIdStr}"/>`;
      }
      const newId = String(nextId++);
      additions.push(buildClone(newId, def));
      currentMapping.set(origIdStr, newId);
      return `<w:numId w:val="${newId}"/>`;
    }
    // Non-zero slot: reuse the mapping established by the most recent
    // SLOT_0 for this origId. This is what collapses all sentinels of
    // the same origId within one iteration onto a SINGLE numId.
    const mapped = currentMapping.get(origIdStr);
    if (mapped !== undefined) {
      return `<w:numId w:val="${mapped}"/>`;
    }
    // Defensive fallback: malformed sentinel order (non-zero slot seen
    // before any slot 0). Keep the original numId rather than corrupt
    // the document.
    return `<w:numId w:val="${origIdStr}"/>`;
  });

  if (additions.length > 0) {
    // ECMA-376 CT_Numbering requires strict order:
    //   numPicBullet* -> abstractNum* -> num* -> numIdMacAtCleanup?
    // Inserting just before </w:numbering> places clones AFTER any
    // <w:numIdMacAtCleanup>, which violates the schema and causes Word to
    // reject the document ("Word found unreadable content"). Insert
    // immediately after the LAST </w:num> instead, falling back to the
    // earliest schema-trailing element if no <w:num> exists yet.
    const insertIdx = findNumInsertionIndex(numXml);
    if (insertIdx === -1) {
      throw new Error(
        "restartListNumberingPerLoop: no insertion point found in numbering.xml",
      );
    }
    numXml =
      numXml.slice(0, insertIdx) + additions.join("") + numXml.slice(insertIdx);
    zip.file("word/numbering.xml", numXml);
  }
  zip.file("word/document.xml", docXml);
}

/**
 * Locate the byte offset in numbering.xml at which freshly cloned
 * <w:num> elements may be inserted without violating ECMA-376's
 * CT_Numbering child sequence
 * (numPicBullet* -> abstractNum* -> num* -> numIdMacAtCleanup?).
 *
 * Strategy:
 *   1. If any <w:num …> exists, insert immediately after the LAST
 *      </w:num> close tag — keeps clones inside the `num*` band.
 *   2. Otherwise insert just before the first schema-trailing element
 *      (<w:numIdMacAtCleanup …>) if present.
 *   3. Otherwise fall back to just before </w:numbering>.
 *
 * Returns -1 only when </w:numbering> itself cannot be found (malformed).
 */
export function findNumInsertionIndex(numXml: string): number {
  const lastNumClose = numXml.lastIndexOf("</w:num>");
  if (lastNumClose !== -1) {
    return lastNumClose + "</w:num>".length;
  }
  const macAt = numXml.search(/<w:numIdMacAtCleanup\b/);
  if (macAt !== -1) return macAt;
  const closeIdx = numXml.lastIndexOf("</w:numbering>");
  return closeIdx;
}
