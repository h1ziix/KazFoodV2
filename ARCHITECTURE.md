# KazFood — Architecture

> Internal architecture & onboarding document.
> Status: registry migration **complete**; schema-helper migration **partial** (see §13).
> Scope: every claim in this file is grounded in code under `src/`. Line numbers reference the current tree.

---

## 0. TL;DR

KazFood is a single-page Next.js 15 client app that converts pasted JSON into a downloaded `.docx` file. There are 11 protocol document types. The system is **registry-driven**: one descriptor per document in `DOCUMENT_REGISTRY` wires together a Zod schema, an example payload, a `.docx` template URL, a per-document `buildContext` and a filename rule. The UI iterates that array; the engine renders any descriptor uniformly. Adding a document is one registry entry + the files it points to. No `switch (docType)` exists in the dispatch path.

| Metric | Value |
|---|---|
| Document types | 11 |
| `page.tsx` LOC | 154 |
| `DOCUMENT_REGISTRY` entries | 11 (`registry.ts:115–216`) |
| Shared layer (`src/lib/docs/*`) LOC | 635 across 7 files |
| Per-document wrappers (`src/lib/generate*Docx.ts`) | 11 files, 671 LOC |
| Zod schemas | 11 files |
| Example payloads | 11 files |
| `.docx` templates | 11 in `public/templates/` |
| Render engine surface | 1 file: `src/lib/docs/engine.ts` (100 LOC) |

---

## 1. Tech stack

| Layer | Choice | Version |
|---|---|---|
| Framework | Next.js (App Router) | `15.1.6` |
| UI | React / React DOM | `^19.0.0` |
| Language | TypeScript (`strict`) | `^5.6` |
| Validation | Zod | `^3.23.8` |
| DOCX render | docxtemplater + PizZip | `^3.50.0` / `^3.1.7` |
| Download | file-saver | `^2.0.5` |
| CSS | Tailwind 4 + PostCSS | `^4.0.0` / `^8.4` |
| Path alias | `@/* → src/*` | `tsconfig.json:25-28` |
| Scripts | `dev`, `build`, `start`, `lint`, `typecheck` | `package.json:5-11` |

There is no test runner declared in `package.json`. `test-generation.mjs` at repo root is an ad-hoc Node script that uses `Docxtemplater` + `PizZip` directly (does **not** go through `engine.ts`) and writes `test-*.docx` for manual inspection.

---

## 2. Folder architecture

```
KazFoodV2/
├── public/
│   └── templates/                         11 .docx files, fetched at runtime
│       ├── coding-protocol.docx
│       ├── conclusion-protocol.docx
│       ├── emp-protocol.docx
│       ├── heaviness-protocol.docx
│       ├── lighting-protocol.docx
│       ├── meteo-protocol.docx
│       ├── noise-protocol.docx
│       ├── safety-protocol.docx
│       ├── siz-protocol.docx
│       ├── summary-protocol.docx
│       └── tension-protocol.docx
├── src/
│   ├── app/
│   │   ├── layout.tsx                     19 LOC — html lang="ru", metadata
│   │   └── page.tsx                       154 LOC — the only page
│   ├── components/
│   │   ├── JsonInput.tsx                  16 LOC — <textarea>
│   │   └── ValidationErrors.tsx           26 LOC — red panel
│   ├── lib/
│   │   ├── docs/                          ◀── shared abstraction layer
│   │   │   ├── engine.ts                  100 LOC  fetch + render + saveAs
│   │   │   ├── registry.ts                213 LOC  DOCUMENT_REGISTRY + renderDescriptor
│   │   │   ├── flatten.ts                  52 LOC  dotted-key map
│   │   │   ├── rows.ts                    127 LOC  loop-row flatteners
│   │   │   ├── indicators.ts              101 LOC  class-column expansion
│   │   │   ├── aggregate.ts                20 LOC  sumBy
│   │   │   └── zod-helpers.ts              22 LOC  nonEmpty / optStr / formatZodIssues
│   │   ├── generate<Name>Docx.ts          11 thin wrappers
│   │   ├── <name>Schema.ts                11 zod schemas
│   │   └── <name>ExampleData.ts           11 example payloads
│   └── types/                             11 protocol interfaces
├── ARCHITECTURE.md
├── README.md (empty)
├── test-generation.mjs                    ad-hoc Node script (bypasses engine.ts)
├── next.config.ts
├── tsconfig.json
└── package.json
```

---

## 3. Overall architecture

KazFood is a **client-side single-page app**. There is no API route, no server action, no database. Three responsibilities:

| Responsibility | Module |
|---|---|
| UI / state | `src/app/page.tsx` |
| Document index (what exists, where, how to render) | `src/lib/docs/registry.ts` |
| Render engine (template I/O, DOCX produce, error model) | `src/lib/docs/engine.ts` |

Everything else (`generate*Docx.ts`, `*Schema.ts`, `*ExampleData.ts`, `types/*`) is **per-document data and transforms** consumed by the registry.

`page.tsx` has zero knowledge of any specific document type. Its only document-aware operation is `findDescriptor(docType)` at `page.tsx:32`; after that line, every branch is generic.

---

## 4. Registry-based pipeline

The registry pipeline is strictly one-directional and stateless between steps:

