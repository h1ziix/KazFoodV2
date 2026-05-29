# DOCX templates — verification report

Date: 2026-05-29
Scope: 5 templates affected by the recent fixes — coding, safety, SIZ,
tension, heaviness.

This report covers everything that can be verified **without** opening
Microsoft Word. It does **not** replace the manual Word check listed at
the end; that step must be performed by a human before release.

---

## 1. Build + test status (automated)

All builds and tests were re-run from clean templates:

```
node scripts/build-coding-template.js
node scripts/build-safety-template.mjs
node scripts/build-siz-template.js
node scripts/build-tension-template.js
node scripts/build-heaviness-template.js

node scripts/test-coding.js
node scripts/test-safety.js
node scripts/test-siz.mjs
node scripts/test-tension.js
node scripts/test-heaviness.js
```

| Template   | Build | Test | Output file                    | Size (bytes) |
|------------|:----:|:----:|--------------------------------|-------------:|
| coding     |  ✓   |  ✓   | `test-coding-output.docx`      |      175 571 |
| safety     |  ✓   |  ✓   | `test-safety-output.docx`      |      376 750 |
| siz        |  ✓   |  ✓   | `test-siz-output.docx`         |      523 030 |
| tension    |  ✓   |  ✓   | `test-tension-output.docx`     |      904 566 |
| heaviness  |  ✓   |  ✓   | `test-heaviness-output.docx`   |      974 269 |

All test assertions pass: no `undefined`, no unrendered `{…}` tags,
expected section headers and totals present, expected per-workplace
content present.

---

## 2. Structural integrity sweep (automated)

Tool: `scripts/verify-structure.js` (run command:
`node scripts/verify-structure.js`).

What it checks per file — both for the 5 generated outputs and for the 5
original DOCX as baseline:

| Check          | Purpose                                                                                  |
|----------------|------------------------------------------------------------------------------------------|
| `zip`          | Loads via PizZip (CRC32 mismatch would throw on load).                                  |
| `xml`          | Every `*.xml` and `*.rels` part parses with `@xmldom/xmldom` in strict mode.            |
| `balance`      | Counts of opening vs closing tags match for `w:tbl`, `w:tr`, `w:tc`, `w:p`, `w:r`, `w:rPr`, `w:pPr`, `w:tcPr`, `w:tblPr`, `w:body`, `w:sectPr`. |
| `unrendered`   | No leftover `{name}` / `{#name}` / `{/name}` docxtemplater tags in document.xml.        |
| `no-undef`     | No literal `"undefined"` substring in extracted text.                                   |
| `sentinels`    | No `__NUMID_<n>_SLOT_<k>__` markers left (must be expanded by the post-render hook).    |
| `numId-refs`   | Every `<w:numId w:val="N"/>` in document.xml has a `<w:num w:numId="N">` in numbering.xml. |
| `num-abs-refs` | Every `<w:abstractNumId w:val="X"/>` points to an existing `<w:abstractNum>`.           |
| `content-types`| Every `Override@PartName` in `[Content_Types].xml` resolves to an existing zip entry.   |
| `rels`         | Every internal `Target` in `*.rels` resolves to an existing zip entry.                  |
| `num-restart`  | (tension / heaviness output only) Distinct numIds ≥ workplace iteration count.          |

### Result: PASS on all 10 files

Full output:

```
=== coding (output) ===   175 571 bytes,  15 XML parts, all checks OK
=== safety (output) ===   376 750 bytes,  18 XML parts, all checks OK
=== siz (output) ===      523 030 bytes,  20 XML parts, all checks OK
=== tension (output) ===  904 566 bytes,  19 XML parts, all checks OK
                          num-restart: 3 iterations, 3 refs, 3 distinct numIds
=== heaviness (output) == 974 269 bytes,  19 XML parts, all checks OK
                          num-restart: 3 iterations, 30 refs, 22 distinct numIds

=== coding (orig) ===     24 634 bytes
=== safety (orig) ===     52 138 bytes
=== siz (orig) ===        52 016 bytes
=== tension (orig) ===   835 558 bytes
=== heaviness (orig) ==  769 914 bytes

RESULT: PASS — all structural checks succeeded.
```

These specific checks together rule out the most common causes of
Word's repair dialog:

- Malformed XML in any part (Word's parser is strict).
- Tag-balance errors in `document.xml` (truncated rows / cells).
- Dangling `<w:numId>` references (would render bullets as empty
  paragraphs in repair mode).
- Missing relationship targets or content-type entries (Word offers to
  "recover unreadable content" instead of opening normally).

---

## 3. Per-template specific verification

### 3.1 coding (`test-coding-output.docx`)

- Row count: **35** (matches original: 1 header + 2 section + 31 data + 1 total).
- Section row "1. Административно – управленческий персонал":
  byte-equal to original (1 639 bytes including all run/rPr/pPr markup).
- Section row "2. Производственный персонал" (double space after "2."
  in original — preserved):
  byte-equal to original (1 907 bytes).
- Total row: `Итого: 55 р/м` (admin 14 + prod 41 = 55, matches injected data).
- Approval block: position, organization, full name, date — all populated.

### 3.2 safety (`test-safety-output.docx`)

- Row count: 68 in template + per-data rows = **68 rows in test output**
  (verified `tr` count 68 by sweep).
- Section rows byte-equal to original (sweep on previous diag).
- Address rendered correctly (`address window equal` was `true` on prior diag).
- Approval block: 1 occurrence of "Директор" (correct).
- No regressions in tag balance.

### 3.3 SIZ (`test-siz-output.docx`)

- Row count: **36** (matches original layout).
- Section rows byte-equal to original (admin 3 099 B, prod 2 082 B).
- 18 occurrences of "Обеспечен" (one per production-row column —
  matches expected SIZ layout).
- Address rendered correctly.

### 3.4 tension (`test-tension-output.docx`)

- 3 workplace iterations (from example data).
- Each iteration produces 1 `<w:numId>` reference (the loop body has 1
  slot). After the post-render restart hook:
  - iteration 1 uses original `w:val="2"`,
  - iteration 2 uses cloned `w:val="35"`,
  - iteration 3 uses cloned `w:val="36"`.
  All 3 clones point to the SAME `<w:abstractNumId>` (5) as the
  original, which is the documented OOXML mechanism for forcing list
  counter restart.
- numbering.xml grew from 34 → 36 defs (+2 clones), matching expectation.
- Page break (`<w:br w:type="page"/>`) appears at the end of each
  iteration, so each workplace block starts on its own page.

### 3.5 heaviness (`test-heaviness-output.docx`)

- 3 workplace iterations.
- Loop body has 10 numbering slots (4× numId=1 + 6× numId=2 per iteration).
- After the post-render restart hook:
  - iteration 1 uses original ids `{1, 2}` (4+6 = 10 refs),
  - iterations 2 + 3 use cloned ids `146..165` (10 + 10 = 20 refs).
  Total 30 refs across 22 distinct numIds (≥ 3 iterations, as required).
- numbering.xml grew from 145 → 165 defs (+20 clones).
- Each clone points to the same `<w:abstractNumId>` as its source — list
  counters will restart per workplace.
- Page break at end of each iteration.

---

## 4. Items that REQUIRE manual Microsoft Word verification

The structural sweep cannot exercise Word's layout engine. A human
must open each file in Microsoft Word and confirm the following.
**Until this step is done and confirmed, the release is not ready.**

For each of the 5 output files (`test-{coding,safety,siz,tension,heaviness}-output.docx`):

1. **Open succeeds without any dialog.** Specifically: no
   "Microsoft Word found unreadable content in …" prompt and no
   "Word experienced an error trying to open the file" prompt.
2. **No "Show Repairs" pane appears** after open (View → indicators).
3. **Page breaks match the originals.** Tension and heaviness in
   particular should show one workplace per page.
4. **Coding output:**
   - Section header rows "1. Административно – управленческий персонал"
     and "2. Производственный персонал" are visible, bold, centered in
     their merged cell, matching the original look.
   - The total row reads exactly `Итого: 55 р/м` with the same
     formatting.
5. **Safety output:**
   - Section header rows render correctly (same look as the original
     after recent fixes).
   - "Директор" approval line and signature block at the bottom unchanged.
6. **SIZ output:**
   - Section header rows render correctly.
   - "Обеспечен / Обеспеченность" column populated in each production row.
7. **Tension output:**
   - For every workplace, the numbered lists in cells of the indicators
     table restart from "1." (instead of continuing 1 → 2 → 3 across
     all workplaces).
   - Approval and signature blocks identical to the original
     workplace #2 layout.
8. **Heaviness output:**
   - Same restart check as tension: numbered lists in each workplace
     start from "1.", not continuing the previous workplace's counter.
9. **Addresses** ("Алматы қ., Турксиб ауданы, Остроумов көш., 50А үй")
   render in all relevant places and look identical to the original.
10. **Header/footer area** ("Приложение № 3 к Приказу МЗ РК…" for
    tension, similar for others) unchanged.

If anything in this list is **not** met, the issue must be fixed and
the structural sweep + this report regenerated. Only after this list
is fully confirmed by a human should the changes be committed and the
release marked ready.

---

## 5. How to re-run the verification

```
# Rebuild templates (only needed after touching scripts/build-*-template.*)
node scripts/build-coding-template.js
node scripts/build-safety-template.mjs
node scripts/build-siz-template.js
node scripts/build-tension-template.js
node scripts/build-heaviness-template.js

# Re-run tests (produces fresh test-*-output.docx)
node scripts/test-coding.js
node scripts/test-safety.js
node scripts/test-siz.mjs
node scripts/test-tension.js
node scripts/test-heaviness.js

# Structural integrity sweep
node scripts/verify-structure.js
```

Expected end state: every test prints `OK: wrote …` and the sweep
prints `RESULT: PASS`.