```
┌─────────────────┐  user input  ┌──────────────────────┐
│ <textarea>      │ ───────────► │ page.tsx state       │
│ JsonInput.tsx   │              │  docType, json       │
└─────────────────┘              └──────────┬───────────┘
                                            │ findDescriptor(docType)
                                            ▼
                              ┌──────────────────────────┐
                              │  DOCUMENT_REGISTRY[]     │
                              │  DocumentDescriptor<T>   │
                              └──────────┬───────────────┘
                                         │
                       ┌─────────────────┼────────────────────────────┐
                       ▼                 ▼                            ▼
              descriptor.schema   descriptor.buildContext    descriptor.templateUrl
                       │                 │                            │
                       ▼                 ▼                            ▼
              safeParse(json)      flatten + rows           fetch(templateUrl)
                  │                  + indicators                 │
              ValidationIssue[]    + aggregate                ArrayBuffer
                                       │                          │
                                       └─────────┬────────────────┘
                                                 ▼
                                  renderBlob(buffer, ctx)        engine.ts
                                                 │
                                                 ▼
                                  saveAs(blob, descriptor.filename(data))
```

Every per-step boundary is typed by the descriptor. No step branches on `docType`.

---

## 5. `DOCUMENT_REGISTRY`

**Path:** `src/lib/docs/registry.ts:115-216`
**Type:** `DocumentDescriptor<unknown>[]`
**Lookup:** `findDescriptor(key: string)` at `registry.ts:218-221`.

The array is the single source of truth for the document catalogue. Its order is the UI tab order (`page.tsx:110`). Entries are constructed via the internal `describe<T>()` helper (`registry.ts:107-109`) which type-erases the per-entry `T` so a heterogeneous array can hold them while keeping `schema/example/buildContext/filename` mutually consistent at the call site.

| # | `key` | `label` | Template | `filename(d)` |
|---|---|---|---|---|
| 1 | `lighting`    | Освещенность       | `/templates/lighting-protocol.docx`    | `Освещенность_${d.protocol.number}.docx` |
| 2 | `emp`         | ЭМП                | `/templates/emp-protocol.docx`         | `ЭМП_${d.protocol.number}.docx` |
| 3 | `noise`       | Шум                | `/templates/noise-protocol.docx`       | `Шум_${d.protocol.number}.docx` |
| 4 | `heaviness`   | Тяжесть            | `/templates/heaviness-protocol.docx`   | `Тяжесть_${d.protocol.number}.docx` |
| 5 | `tension`     | Напряженность      | `/templates/tension-protocol.docx`     | `Напряженность_${d.protocol.number}.docx` |
| 6 | `safety`      | Травмобезопасность | `/templates/safety-protocol.docx`      | `Травмобезопасность_${d.protocol.number}.docx` |
| 7 | `siz`         | СИЗ                | `/templates/siz-protocol.docx`         | `СИЗ_${d.protocol.number}.docx` |
| 8 | `meteo`       | Микроклимат        | `/templates/meteo-protocol.docx`       | `Микроклимат_${d.protocol.number}.docx` |
| 9 | `summary`     | Сводный протокол   | `/templates/summary-protocol.docx`     | `Сводный_протокол_${d.protocol.number}.docx` |
| 10 | `conclusion` | Заключение         | `/templates/conclusion-protocol.docx`  | `Заключение_${d.measurementDate.year}.docx` |
| 11 | `coding`     | Кодировка          | `/templates/coding-protocol.docx`      | `Кодировка_${d.approval.organization.replace(/[«»"\\/]+/g, "")}.docx` |

Schemas (`registry.ts:5-15`), examples (`registry.ts:18-28`), context builders (`registry.ts:33-43`) and protocol types (`registry.ts:47-57`) are imported in parallel blocks and wired into each `describe<T>({...})` entry.

---

## 6. `DocumentDescriptor`

**Path:** `src/lib/docs/registry.ts:67-82`

```ts
export interface DocumentDescriptor<TInput> {
  key: string;                                          // UI state id
  label: string;                                        // UI tab text
  templateUrl: string;                                  // /templates/*.docx
  schema: z.ZodType<TInput>;                            // runtime validator
  example: TInput;                                      // payload for "Загрузить пример"
  buildContext: (data: TInput) => Record<string, unknown>;
  filename: (data: TInput) => string;
}
```

Internal type-erasure constructor (`registry.ts:107`):
```ts
function describe<T>(d: DocumentDescriptor<T>): DocumentDescriptor<unknown> {
  return d as unknown as DocumentDescriptor<unknown>;
}
```

Rationale: each `describe<T>({...})` call locally enforces that `schema`, `example`, `buildContext` and `filename` agree on `T`; the public array stays a single homogeneous list the UI can iterate without generics.

---

## 7. `renderDescriptor`

**Path:** `src/lib/docs/registry.ts:89-99`

```ts
export function renderDescriptor<T>(
  desc: DocumentDescriptor<T>,
  data: T,
): Promise<void> {
  return renderDocument({
    templateUrl: desc.templateUrl,
    data,
    buildContext: desc.buildContext,
    filename: desc.filename,
  });
}
```

Thin closure that destructures a descriptor and delegates to `renderDocument` from the engine. The only render entry point used by `page.tsx` (`page.tsx:84`). Equivalent to the legacy per-document `generate<Name>Docx(data)` functions (still exported by each wrapper for backward compatibility and Node tests, but no longer called by the UI).

---

## 8. `engine.ts` — render boundary

**Path:** `src/lib/docs/engine.ts` (100 LOC). The **only** module that imports `docxtemplater`, `pizzip`, or `file-saver`. Single source of truth for MIME, error class and render mechanics.

| Export | Lines | Role |
|---|---|---|
| `const MIME_DOCX` | 19-20 | `application/vnd.openxmlformats-officedocument.wordprocessingml.document` |
| `class TemplateRenderError extends Error` | 22-29 | Wraps any docxtemplater failure. `readonly details: string[]`. `name = "TemplateRenderError"`. |
| `extractTemplateErrorDetails(err)` | 31-52 | Unpacks the docxtemplater error envelope (`err.message` + each `properties.errors[i].properties.explanation || .message`). Fallback `"Неизвестная ошибка шаблонизатора"`. |
| `renderBlob(templateBuffer, context): Blob` | 58-82 | **Pure render.** `new PizZip(buffer)` → `new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true })` → `doc.render(context)` → `doc.getZip().generate({ type: "blob", mimeType: MIME_DOCX })`. Accepts `ArrayBuffer | Buffer` so it is isomorphic. Wraps any throw in `TemplateRenderError`. |
| `fetchTemplate(url)` (private) | 84-92 | `fetch(url)` → on non-OK throws `Error("Не удалось загрузить шаблон …: <status> <statusText>")` → `arrayBuffer()`. |
| `interface RenderDocumentOptions<T>` | 94-99 | `{ templateUrl; data; buildContext; filename }` |
| `renderDocument<T>(opts): Promise<void>` | 104-109 | Browser-side: `fetchTemplate` → `renderBlob(buffer, buildContext(data))` → `saveAs(blob, filename(data))`. |

Caught by `page.tsx:87` via `err instanceof TemplateRenderError`, then unpacked as `[err.message, ...err.details]` into the fatal-errors panel.

---

## 9. Shared layer (`src/lib/docs/*`) — helper-by-helper

Every helper below was extracted from formerly-duplicated logic across the 11 `generate*Docx.ts` files. Each entry lists what it owns, who uses it, and what duplication it replaced.

### 9.1 `flatten.ts` — `src/lib/docs/flatten.ts` (52 LOC)

| Item | Detail |
|---|---|
| Exports | `interface FlattenOptions { skipKeys?: string[] }`, `function flatten(value, options?): Record<string, unknown>` |
| Purpose | docxtemplater 3.x treats `{a.b}` as a literal key `"a.b"`, not a path. `flatten` walks an object tree and emits dotted keys (`"protocol.number"`). Arrays are left as values (so loops `{#arr}` still work). |
| `skipKeys` | Top-level only. Used to keep loop arrays unflattened so the caller can re-attach them. |
| Recursion | Internal `flattenInto(value, skipKeys, prefix, out)` (`flatten.ts:34-53`). |
| Consumers | All 11 wrappers (lighting, emp, noise, heaviness, tension, safety, siz, meteo, summary, conclusion, coding). |
| Duplication removed | Two divergent signatures coexisting per-file: `flatten(value, skipKeys[], prefix, out)` (lighting/emp/noise/meteo/summary) and `flatten(value, prefix, out)` (heaviness/tension/safety/siz). Unified through one options object. |

### 9.2 `rows.ts` — `src/lib/docs/rows.ts` (127 LOC)

Three loop-row builders. All return `Record<string, unknown>[]` ready for a docxtemplater `{#loop}` block. They exist because docxtemplater 3.x has **no parent scope inside loops** — every row must carry whatever parent fields the template references.

| Export | Lines | Used by | Replaces |
|---|---|---|---|
| `interface PlaceWithMeasurements<M>` | 24-28 | – | – |
| `flattenPlacesMeasurements<M>(places, mapMeasurement)` | 37-53 | `generateNoiseDocx.ts:26`, `generateMeteoDocx.ts:25` | Two near-identical `for (place) { measurements.forEach((m, idx) => …) }` loops emitting `showPlace: idx === 0` + denormalised `placeNumber`/`placeName`. |
| `interface SectionWithRows<R>` | 57-61 | – | – |
| `flattenSectionsRows<R>(sections, mapRow, rootFlat)` | 70-86 | `generateSafetyDocx.ts:51`, `generateSizDocx.ts:46`, `generateCodingDocx.ts:69` | Three copies of `sections.map(s => ({ ...rootFlat, section_number, section_title, rows: s.rows.map(r => ({ ...rootFlat, section_number, section_title, ...mapRow(r) })) }))`. |
| `interface SummaryWorkplaceLike<F>` / `SummaryPlaceLike<F>` | 90-101 | – | – |
| `flattenWorkplaceFactors<F>(places, mapFactor)` | 112-136 | `generateSummaryProtocolDocx.ts:38` | Inline three-level (place→workplace→factor) flatten with `showSection` / first-factor blanking logic. |

### 9.3 `indicators.ts` — `src/lib/docs/indicators.ts` (101 LOC)

For DOCX cells that distribute a single value into one of N "class" columns (one column gets the value/`+`, the rest blank — pervasive in occupational-safety tables).

| Export | Lines | Detail |
|---|---|---|
| `interface ClassIndicator<C extends string>` | 17-20 | `{ value: string; class: C }` |
| `const FOUR_CLASS_SUFFIXES` | 26-31 | `{ "1":"c1", "2":"c2", "3.1":"c31", "3.2":"c32" } as const` |
| `type FourClass` | 33 | `keyof typeof FOUR_CLASS_SUFFIXES` |
| `classMark(actual, expected)` | 35-37 | Returns `"+"` or `""`. |
| `expandIndicator<C>(prefix, indicator, suffixes?)` | 47-61 | Emits `{prefix}_value` + one `{prefix}_<suffix>` per class. Default suffix map = `FOUR_CLASS_SUFFIXES`. **Used by:** `generateHeavinessDocx.ts:68`, `generateTensionDocx.ts:66`. |
| `const SIX_CLASS_SUFFIXES` | 71-78 | `{ "2":"c2", "3.1":"c31", "3.2":"c32", "3.3":"c33", "3.4":"c34", "4":"c4" } as const` |
| `type SixClass` | 80 | `keyof typeof SIX_CLASS_SUFFIXES` |
| `expandClassCount<C>(prefix, classValue, display, suffixes?, blank?)` | 94-108 | Distributes one `display` string into the column matching `classValue`; other columns get `blank` (default `""`). `classValue === ""` → all blank. **Used by:** `generateConclusionDocx.ts:42`. |

Duplication removed: identical `expandIndicator` / `classMark` implementations previously inlined in `generateHeavinessDocx.ts` and `generateTensionDocx.ts`, plus the hard-coded `{ "1":"c1", "2":"c2", "3.1":"c31", "3.2":"c32" }` class map in both files.

### 9.4 `aggregate.ts` — `src/lib/docs/aggregate.ts` (20 LOC)

| Export | Signature | Used by |
|---|---|---|
| `sumBy<T>(items, getter)` | `(readonly T[], (item: T) => number) => number` | `generateCodingDocx.ts:47` (per-section total) and `generateCodingDocx.ts:81` (grand total). |

Duplication removed: ad-hoc `arr.reduce((acc, x) => acc + x.count, 0)` patterns that would have proliferated as more aggregate-bearing documents are added.

### 9.5 `zod-helpers.ts` — `src/lib/docs/zod-helpers.ts` (22 LOC)

| Export | Lines | Notes |
|---|---|---|
| `const nonEmpty` | 13 | `z.string().min(1, "не должно быть пустым")` |
| `const optStr` | 15 | `z.string()` |
| `interface ValidationIssue` | 17-20 | `{ path: string; message: string }` |
| `formatZodIssues(error)` | 22-26 | `error.issues.map(i => ({ path: i.path.join("."), message: i.message }))` |

**Current adoption:** only `src/lib/codingSchema.ts:2` imports `nonEmpty` from here. The other ten schemas still declare their own `const nonEmpty = z.string().min(1, "не должно быть пустым")` at the top of the file. `page.tsx:6-9` and `ValidationErrors.tsx:1` still import `ValidationIssue` / `formatZodIssues` from `@/lib/lightingSchema`, where they are still re-defined (`lightingSchema.ts:64-74`). See §13 (technical debt).

### 9.6 `engine.ts` — see §8.

### 9.7 `registry.ts` — see §5–§7.

---

## 10. `buildContext` patterns

`buildContext` is the per-document transform from the validated TS object to the literal placeholder map docxtemplater expects. Signature fixed by the descriptor:

```ts
buildContext: (data: TInput) => Record<string, unknown>
```

Each `src/lib/generate<Name>Docx.ts` exports it as `buildTemplateContext(data)`. `registry.ts:33-43` imports them under aliases (`lightingCtx`, etc.). Three idiomatic patterns appear in the code:

### Pattern A — flatten root + raw arrays

Used when loops only reference their own row fields and a flat list of root keys.

| Wrapper | Lines | Snippet shape |
|---|---|---|
| `generateLightingDocx.ts` | 24-35 | `{ ...flatten(data, { skipKeys: ["lighting_measurements", "places"] }), placesList, lighting_measurements }` |
| `generateEmpDocx.ts` | 18-28 | `{ ...flatten(data, { skipKeys: ["emp_measurements", "places"] }), placesList, emp_measurements: data.emp_measurements.map(flattenMeasurement) }` |

### Pattern B — flatten root + denormalise root into every loop item

Used when the template references root fields **inside** a `{#loop}` block. docxtemplater 3 has no parent scope, so the parent flat-map is spread into each row.

| Wrapper | Lines | Loop key |
|---|---|---|
| `generateHeavinessDocx.ts` | 40-64 | `workplaces` |
| `generateTensionDocx.ts` | 40-62 | `workplaces` |
| `generateSafetyDocx.ts` | 35-53 | `sections` |
| `generateSizDocx.ts` | 30-48 | `sections` |
| `generateCodingDocx.ts` | 55-82 | `sections` |

Shape:
```ts
const rootFlat = flatten({ protocol, customer, measurementDate, performer, representative });
return {
  ...rootFlat,
  workplaces: data.workplaces.map(w => ({ ...rootFlat, ...mapWorkplace(w) })),
};
```

### Pattern C — pre-flatten loops via `rows.ts` helpers

Used when multiple hierarchy levels collapse into one sequential row stream with first-row markers.

| Wrapper | Helper | Lines |
|---|---|---|
| `generateNoiseDocx.ts` | `flattenPlacesMeasurements` | 26-29 |
| `generateMeteoDocx.ts` | `flattenPlacesMeasurements` | 25-28 |
| `generateSafetyDocx.ts` | `flattenSectionsRows` | 51 |
| `generateSizDocx.ts` | `flattenSectionsRows` | 46 |
| `generateCodingDocx.ts` | `flattenSectionsRows` (+ `sumBy`) | 69 |
| `generateSummaryProtocolDocx.ts` | `flattenWorkplaceFactors` | 38 |

### Per-wrapper shared-layer usage

| Wrapper | LOC | engine | flatten | rows | indicators | aggregate |
|---|---:|:-:|:-:|:-:|:-:|:-:|
| `generateLightingDocx.ts`         | 36 | ✓ | ✓ |   |   |   |
| `generateEmpDocx.ts`              | 54 | ✓ | ✓ |   |   |   |
| `generateNoiseDocx.ts`            | 68 | ✓ | ✓ | ✓ |   |   |
| `generateMeteoDocx.ts`            | 53 | ✓ | ✓ | ✓ |   |   |
| `generateHeavinessDocx.ts`        | 93 | ✓ + `renderBlob` | ✓ |   | ✓ |   |
| `generateTensionDocx.ts`          | 102 | ✓ + `renderBlob` | ✓ |   | ✓ |   |
| `generateSafetyDocx.ts`           | 66 | ✓ + `renderBlob` | ✓ | ✓ |   |   |
| `generateSizDocx.ts`              | 61 | ✓ + `renderBlob` | ✓ | ✓ |   |   |
| `generateSummaryProtocolDocx.ts`  | 91 | ✓ | ✓ | ✓ |   |   |
| `generateConclusionDocx.ts`       | 44 | ✓ | ✓ |   | ✓ |   |
| `generateCodingDocx.ts`           | 83 | ✓ + `renderBlob` | ✓ | ✓ |   | ✓ |

Every wrapper re-exports `TemplateRenderError` from `./docs/engine` so legacy imports like `import { TemplateRenderError } from "@/lib/generateLightingDocx"` still resolve (see §13).

---

## 11. Lifecycle / data flow

End-to-end execution of one "Сгенерировать DOCX" click:

```
page.tsx                                           registry.ts                 engine.ts
────────                                           ───────────                 ─────────
handleGenerate()
   │
   │ validate()
   │    JSON.parse(json)
   │    descriptor.schema.safeParse(parsed)
   │    └─ on failure: setIssues(formatZodIssues(error)); return null
   │
   │ setStatus({ kind: "generating" })
   │
   │ await renderDescriptor(descriptor, data) ───► renderDescriptor<T>
   │                                                  │
   │                                                  └─► renderDocument<T>({
   │                                                        templateUrl,
   │                                                        data,
   │                                                        buildContext,
   │                                                        filename,
   │                                                      })  ────────────────► fetchTemplate(templateUrl)
   │                                                                              │
   │                                                                              │  fetch → arrayBuffer
   │                                                                              ▼
   │                                                                            renderBlob(buffer, buildContext(data))
   │                                                                              │
   │                                                                              │  PizZip → Docxtemplater
   │                                                                              │  doc.render(ctx)
   │                                                                              │  ↳ on throw: TemplateRenderError(
   │                                                                              │      "Ошибка при рендеринге шаблона DOCX",
   │                                                                              │      extractTemplateErrorDetails(err))
   │                                                                              ▼
   │                                                                            saveAs(blob, filename(data))
   │
   │ catch (err instanceof TemplateRenderError)
   │    setFatalErrors([err.message, ...err.details])
   │ else
   │    setFatalErrors([err.message ?? String(err)])
   │
   └─ setStatus({ kind: "generated", message: "DOCX сгенерирован" })
```

State machine in `page.tsx:17-21`:

```
        ┌──────┐  selectDocType / resetMessages   ┌──────┐
        │ idle │ ◄──────────────────────────────► │ idle │
        └───┬──┘                                  └──────┘
            │ handleValidate (parse OK)
            ▼
        ┌──────┐
        │ valid│
        └───┬──┘
            │ handleGenerate
            ▼
        ┌──────────┐  success   ┌──────────┐
        │ generating│ ─────────► │generated │
        └────┬─────┘             └──────────┘
             │ TemplateRenderError | Error
             ▼
        ┌──────┐
        │ idle │  fatalErrors populated
        └──────┘
```

---

## 12. Adding a new document

Exact sequence — no other files are touched. Example name: `radiation`.

| # | File | Action |
|---|---|---|
| 1 | `src/types/radiation.ts` | `export interface RadiationProtocol { protocol: { number: string; ... }; ... }` |
| 2 | `src/lib/radiationSchema.ts` | `import { z } from "zod"; import { nonEmpty } from "@/lib/docs/zod-helpers"; export const radiationProtocolSchema = z.object({...});` |
| 3 | `src/lib/radiationExampleData.ts` | `import type { RadiationProtocol } from "@/types/radiation"; export const radiationExample: RadiationProtocol = {...};` |
| 4 | `public/templates/radiation-protocol.docx` | Author template. Placeholders use literal dotted keys (`{protocol.number}`) and `{#loop}…{/loop}` blocks. |
| 5 | `src/lib/generateRadiationDocx.ts` | See skeleton below. |
| 6 | `src/lib/docs/registry.ts` | Add imports for schema, example, `buildTemplateContext as radiationCtx`, `RadiationProtocol`; append one `describe<RadiationProtocol>({...})` entry to `DOCUMENT_REGISTRY`. |

Wrapper skeleton (mirrors `generateMeteoDocx.ts`):
```ts
import type { RadiationProtocol } from "@/types/radiation";
import { renderDocument, TemplateRenderError } from "./docs/engine";
import { flatten } from "./docs/flatten";
// import { flattenPlacesMeasurements } from "./docs/rows";
// import { expandIndicator } from "./docs/indicators";
// import { sumBy } from "./docs/aggregate";

const TEMPLATE_URL = "/templates/radiation-protocol.docx";

export { TemplateRenderError };

export async function generateRadiationDocx(data: RadiationProtocol): Promise<void> {
  await renderDocument({
    templateUrl: TEMPLATE_URL,
    data,
    buildContext: buildTemplateContext,
    filename: (d) => `Радиация_${d.protocol.number}.docx`,
  });
}

export function buildTemplateContext(data: RadiationProtocol): Record<string, unknown> {
  const rootFlat = flatten(data, { skipKeys: ["measurements"] });
  return { ...rootFlat, measurements: data.measurements /* or rows.ts helper */ };
}
```

Registry entry:
```ts
describe<RadiationProtocol>({
  key: "radiation",
  label: "Радиация",
  templateUrl: "/templates/radiation-protocol.docx",
  schema: radiationProtocolSchema as unknown as z.ZodType<RadiationProtocol>,
  example: radiationExample,
  buildContext: radiationCtx,
  filename: (d) => `Радиация_${d.protocol.number}.docx`,
}),
```

Files **not** touched: `page.tsx`, `engine.ts`, all other `generate*Docx.ts`, all other schemas, `ValidationErrors.tsx`, `JsonInput.tsx`. The new tab, validation, and download wire up automatically.

---

## 13. Forbidden patterns

Architectural regressions. Reject in review.

| # | Pattern | Why forbidden | Use instead |
|---|---|---|---|
| 1 | `switch (docType)` / `if (docType === "...")` outside `DOCUMENT_REGISTRY` | Reintroduces the dispatcher the registry replaced. The registry IS the dispatcher. | `findDescriptor(key)` + descriptor fields. |
| 2 | Local re-implementation of `flatten()` in any `generate*Docx.ts` | Two historical variants existed; unifying them is the whole point of `docs/flatten.ts`. | `import { flatten } from "./docs/flatten"`. |
| 3 | Inline `new Docxtemplater(...)` / `new PizZip(...)` / `saveAs(...)` outside `engine.ts` | Splits the render boundary; defeats the single error model. | `renderDocument` (browser) or `renderBlob` (Node). |
| 4 | Local `class TemplateRenderError extends Error` in any wrapper | Breaks `instanceof` checks in `page.tsx:87`. | `import { TemplateRenderError } from "./docs/engine"`, re-export if a wrapper needs to surface it. |
| 5 | Per-file class-suffix map (`{ "1":"c1", "2":"c2", "3.1":"c31", "3.2":"c32" }`) | Diverges across documents; the four/six-class maps are canonical. | `FOUR_CLASS_SUFFIXES` / `SIX_CLASS_SUFFIXES` + `expandIndicator` / `expandClassCount`. |
| 6 | Local `const nonEmpty = z.string().min(1, ...)` in new schemas | The error message would drift between documents. | `import { nonEmpty, optStr } from "@/lib/docs/zod-helpers"`. |
| 7 | Local `formatZodIssues` / `ValidationIssue` definitions | Same canonical concern as above. | Import from `@/lib/docs/zod-helpers` (target). Existing duplicates in `lightingSchema.ts:64-74` are scheduled for removal — see §15. |
| 8 | Inline `arr.reduce((a, x) => a + x.count, 0)` for totals | Spreads aggregation across wrappers. | `sumBy(arr, x => x.count)`. |
| 9 | Editing `page.tsx` to add a new document | The page is documentation-agnostic by design. | Append a `describe<T>({...})` to `DOCUMENT_REGISTRY`. |
| 10 | Inline `switch (factor.classValue)` for class-cell distribution | Currently present in `generateSummaryProtocolDocx.ts:66-89` and is **technical debt** (see §15) — do not replicate. | `expandClassCount(prefix, classValue, display)` with `SIX_CLASS_SUFFIXES`. |
| 11 | Importing `docxtemplater` / `pizzip` / `file-saver` outside `engine.ts` (production code) | Single dependency boundary. `test-generation.mjs` is an exempt ad-hoc script. | Use `engine.ts` exports. |

---

## 14. Runtime vs build-time, browser vs Node

| Concern | Where |
|---|---|
| Build-time | `next build`. The registry is statically analysable: all schemas / examples / wrappers are imported at module top level in `registry.ts:5-43`. Tree-shaking treats them as live references. Templates are static assets under `public/templates/` — they are not bundled, they are served by Next at request time. |
| Runtime (browser) | Everything in the pipeline runs in the browser: `page.tsx` is `"use client"` (line 1). `fetch("/templates/<name>.docx")` is a same-origin GET. `renderBlob` runs in the browser thread (no Web Worker today). `saveAs` from `file-saver` triggers the download. There is no server action, no API route, no server render of generated DOCX. |
| Runtime (Node) | `renderBlob` accepts `ArrayBuffer | Buffer` (`engine.ts:58-82`), making it isomorphic. Five wrappers expose a Node-friendly thin alias: `renderHeavinessBlob` (heaviness:33), `renderTensionBlob` (tension:33), `renderSafetyBlob` (safety:28), `renderSizBlob` (siz:23), `renderCodingBlob` (coding:25). These take a pre-read `Buffer` and return a `Blob`. The remaining six wrappers (lighting, emp, noise, meteo, summary, conclusion) do not export a Node alias today. |
| Ad-hoc Node script | `test-generation.mjs` at repo root does **not** route through `engine.ts`: it constructs `new Docxtemplater(...)` directly. It is a manual fixture, not a regression suite. Treat as exempt from the rules in §13 and not as production code. |
| Template error reporting | Browser only. `TemplateRenderError.details` is rendered by `ValidationErrors` (`page.tsx:168`). Node callers must catch the same class and inspect `.details` themselves. |

---

## 15. Technical debt (remaining)

These are real, present in the current tree, and tracked here because they directly affect any senior engineer changing the system.

| # | Debt | Evidence | Cost / risk |
|---|---|---|---|
| 1 | Per-schema duplicated `nonEmpty` | `lightingSchema.ts:3`, `empSchema.ts`, `noiseSchema.ts`, `heavinessSchema.ts:3`, `tensionSchema.ts`, `safetySchema.ts`, `sizSchema.ts`, `meteoSchema.ts`, `summarySchema.ts`, `conclusionSchema.ts` all declare `const nonEmpty = z.string().min(1, "не должно быть пустым")`. Only `codingSchema.ts:2` imports from `@/lib/docs/zod-helpers`. | Error-message drift if any single file is edited; 10 redundant copies. Migration is mechanical. |
| 2 | Legacy `ValidationIssue` + `formatZodIssues` in `lightingSchema.ts:64-74` | `page.tsx:6-9` and `ValidationErrors.tsx:1` import from `@/lib/lightingSchema` instead of `@/lib/docs/zod-helpers`. | The "lighting" schema file is implicitly load-bearing for the UI. Removing the lighting registry entry would break unrelated components. Migrate the two import sites and delete the legacy exports. |
| 3 | Inline class-cell `switch` in `generateSummaryProtocolDocx.ts:52-90` | `factorCells()` reproduces the very pattern `expandClassCount` exists to eliminate. | Already-extracted helper (`SIX_CLASS_SUFFIXES` + `expandClassCount`) is unused for Summary even though the rest of the file imports from `docs/*`. |
| 4 | `JsonInput.tsx:12` placeholder hard-codes `"LightingProtocol"` | Misleading for the other 10 document types. | Trivial — accept a `placeholder?: string` prop or derive from `descriptor.label`. |
| 5 | Per-wrapper `renderBlob` aliases | Five wrappers expose `render<X>Blob`; six do not. Inconsistent Node surface. | Decide policy: either expose for all 11 or drop all five (Node callers can use `renderBlob` + `buildTemplateContext` directly). |
| 6 | Legacy `generate<Name>Docx()` exported async functions | `registry.ts` no longer calls them, but every wrapper still exports them. | Kept for backward-compat; will become unused once all external callers (currently only `test-generation.mjs`, which uses `Docxtemplater` directly anyway) are gone. |
| 7 | Registry `as unknown as z.ZodType<T>` casts | `registry.ts:120, 129, …, 210` (11 sites). | The cast is required because `z.infer` and the per-document hand-written interfaces are independent. Long-term: drive interfaces with `z.infer<typeof schema>` and remove the casts. |
| 8 | No automated tests | `package.json:5-11` defines no test script; `test-generation.mjs` is manual. | No regression net for template-context shape changes. Consider a Node test harness around `renderBlob` per descriptor using `descriptor.example`. |
| 9 | `ARCHITECTURE.md` is the only architectural doc | `README.md` is 14 bytes. | Onboarding entry point is implicit. |

---

## 16. Architecture evolution

### 16.1 Before (pre-registry)

- `page.tsx` carried three parallel dispatch chains: one for example-data lookup, one for schema lookup, one for `generate<Name>Docx()` selection. Each branched on `docType`.
- Every `generate<Name>Docx.ts` was self-contained: its own `new PizZip(...)`, `new Docxtemplater(...)`, `saveAs(...)`, its own local `class TemplateRenderError`, its own local `flatten()` (two structurally divergent variants across the 11 files), its own duplicated `expandIndicator` (heaviness ≡ tension), its own hard-coded four-class suffix map.
- Schemas each declared their own `nonEmpty`. `ValidationIssue` and `formatZodIssues` lived only in `lightingSchema.ts`.
- Adding a document required edits in `page.tsx` (three branches), a new schema, a new example, a new generator that re-implemented the engine.

### 16.2 After (current state)

| Change | Result |
|---|---|
| Introduced `DOCUMENT_REGISTRY` + `DocumentDescriptor` + `findDescriptor` + `renderDescriptor` | `page.tsx` lost three `docType` branches; the single `findDescriptor(docType)` at line 32 replaces them. |
| Extracted `engine.ts` | `TemplateRenderError` has one definition (`engine.ts:22`). `renderBlob` and `renderDocument` are the only render entry points. No wrapper imports `docxtemplater`, `pizzip` or `file-saver` directly. |
| Extracted `flatten.ts` | One signature, one implementation. Eleven local copies (two variants) replaced. |
| Extracted `rows.ts` | Three multi-level row-flatten patterns (noise/meteo; safety/siz/coding; summary) deduplicated. |
| Extracted `indicators.ts` | `expandIndicator` (4-class) and `expandClassCount` (6-class) replace two identical heaviness/tension implementations and the conclusion class-cell loop. |
| Extracted `aggregate.ts` | `sumBy` replaces ad-hoc `reduce` totals (coding). |
| Extracted `zod-helpers.ts` | New canonical home for `nonEmpty`, `optStr`, `ValidationIssue`, `formatZodIssues`. Migration is **partial** (see §15 #1, #2). |

### 16.3 LOC reduction impact

The shared layer at `src/lib/docs/*` is 635 LOC. It replaces what would otherwise be:

| Pattern | Per-wrapper LOC (typical) | × 11 | One-time in shared |
|---|---:|---:|---:|
| `flatten` (both historical variants) | ~25 | ~275 | 52 |
| `TemplateRenderError` + `extractTemplateErrorDetails` | ~25 | ~275 | (within `engine.ts:22-52`) |
| `renderBlob` + fetch + saveAs glue | ~30 | ~330 | (within `engine.ts:58-109`) |
| `expandIndicator` + class map (heaviness, tension only) | ~25 | ~50 | (within `indicators.ts:35-61`) |

Even with conservative double-counting, the shared layer eliminates roughly an order of magnitude more code than it contains, while collapsing every wrapper to a thin per-document **shape transform** (the only thing that genuinely varies per document).

### 16.4 Abstractions introduced

| Abstraction | Module |
|---|---|
| **Document descriptor** (declarative document definition) | `DocumentDescriptor` |
| **Document registry** (catalogue + lookup) | `DOCUMENT_REGISTRY`, `findDescriptor` |
| **Render descriptor** (descriptor-driven render) | `renderDescriptor` |
| **Render document** (template fetch + render + save) | `renderDocument` |
| **Render blob** (pure isomorphic render) | `renderBlob` |
| **Single error type** | `TemplateRenderError`, `extractTemplateErrorDetails` |
| **Dotted-key flatten** | `flatten` + `FlattenOptions` |
| **Loop-row flatteners** | `flattenPlacesMeasurements`, `flattenSectionsRows`, `flattenWorkplaceFactors` |
| **Class-column expansion** | `expandIndicator`, `expandClassCount` + 4/6-class suffix maps |
| **Aggregation** | `sumBy` |
| **Schema primitives** | `nonEmpty`, `optStr`, `formatZodIssues`, `ValidationIssue` |

---

## 17. Future extension points

These are deliberate seams that already exist and are cheap to use without altering the architecture.

| Extension | How |
|---|---|
| **New document type** | §12. One registry entry + the files it points to. |
| **New class scale (e.g. five-class)** | Add a new `as const` suffix map in `indicators.ts` (next to `FOUR_CLASS_SUFFIXES` / `SIX_CLASS_SUFFIXES`) and pass it explicitly to `expandIndicator` / `expandClassCount`. Both helpers are generic over `C extends string` and the suffix map. |
| **New aggregator (avg, weighted, percentile)** | Add to `aggregate.ts` next to `sumBy`. Same signature pattern: `(readonly T[], (T) => number) => number`. |
| **New loop-row shape (e.g. four-level)** | Add to `rows.ts`. Mirror `flattenWorkplaceFactors` (three-level) with explicit first-row markers per level. |
| **Server-side rendering** | `renderBlob` is already isomorphic. A Next API route or server action can: `fs.readFile(template)` → `renderBlob(buffer, descriptor.buildContext(data))` → stream as `Response`. Zero engine changes; descriptor stays as the single source of truth. |
| **Worker offload** | Move `renderBlob` invocation into a Web Worker. `engine.ts:58-82` is pure — only `saveAs` in `renderDocument` is window-bound. |
| **Schema-driven types (eliminate registry casts)** | Replace each `LightingProtocol` interface with `z.infer<typeof lightingProtocolSchema>` and drop the 11 `as unknown as z.ZodType<...>` casts in `registry.ts`. |
| **Per-descriptor template precondition** | Add an optional `validateTemplate?: (zip: PizZip) => void` to `DocumentDescriptor` and call it from `renderBlob` before `doc.render`. |
| **JSON Schema export / API contract** | `zod-to-json-schema` over `DOCUMENT_REGISTRY.map(d => d.schema)` yields a stable external contract per `key`. |
| **Test harness** | One test per descriptor: `renderBlob(fs.readFileSync(template), descriptor.buildContext(descriptor.example))` must not throw. Covers the entire matrix in 11 cases with zero per-document scaffolding. |

---

## 18. Reference: file inventory (production paths only)

| Concern | Path(s) |
|---|---|
| Page / state | `src/app/page.tsx` |
| Layout | `src/app/layout.tsx` |
| UI atoms | `src/components/JsonInput.tsx`, `src/components/ValidationErrors.tsx` |
| Registry / descriptors | `src/lib/docs/registry.ts` |
| Render engine | `src/lib/docs/engine.ts` |
| Shared transforms | `src/lib/docs/flatten.ts`, `rows.ts`, `indicators.ts`, `aggregate.ts` |
| Shared validation | `src/lib/docs/zod-helpers.ts` |
| Per-doc wrappers | `src/lib/generate{Lighting,Emp,Noise,Heaviness,Tension,Safety,Siz,Meteo,SummaryProtocol,Conclusion,Coding}Docx.ts` |
| Per-doc schemas | `src/lib/{lighting,emp,noise,heaviness,tension,safety,siz,meteo,summary,conclusion,coding}Schema.ts` |
| Per-doc examples | `src/lib/exampleData.ts` (lighting), `src/lib/{emp,noise,heaviness,tension,safety,siz,meteo,summary,conclusion,coding}ExampleData.ts` |
| Per-doc types | `src/types/{lighting,emp,noise,heaviness,tension,safety,siz,meteo,summary,conclusion,coding}.ts` |
| Templates | `public/templates/*.docx` (11 files) |
